"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PACING_MODES = new Set([
  "one_lesson_per_day",
  "one_lesson_no_half_days",
  "two_lessons_per_day",
  "manual_complete",
]);

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

function parseFlexibleDate(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return isValidISODate(trimmed) ? trimmed : null;
  }
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const iso = `${slash[3]}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextAB(current) {
  return current === "A" ? "B" : "A";
}

function normalizePacingMode(value) {
  if (value === "two_lessons_unless_modified") return "two_lessons_per_day";
  return PACING_MODES.has(value) ? value : "one_lesson_per_day";
}

function parseWeekdayModifiers(formData) {
  const modifiers = {};
  for (const weekday of ["1", "2", "3", "4", "5"]) {
    const noLesson = formData.get(`pacing_weekday_no_lesson__${weekday}`) === "on";
    const oneLess = formData.get(`pacing_weekday_one_less__${weekday}`) === "on";
    if (noLesson) {
      modifiers[weekday] = "no_lesson";
    } else if (oneLess) {
      modifiers[weekday] = "one_less";
    }
  }
  return modifiers;
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

async function relabelExistingABDays({ writeClient, course, startDate, endDate }) {
  const abStart =
    course.schedule_model === "ab" && course.ab_pattern_start_date
      ? course.ab_pattern_start_date
      : null;

  const { data: existingDays, error: existingError } = await writeClient
    .from("course_calendar_days")
    .select("class_date, day_type, ab_day")
    .eq("course_id", course.id)
    .gte("class_date", startDate)
    .lte("class_date", endDate)
    .order("class_date", { ascending: true });

  if (existingError) throw new Error(existingError.message);

  let currentAB = "A";
  let updatedCount = 0;
  for (const day of existingDays || []) {
    let expectedAB = null;
    if (course.schedule_model === "ab" && day.day_type !== "off" && (!abStart || day.class_date >= abStart)) {
      expectedAB = currentAB;
      currentAB = nextAB(currentAB);
    }

    if ((day.ab_day || null) === expectedAB) continue;

    const { error } = await writeClient
      .from("course_calendar_days")
      .update({ ab_day: expectedAB, updated_at: new Date().toISOString() })
      .eq("course_id", course.id)
      .eq("class_date", day.class_date);

    if (error) throw new Error(error.message);
    updatedCount += 1;
  }

  return updatedCount;
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
  const startDate = parseFlexibleDate(String(formData.get("school_year_start") || ""));
  const endDate = parseFlexibleDate(String(formData.get("school_year_end") || ""));

  if (typeof courseId !== "string" || !courseId || !startDate || !endDate || startDate >= endDate) {
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

  const relabeledDays = await relabelExistingABDays({
    writeClient,
    course: nextCourse,
    startDate,
    endDate,
  });

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updateCourseDateRangeAction", {
    course: course.id,
    startDate,
    endDate,
    insertedDays: rowsToInsert.length,
    relabeledDays,
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

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, owner_id, schedule_model, ab_pattern_start_date, school_year_start, school_year_end"
  );
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const nextCourse = { ...course, ab_meeting_day: abMeetingDay };
  const { error } = await writeClient
    .from("courses")
    .update({ ab_meeting_day: abMeetingDay, updated_at: new Date().toISOString() })
    .eq("id", course.id);

  if (error) throw new Error(error.message);

  const relabeledDays = await relabelExistingABDays({
    writeClient,
    course: nextCourse,
    startDate: course.school_year_start,
    endDate: course.school_year_end,
  });

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updateABMeetingDaysAction", {
    course: course.id,
    abMeetingDay: abMeetingDay || "both",
    relabeledDays,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&ab_updated=1&t=${Date.now()}#modify-calendar`);
}

export async function updatePacingModeAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const pacingMode = normalizePacingMode(String(formData.get("pacing_mode") || ""));
  const weekdayModifiers = parseWeekdayModifiers(formData);

  if (
    typeof courseId !== "string" ||
    !courseId
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
    .update({
      pacing_mode: pacingMode,
      pacing_weekday_modifiers: weekdayModifiers,
      updated_at: new Date().toISOString(),
    })
    .eq("id", course.id);

  if (error) throw new Error(error.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("updatePacingModeAction", {
    course: course.id,
    pacingMode,
    weekdayModifiers: Object.keys(weekdayModifiers).length,
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
