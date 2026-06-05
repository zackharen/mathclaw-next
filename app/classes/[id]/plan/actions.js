"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function perfLog(action, details) {
  if (!PERF_ENABLED) return;
  const detailText = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`[perf] ${action} ${detailText}`);
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateAtUTC(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidISODate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = parseDateAtUTC(value);
  return toISODate(parsed) === value;
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextAB(current) {
  return current === "A" ? "B" : "A";
}

function buildDefaultCalendarRows(course, startDate, endDate, existingDates) {
  const start = parseDateAtUTC(startDate);
  const end = parseDateAtUTC(endDate);
  const abStart =
    course.schedule_model === "ab" && course.ab_pattern_start_date
      ? parseDateAtUTC(course.ab_pattern_start_date)
      : null;

  let currentAB = "A";
  if (abStart && abStart > start) currentAB = "A";

  const rows = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const classDate = toISODate(cursor);
    const dayWeekend = isWeekend(cursor);
    let dayType = dayWeekend ? "off" : "instructional";
    let abDay = null;

    if (course.schedule_model === "ab") {
      if (!dayWeekend && (!abStart || cursor >= abStart)) {
        abDay = currentAB;
        if (course.ab_meeting_day && abDay !== course.ab_meeting_day) dayType = "off";
        currentAB = nextAB(currentAB);
      }
    }

    if (!existingDates.has(classDate)) {
      rows.push({
        course_id: course.id,
        class_date: classDate,
        day_type: dayType,
        ab_day: abDay,
        reason_id: null,
        note: null,
      });
    }
  }

  return rows;
}

export async function generatePacingAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  if (!access?.course) return;
  const writeClient = getCourseWriteClient(access, supabase);
  await rebuildPlanFromCalendar({ supabase: writeClient, courseId, userId: user.id });

  perfLog("generatePacingAction", {
    course: courseId,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${courseId}/plan`);
  revalidatePath(`/classes/${courseId}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${courseId}/plan?calendar_updated=1&t=${Date.now()}`);
}

export async function updateCourseDateRangeAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const startDate = String(formData.get("school_year_start") || "").trim();
  const endDate = String(formData.get("school_year_end") || "").trim();

  if (
    typeof courseId !== "string" ||
    !courseId ||
    !isValidISODate(startDate) ||
    !isValidISODate(endDate) ||
    startDate >= endDate
  ) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, owner_id, schedule_model, ab_meeting_day, ab_pattern_start_date, school_year_start, school_year_end"
  );
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);
  const updatePayload = {
    school_year_start: startDate,
    school_year_end: endDate,
    updated_at: new Date().toISOString(),
  };

  if (
    course.schedule_model === "ab" &&
    (!course.ab_pattern_start_date || course.ab_pattern_start_date === course.school_year_start)
  ) {
    updatePayload.ab_pattern_start_date = startDate;
  }

  const { error: updateError } = await writeClient
    .from("courses")
    .update(updatePayload)
    .eq("id", course.id);

  if (updateError) throw new Error(updateError.message);

  const nextCourse = { ...course, ...updatePayload };

  const cleanupResults = await Promise.all([
    writeClient
      .from("course_calendar_days")
      .delete()
      .eq("course_id", course.id)
      .or(`class_date.lt.${startDate},class_date.gt.${endDate}`),
    writeClient
      .from("course_lesson_plan")
      .delete()
      .eq("course_id", course.id)
      .or(`class_date.lt.${startDate},class_date.gt.${endDate}`),
    writeClient
      .from("course_announcements")
      .delete()
      .eq("course_id", course.id)
      .or(`class_date.lt.${startDate},class_date.gt.${endDate}`),
  ]);

  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) throw new Error(cleanupError.message);

  const { data: existingDays, error: existingError } = await writeClient
    .from("course_calendar_days")
    .select("class_date")
    .eq("course_id", course.id)
    .gte("class_date", startDate)
    .lte("class_date", endDate);

  if (existingError) throw new Error(existingError.message);

  const existingDates = new Set((existingDays || []).map((day) => day.class_date));
  const rowsToInsert = buildDefaultCalendarRows(nextCourse, startDate, endDate, existingDates);

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await writeClient.from("course_calendar_days").insert(rowsToInsert);
    if (insertError) throw new Error(insertError.message);
  }

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updateCourseDateRangeAction", {
    course: course.id,
    startDate,
    endDate,
    insertedDays: rowsToInsert.length,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?date_range_updated=1&t=${Date.now()}#modify-calendar`);
}

export async function updateABMeetingDaysAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const meetAValue = formData.get("meet_a");
  const meetBValue = formData.get("meet_b");
  const meetsA = meetAValue === "on" || meetAValue === "1" || meetAValue === "true";
  const meetsB = meetBValue === "on" || meetBValue === "1" || meetBValue === "true";

  if (!courseId || typeof courseId !== "string") return;
  if (!meetsA && !meetsB) return;

  let abMeetingDay = null;
  if (meetsA && !meetsB) abMeetingDay = "A";
  if (!meetsA && meetsB) abMeetingDay = "B";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const { error } = await writeClient
    .from("courses")
    .update({ ab_meeting_day: abMeetingDay, updated_at: new Date().toISOString() })
    .eq("id", course.id);

  if (error) throw new Error(error.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updateABMeetingDaysAction", {
    course: course.id,
    abMeetingDay: abMeetingDay || "both",
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&ab_updated=1&t=${Date.now()}#modify-calendar`);
}

export async function updatePacingModeAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const pacingMode = formData.get("pacing_mode");

  if (
    typeof courseId !== "string" ||
    !courseId ||
    ![
      "one_lesson_per_day",
      "two_lessons_per_day",
      "two_lessons_unless_modified",
      "manual_complete",
    ].includes(String(pacingMode || ""))
  ) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const { error } = await writeClient
    .from("courses")
    .update({ pacing_mode: pacingMode, updated_at: new Date().toISOString() })
    .eq("id", course.id);

  if (error) throw new Error(error.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updatePacingModeAction", {
    course: course.id,
    pacingMode,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?pacing_updated=1&t=${Date.now()}`);
}


export async function markLessonCompleteAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");

  if (typeof courseId !== "string" || typeof classDate !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const { error: markError } = await writeClient
    .from("course_lesson_plan")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate);

  if (markError) throw new Error(markError.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("markLessonCompleteAction", {
    course: course.id,
    classDate,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?progress_updated=1&t=${Date.now()}`);
}

export async function markLessonPlannedAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");

  if (typeof courseId !== "string" || typeof classDate !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const { error: markError } = await writeClient
    .from("course_lesson_plan")
    .update({ status: "planned", updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate);

  if (markError) throw new Error(markError.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("markLessonPlannedAction", {
    course: course.id,
    classDate,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?progress_updated=1&t=${Date.now()}`);
}
