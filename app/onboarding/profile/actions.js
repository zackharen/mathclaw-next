"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";

function parseDateAtUTC(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextAB(current) {
  return current === "A" ? "B" : "A";
}

function parseSchoolCalendarRows(formData) {
  const updates = new Map();

  for (const [key, value] of formData.entries()) {
    if (typeof key !== "string") continue;

    if (key.startsWith("day_type__")) {
      const classDate = key.replace("day_type__", "");
      const row = updates.get(classDate) || {};
      row.day_type = String(value || "");
      updates.set(classDate, row);
    }

    if (key.startsWith("reason_id__")) {
      const classDate = key.replace("reason_id__", "");
      const row = updates.get(classDate) || {};
      row.reason_id = String(value || "");
      updates.set(classDate, row);
    }

    if (key.startsWith("note__")) {
      const classDate = key.replace("note__", "");
      const row = updates.get(classDate) || {};
      row.note = String(value || "");
      updates.set(classDate, row);
    }
  }

  return updates;
}

function buildCourseCalendarRows({ course, schoolYearStart, schoolYearEnd, overrideMap }) {
  const start = parseDateAtUTC(schoolYearStart);
  const end = parseDateAtUTC(schoolYearEnd);

  const abStart =
    course.schedule_model === "ab" && course.ab_pattern_start_date
      ? parseDateAtUTC(course.ab_pattern_start_date)
      : null;

  let currentAB = "A";
  if (abStart && abStart > start) currentAB = "A";

  const rows = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
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

    const isoDate = toISODate(cursor);
    const override = overrideMap.get(isoDate);
    if (override) {
      dayType = override.day_type;
    }

    rows.push({
      course_id: course.id,
      class_date: isoDate,
      day_type: dayType,
      ab_day: abDay,
      reason_id: override?.reason_id || null,
      note: override?.note || null,
    });
  }

  return rows;
}

export async function saveAnnouncementTemplateAction(formData) {
  const bodyTemplate = formData.get("body_template");
  if (typeof bodyTemplate !== "string") {
    redirect("/onboarding/profile?template_error=1");
  }

  const normalized = bodyTemplate.trim();
  if (!normalized) {
    redirect("/onboarding/profile?template_error=1");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error: clearError } = await supabase
    .from("announcement_templates")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("owner_id", user.id);

  if (clearError) throw new Error(clearError.message);

  const { error: upsertError } = await supabase.from("announcement_templates").upsert(
    {
      owner_id: user.id,
      name: "Default",
      body_template: normalized,
      is_default: true,
      is_shared: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,name" }
  );

  if (upsertError) throw new Error(upsertError.message);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?template_updated=1&t=${Date.now()}`);
}

export async function saveSchoolCalendarAction(formData) {
  const schoolYearStart = formData.get("school_year_start");
  const schoolYearEnd = formData.get("school_year_end");

  if (typeof schoolYearStart !== "string" || typeof schoolYearEnd !== "string") {
    redirect("/onboarding/profile?school_calendar_error=1");
  }

  if (schoolYearStart >= schoolYearEnd) {
    redirect("/onboarding/profile?school_calendar_error=1");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({
      school_year_start: schoolYearStart,
      school_year_end: schoolYearEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message);
  }

  const rawUpdates = parseSchoolCalendarRows(formData);
  const allowed = new Set(["instructional", "off", "half", "modified"]);

  const overrides = [];
  for (const [classDate, row] of rawUpdates.entries()) {
    const dayType = row.day_type;
    if (!allowed.has(dayType)) continue;

    if (dayType === "instructional") continue;

    overrides.push({
      owner_id: user.id,
      class_date: classDate,
      day_type: dayType,
      reason_id: row.reason_id ? row.reason_id : null,
      note: row.note && row.note.trim() ? row.note.trim() : null,
    });
  }

  const { error: clearOverridesError } = await supabase
    .from("school_calendar_days")
    .delete()
    .eq("owner_id", user.id);

  if (clearOverridesError) {
    throw new Error(clearOverridesError.message);
  }

  if (overrides.length > 0) {
    const { error: insertOverridesError } = await supabase
      .from("school_calendar_days")
      .insert(overrides);

    if (insertOverridesError) {
      throw new Error(insertOverridesError.message);
    }
  }

  const overrideMap = new Map(overrides.map((row) => [row.class_date, row]));

  let { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select(
      "id, owner_id, schedule_model, ab_meeting_day, ab_pattern_start_date"
    )
    .eq("owner_id", user.id);

  if (
    coursesError &&
    typeof coursesError.message === "string" &&
    coursesError.message.includes("ab_meeting_day")
  ) {
    const retry = await supabase
      .from("courses")
      .select("id, owner_id, schedule_model, ab_pattern_start_date")
      .eq("owner_id", user.id);

    courses = (retry.data || []).map((course) => ({ ...course, ab_meeting_day: null }));
    coursesError = retry.error;
  }

  if (coursesError) {
    throw new Error(coursesError.message);
  }

  for (const course of courses || []) {
    const { error: courseUpdateError } = await supabase
      .from("courses")
      .update({
        school_year_start: schoolYearStart,
        school_year_end: schoolYearEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", course.id)
      .eq("owner_id", user.id);

    if (courseUpdateError) {
      throw new Error(courseUpdateError.message);
    }

    const { error: clearCourseCalendarError } = await supabase
      .from("course_calendar_days")
      .delete()
      .eq("course_id", course.id);

    if (clearCourseCalendarError) {
      throw new Error(clearCourseCalendarError.message);
    }

    const rows = buildCourseCalendarRows({
      course,
      schoolYearStart,
      schoolYearEnd,
      overrideMap,
    });

    if (rows.length > 0) {
      const { error: insertCourseCalendarError } = await supabase
        .from("course_calendar_days")
        .insert(rows);

      if (insertCourseCalendarError) {
        throw new Error(insertCourseCalendarError.message);
      }
    }

    await rebuildPlanFromCalendar({
      supabase,
      courseId: course.id,
      userId: user.id,
    });

    revalidatePath(`/classes/${course.id}/plan`);
  }

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  revalidatePath("/");

  redirect(`/onboarding/profile?school_calendar_updated=1&t=${Date.now()}`);
}
