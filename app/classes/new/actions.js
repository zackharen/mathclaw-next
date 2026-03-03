"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";

function normalizeScheduleModel(value) {
  return value === "ab" ? "ab" : "every_day";
}

function normalizePacingMode(value) {
  return value === "manual_complete" ? "manual_complete" : "one_lesson_per_day";
}

export async function createClassAction(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes/new");
  }

  const title = String(formData.get("title") || "").trim();
  const selectedLibraryId = String(formData.get("selected_library_id") || "").trim();
  const scheduleModel = normalizeScheduleModel(String(formData.get("schedule_model") || ""));
  const abMeetingDayRaw = String(formData.get("ab_meeting_day") || "").trim();
  const abMeetingDay =
    scheduleModel === "ab" && (abMeetingDayRaw === "A" || abMeetingDayRaw === "B")
      ? abMeetingDayRaw
      : null;
  const abPatternStartDate =
    scheduleModel === "ab" ? String(formData.get("ab_pattern_start_date") || "").trim() : "";
  const schoolYearStart = String(formData.get("school_year_start") || "").trim();
  const schoolYearEnd = String(formData.get("school_year_end") || "").trim();
  const timezone = String(formData.get("timezone") || "America/New_York").trim();
  const pacingMode = normalizePacingMode(String(formData.get("pacing_mode") || ""));
  const importCourseId = String(formData.get("import_course_id") || "").trim();

  if (!selectedLibraryId || !schoolYearStart || !schoolYearEnd) {
    redirect("/classes/new?error=missing_fields");
  }

  const { data: library, error: libraryError } = await supabase
    .from("curriculum_libraries")
    .select("id, class_name")
    .eq("id", selectedLibraryId)
    .single();

  if (libraryError || !library) {
    redirect("/classes/new?error=library_not_found");
  }

  const coursePayload = {
    owner_id: user.id,
    title: title || library.class_name,
    class_name: library.class_name,
    schedule_model: scheduleModel,
    ab_meeting_day: abMeetingDay,
    ab_pattern_start_date: scheduleModel === "ab" ? abPatternStartDate || schoolYearStart : null,
    school_year_start: schoolYearStart,
    school_year_end: schoolYearEnd,
    timezone,
    selected_library_id: library.id,
    pacing_mode: pacingMode,
  };

  let { data: newCourse, error: courseError } = await supabase
    .from("courses")
    .insert(coursePayload)
    .select("id")
    .single();

  // Backward compatibility if ab_meeting_day migration was not run.
  if (
    courseError &&
    typeof courseError.message === "string" &&
    courseError.message.includes("ab_meeting_day")
  ) {
    const fallbackPayload = { ...coursePayload };
    delete fallbackPayload.ab_meeting_day;
    const retry = await supabase
      .from("courses")
      .insert(fallbackPayload)
      .select("id")
      .single();
    newCourse = retry.data;
    courseError = retry.error;
  }

  if (courseError || !newCourse) {
    throw new Error(courseError?.message || "Could not create class.");
  }

  const { error: memberError } = await supabase
    .from("course_members")
    .insert({ course_id: newCourse.id, profile_id: user.id, role: "owner" });

  if (memberError) throw new Error(memberError.message);

  let importedCount = 0;
  if (importCourseId && importCourseId !== newCourse.id) {
    const { data: sourceCourse } = await supabase
      .from("courses")
      .select("id")
      .eq("id", importCourseId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (sourceCourse) {
      const { data: sourceDays, error: sourceDaysError } = await supabase
        .from("course_calendar_days")
        .select("class_date, day_type, ab_day, reason_id, note")
        .eq("course_id", sourceCourse.id)
        .gte("class_date", schoolYearStart)
        .lte("class_date", schoolYearEnd);

      if (sourceDaysError) throw new Error(sourceDaysError.message);

      const rowsToCopy = (sourceDays || []).map((day) => ({
        course_id: newCourse.id,
        class_date: day.class_date,
        day_type: day.day_type,
        ab_day: day.ab_day,
        reason_id: day.reason_id,
        note: day.note,
      }));

      if (rowsToCopy.length > 0) {
        const { error: insertDaysError } = await supabase
          .from("course_calendar_days")
          .insert(rowsToCopy);
        if (insertDaysError) throw new Error(insertDaysError.message);
        importedCount = rowsToCopy.length;
      }
    }
  }

  if (importedCount === 0) {
    // Build default calendar by invoking same logic as "Generate Calendar".
    // We keep this lightweight by seeding calendar through the existing action path:
    const start = new Date(`${schoolYearStart}T00:00:00Z`);
    const end = new Date(`${schoolYearEnd}T00:00:00Z`);
    const rows = [];
    let currentAB = "A";
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const iso = cursor.toISOString().slice(0, 10);
      const dow = cursor.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      let dayType = weekend ? "off" : "instructional";
      let abDay = null;
      if (scheduleModel === "ab" && !weekend) {
        abDay = currentAB;
        if (abMeetingDay && abDay !== abMeetingDay) dayType = "off";
        currentAB = currentAB === "A" ? "B" : "A";
      }
      rows.push({
        course_id: newCourse.id,
        class_date: iso,
        day_type: dayType,
        ab_day: abDay,
        reason_id: null,
        note: null,
      });
    }

    const { error: seedError } = await supabase.from("course_calendar_days").insert(rows);
    if (seedError) throw new Error(seedError.message);
  }

  await rebuildPlanFromCalendar({
    supabase,
    courseId: newCourse.id,
    userId: user.id,
  });

  revalidatePath("/classes");
  revalidatePath(`/classes/${newCourse.id}/plan`);
  redirect(`/classes/${newCourse.id}/plan?calendar_updated=1&imported=${importedCount > 0 ? 1 : 0}&t=${Date.now()}`);
}
