"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { safeClassReturnPath } from "@/lib/planning/return-path";
import { isGraceDay } from "@/lib/school-calendar";
import { courseShowsCalendarDay } from "@/lib/planning/meeting-days";
import { logInternalEvent } from "@/lib/observability/events";
import { generateAnnouncementsForCourse } from "../announcements/actions";
import {
  isPastSkippedLesson,
  loadSkippedLessonIds,
  loadSkippedLessonLog,
  logSkip,
  logUndo,
} from "@/lib/planning/skipped-lessons";

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
        is_grace_day: false,
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

const ANNOUNCEMENT_COURSE_COLUMNS =
  "id, title, school_year_start, school_year_end, owner_id, schedule_model, ab_meeting_day, selected_library_id";

async function loadLessonScheduleKey(client, courseId) {
  const { data, error } = await client
    .from("course_lesson_plan")
    .select("class_date, lesson_slot, lesson_id")
    .eq("course_id", courseId)
    .order("class_date", { ascending: true })
    .order("lesson_slot", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => `${row.class_date}|${row.lesson_slot}|${row.lesson_id}`).join(",");
}

// Announcement text is generated from the lesson schedule, so a pacing change
// leaves it describing the old lessons. Regenerate the whole class: one change
// can shift every later date. The generator upserts on (course_id, class_date),
// so existing rows are updated in place. Never throws: the lesson change is
// already saved, and the caller reports this step separately.
async function refreshAnnouncementsAfterPacing({ supabase, writeClient, user, courseId }) {
  try {
    const access = await getCourseAccessForUser(supabase, user.id, courseId, ANNOUNCEMENT_COURSE_COLUMNS);
    if (!access?.course) return false;
    // Read with the write client too, so a co-teacher's regeneration sees the
    // same plan rows the rebuild just wrote.
    await generateAnnouncementsForCourse({ supabase: writeClient, writeClient, userId: user.id, course: access.course });
    revalidatePath(`/classes/${courseId}/announcements`);
    return true;
  } catch (error) {
    await logInternalEvent({
      eventKey: "plan_announcement_refresh_failed",
      source: "classes.plan.actions",
      message: error?.message || String(error),
      user,
      courseId,
    });
    return false;
  }
}

function withAnnouncementFailure(path) {
  const [beforeHash, hash] = path.split("#");
  const joined = `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}announcements_failed=1`;
  return hash === undefined ? joined : `${joined}#${hash}`;
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

export async function updateDailyLessonCountAction(formData, inPlace = false) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");
  const lessonCount = Number(formData.get("lesson_count"));

  if (
    typeof courseId !== "string" ||
    !courseId ||
    typeof classDate !== "string" ||
    !isValidISODate(classDate) ||
    !Number.isInteger(lessonCount) ||
    lessonCount < 0 ||
    lessonCount > 2
  ) {
    if (inPlace) return { error: "This day can no longer be changed. Refresh the grid and try again." };
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (inPlace) return { error: "Your session expired. Sign in and try again." };
    return;
  }

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, owner_id, schedule_model, ab_meeting_day"
  );
  const course = access?.course;
  if (!course) {
    if (inPlace) return { error: "You no longer have permission to change this class." };
    return;
  }
  const writeClient = getCourseWriteClient(access, supabase);

  const [dayRes, planRes] = await Promise.all([
    writeClient
      .from("course_calendar_days")
      .select("class_date, day_type, is_grace_day, ab_day")
      .eq("course_id", course.id)
      .eq("class_date", classDate)
      .maybeSingle(),
    writeClient
      .from("course_lesson_plan")
      .select("status")
      .eq("course_id", course.id)
      .eq("class_date", classDate),
  ]);

  if (dayRes.error) throw new Error(dayRes.error.message);
  if (planRes.error) throw new Error(planRes.error.message);

  const day = dayRes.data;
  const protectedDate = (planRes.data || []).some((row) => row.status === "completed");
  if (
    !day ||
    day.day_type === "off" ||
    isGraceDay(day) ||
    !courseShowsCalendarDay(course, day) ||
    protectedDate
  ) {
    if (inPlace) return { error: "This day can no longer be changed. Refresh the grid and try again." };
    return;
  }

  const { data: savedDays, error: updateError } = await writeClient
    .from("course_calendar_days")
    .update({ lesson_count_override: lessonCount, updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate)
    .select("class_date");

  if (inPlace && !updateError && !savedDays?.length) return { error: "This day was not saved. Refresh the grid and try again." };
  if (updateError) throw new Error(updateError.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });
  const announcementsUpdated = await refreshAnnouncementsAfterPacing({
    supabase,
    writeClient,
    user,
    courseId: course.id,
  });

  perfLog("updateDailyLessonCountAction", {
    course: course.id,
    classDate,
    lessonCount,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  const returnTo = safeClassReturnPath(formData.get("return_to"));
  if (returnTo) revalidatePath(returnTo.split(/[?#]/)[0]);
  if (inPlace) return { ok: true, announcementsFailed: !announcementsUpdated };
  const destination = returnTo || `/classes/${course.id}/plan#plan-day-${classDate}`;
  redirect(announcementsUpdated ? destination : withAnnouncementFailure(destination));
}


export async function markLessonCompleteAction(formData, inPlace = false) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");

  if (typeof courseId !== "string" || !courseId || !isValidISODate(classDate)) {
    if (inPlace) return { error: "Choose a valid class and day." };
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (inPlace) return { error: "Your session expired. Sign in and try again." };
    return;
  }

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) {
    if (inPlace) return { error: "You no longer have permission to change this class." };
    return;
  }
  const writeClient = getCourseWriteClient(access, supabase);

  // In manual pacing the completion boundary decides which lessons later days
  // get, so compare the schedule around the rebuild to catch a shift.
  const scheduleBefore = await loadLessonScheduleKey(writeClient, course.id);
  const { data: savedLessons, error: markError } = await writeClient
    .from("course_lesson_plan")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate)
    .select("status");

  if (inPlace && !markError && !savedLessons?.length) return { error: "There are no lessons to update on this day. Refresh the grid and try again." };
  if (markError) throw new Error(markError.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });
  const scheduleShifted = (await loadLessonScheduleKey(writeClient, course.id)) !== scheduleBefore;
  const announcementsUpdated = scheduleShifted
    ? await refreshAnnouncementsAfterPacing({ supabase, writeClient, user, courseId: course.id })
    : true;

  perfLog("markLessonCompleteAction", {
    course: course.id,
    classDate,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  // The all-classes grid sends the teacher back to the same week and row.
  const returnTo = safeClassReturnPath(formData.get("return_to"));
  if (returnTo) revalidatePath(returnTo.split(/[?#]/)[0]);
  if (inPlace) return { ok: true, announcementsFailed: !announcementsUpdated };
  const destination = returnTo || `/classes/${course.id}/plan?progress_updated=1&t=${Date.now()}#next-class-day`;
  redirect(announcementsUpdated ? destination : withAnnouncementFailure(destination));
}

export async function markLessonPlannedAction(formData, inPlace = false) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");

  if (typeof courseId !== "string" || !courseId || !isValidISODate(classDate)) {
    if (inPlace) return { error: "Choose a valid class and day." };
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (inPlace) return { error: "Your session expired. Sign in and try again." };
    return;
  }

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) {
    if (inPlace) return { error: "You no longer have permission to change this class." };
    return;
  }
  const writeClient = getCourseWriteClient(access, supabase);

  // In manual pacing the completion boundary decides which lessons later days
  // get, so compare the schedule around the rebuild to catch a shift.
  const scheduleBefore = await loadLessonScheduleKey(writeClient, course.id);
  const { data: savedLessons, error: markError } = await writeClient
    .from("course_lesson_plan")
    .update({ status: "planned", updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate)
    .select("status");

  if (inPlace && !markError && !savedLessons?.length) return { error: "There are no lessons to update on this day. Refresh the grid and try again." };
  if (markError) throw new Error(markError.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });
  const scheduleShifted = (await loadLessonScheduleKey(writeClient, course.id)) !== scheduleBefore;
  const announcementsUpdated = scheduleShifted
    ? await refreshAnnouncementsAfterPacing({ supabase, writeClient, user, courseId: course.id })
    : true;

  perfLog("markLessonPlannedAction", {
    course: course.id,
    classDate,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  // The all-classes grid sends the teacher back to the same week and row.
  const returnTo = safeClassReturnPath(formData.get("return_to"));
  if (returnTo) revalidatePath(returnTo.split(/[?#]/)[0]);
  if (inPlace) return { ok: true, announcementsFailed: !announcementsUpdated };
  const destination = returnTo || `/classes/${course.id}/plan?progress_updated=1&t=${Date.now()}#next-class-day`;
  redirect(announcementsUpdated ? destination : withAnnouncementFailure(destination));
}

// Skip drops one lesson from this class's sequence (later lessons move up);
// restore puts it back. Grid only, so expected failures are returned.
async function changeSkippedLesson(formData, mode) {
  const courseId = formData.get("course_id");
  const lessonId = formData.get("lesson_id");
  const classDate = formData.get("class_date");
  if (
    typeof courseId !== "string" ||
    !courseId ||
    typeof lessonId !== "string" ||
    !lessonId ||
    (mode === "skip" && !isValidISODate(classDate))
  ) {
    return { error: "Choose a valid lesson." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id, selected_library_id");
  const course = access?.course;
  if (!course) return { error: "You no longer have permission to change this class." };
  const writeClient = getCourseWriteClient(access, supabase);

  const [current, currentLog] = await Promise.all([
    loadSkippedLessonIds(writeClient, [course.id]),
    loadSkippedLessonLog(writeClient, [course.id]),
  ]);
  if (!current.available) return { error: "Skipping lessons isn't set up yet." };
  const skipped = current.byCourse.get(course.id) || [];
  const log = currentLog.byCourse.get(course.id) || [];
  const now = new Date().toISOString();

  let next;
  let nextLog;
  if (mode === "skip") {
    const { data: rows, error } = await writeClient
      .from("course_lesson_plan")
      .select("status")
      .eq("course_id", course.id)
      .eq("class_date", classDate)
      .eq("lesson_id", lessonId);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { error: "That lesson is no longer on this day. Refresh the grid and try again." };
    if (rows.some((row) => row.status === "completed")) return { error: "Completed lessons can't be skipped." };
    if (skipped.includes(lessonId)) return { ok: true, announcementsFailed: false };
    next = [...skipped, lessonId];
    nextLog = logSkip(log, { lessonId, skippedFrom: classDate, skippedAt: now, userId: user.id });
  } else {
    if (!skipped.includes(lessonId)) return { error: "That lesson isn't skipped anymore. Refresh the grid." };
    // Completion is carried by position, so a lesson restored in front of
    // completed work would take over a completed slot. Refuse instead.
    const [lessonRes, completedRes] = await Promise.all([
      writeClient.from("curriculum_lessons").select("sequence_index").eq("id", lessonId).maybeSingle(),
      writeClient
        .from("course_lesson_plan")
        .select("curriculum_lessons(sequence_index)")
        .eq("course_id", course.id)
        .eq("status", "completed"),
    ]);
    if (lessonRes.error) throw new Error(lessonRes.error.message);
    if (completedRes.error) throw new Error(completedRes.error.message);
    const lastCompleted = Math.max(
      -Infinity,
      ...(completedRes.data || []).map((row) => row.curriculum_lessons?.sequence_index ?? -Infinity)
    );
    if (isPastSkippedLesson(lessonRes.data?.sequence_index, lastCompleted)) {
      return { error: "You've already completed lessons past this point, so this skip can't be undone." };
    }
    next = skipped.filter((id) => id !== lessonId);
    nextLog = logUndo(log, { lessonId, undoneAt: now, userId: user.id });
  }

  const { data: saved, error: saveError } = await writeClient
    .from("courses")
    .update({
      skipped_lesson_ids: next,
      ...(currentLog.available ? { skipped_lesson_log: nextLog } : {}),
      updated_at: now,
    })
    .eq("id", course.id)
    .select("id");
  if (saveError) throw new Error(saveError.message);
  if (!saved?.length) return { error: "This change was not saved. Refresh the grid and try again." };

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });
  const announcementsUpdated = await refreshAnnouncementsAfterPacing({ supabase, writeClient, user, courseId: course.id });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  const returnTo = safeClassReturnPath(formData.get("return_to"));
  if (returnTo) revalidatePath(returnTo.split(/[?#]/)[0]);
  return { ok: true, announcementsFailed: !announcementsUpdated };
}

// Return expected failures to the grid; redirects remain the default for the
// single-class plan. Never turn a rejected or skipped write into a success.
export async function saveGridPlanAction(formData) {
  const actions = {
    count: updateDailyLessonCountAction,
    complete: markLessonCompleteAction,
    planned: markLessonPlannedAction,
    skip: (data) => changeSkippedLesson(data, "skip"),
    restore: (data) => changeSkippedLesson(data, "restore"),
  };
  const kind = formData.get("grid_action");
  const action = Object.hasOwn(actions, kind) ? actions[kind] : null;
  if (!action) return { error: "Choose a valid change." };
  try {
    return await action(formData, true);
  } catch {
    const returnTo = safeClassReturnPath(formData.get("return_to"));
    if (returnTo) revalidatePath(returnTo.split(/[?#]/)[0]);
    return { error: "Could not finish saving. Check the grid and try again." };
  }
}

// Retry for the grid when lessons saved but the announcement refresh did not.
export async function refreshGridAnnouncementsAction(courseId, returnTo) {
  if (typeof courseId !== "string" || !courseId) return { error: "Choose a valid class." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };
  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  if (!access?.course) return { error: "You no longer have permission to change this class." };
  const writeClient = getCourseWriteClient(access, supabase);
  const updated = await refreshAnnouncementsAfterPacing({ supabase, writeClient, user, courseId });
  revalidatePath(`/classes/${courseId}/plan`);
  const safeReturn = safeClassReturnPath(returnTo);
  if (safeReturn) revalidatePath(safeReturn.split(/[?#]/)[0]);
  return updated ? { ok: true } : { error: "Announcements still didn't update. Try again in a moment." };
}
