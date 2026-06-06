"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";

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

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextAB(current) {
  return current === "A" ? "B" : "A";
}

async function relabelExistingABDays({ writeClient, course }) {
  if (course.schedule_model !== "ab") return 0;

  const abStart = course.ab_pattern_start_date || null;
  const { data: existingDays, error: existingError } = await writeClient
    .from("course_calendar_days")
    .select("class_date, day_type, ab_day")
    .eq("course_id", course.id)
    .gte("class_date", course.school_year_start)
    .lte("class_date", course.school_year_end)
    .order("class_date", { ascending: true });

  if (existingError) throw new Error(existingError.message);

  let currentAB = "A";
  let updatedCount = 0;
  for (const day of existingDays || []) {
    let expectedAB = null;
    if (day.day_type !== "off" && (!abStart || day.class_date >= abStart)) {
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

function parseBulkUpdates(formData) {
  const updates = new Map();
  const selectedDates = new Set();

  for (const [key, value] of formData.entries()) {
    if (typeof key !== "string") continue;

    if (key === "selected_class_date" && typeof value === "string" && value) {
      selectedDates.add(value);
      continue;
    }

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

  return { updates, selectedDates };
}

export async function generateCalendarAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const force = formData.get("force") === "1";
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  let courseError = null;
  let course = null;
  let access = null;
  try {
    access = await getCourseAccessForUser(
      supabase,
      user.id,
      courseId,
      "id, owner_id, schedule_model, ab_meeting_day, ab_pattern_start_date, school_year_start, school_year_end"
    );
    course = access?.course || null;
  } catch (error) {
    courseError = error;
  }

  if (
    courseError &&
    typeof courseError.message === "string" &&
    courseError.message.includes("ab_pattern_start_date")
  ) {
    courseError = null;
    access = await getCourseAccessForUser(
      supabase,
      user.id,
      courseId,
      "id, owner_id, schedule_model, ab_meeting_day, school_year_start, school_year_end"
    );
    course = access?.course
      ? { ...access.course, ab_pattern_start_date: access.course.school_year_start }
      : null;
  }

  if (!course || courseError) return;
  const writeClient = getCourseWriteClient(access, supabase);

  const { count } = await writeClient
    .from("course_calendar_days")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id);

  if (count && count > 0 && !force) {
    perfLog("generateCalendarAction", {
      course: course.id,
      reused: true,
      force,
      ms: Date.now() - actionStart,
    });
    revalidatePath(`/classes/${course.id}/calendar`);
    revalidatePath(`/classes/${course.id}/plan`);
    redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}#modify-calendar`);
  }

  if (count && count > 0 && force) {
    const { error: clearError } = await writeClient
      .from("course_calendar_days")
      .delete()
      .eq("course_id", course.id);

    if (clearError) throw new Error(clearError.message);
  }

  const start = parseDateAtUTC(course.school_year_start);
  const end = parseDateAtUTC(course.school_year_end);

  const abStart =
    course.schedule_model === "ab" && course.ab_pattern_start_date
      ? parseDateAtUTC(course.ab_pattern_start_date)
      : null;

  let currentAB = "A";
  if (abStart && abStart > start) currentAB = "A";

  const rows = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayWeekend = isWeekend(cursor);
    let dayType = dayWeekend ? "off" : "instructional";
    let abDay = null;

    if (course.schedule_model === "ab") {
      if (!dayWeekend && (!abStart || cursor >= abStart)) {
        abDay = currentAB;
        currentAB = nextAB(currentAB);
      }
    }

    rows.push({
      course_id: course.id,
      class_date: toISODate(cursor),
      day_type: dayType,
      ab_day: abDay,
      reason_id: null,
      note: null,
    });
  }

  const { error } = await writeClient.from("course_calendar_days").insert(rows);
  if (error) throw new Error(error.message);

  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  perfLog("generateCalendarAction", {
    course: course.id,
    insertedDays: rows.length,
    force,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}`);
}

async function copyCourseCalendarToOthers({ supabase, writeClient, course, userId }) {
  const { data: sourceDays } = await writeClient
    .from("course_calendar_days")
    .select("class_date, day_type, reason_id")
    .eq("course_id", course.id)
    .neq("day_type", "grace_day")
    .order("class_date", { ascending: true });

  if (!sourceDays || sourceDays.length === 0) return [];

  const { data: otherCourses } = await supabase
    .from("courses")
    .select("id, school_year_start, school_year_end, schedule_model, ab_pattern_start_date")
    .eq("owner_id", course.owner_id)
    .neq("id", course.id);

  if (!otherCourses || otherCourses.length === 0) return [];

  const affectedCourseIds = [];

  for (const targetCourse of otherCourses) {
    const overlappingDays = sourceDays.filter(
      (d) =>
        d.class_date >= targetCourse.school_year_start &&
        d.class_date <= targetCourse.school_year_end
    );
    if (overlappingDays.length === 0) continue;

    const { data: targetExisting } = await supabase
      .from("course_calendar_days")
      .select("class_date")
      .eq("course_id", targetCourse.id);

    const targetDatesSet = new Set((targetExisting || []).map((d) => d.class_date));
    const daysToUpdate = overlappingDays.filter((d) => targetDatesSet.has(d.class_date));
    if (daysToUpdate.length === 0) continue;

    for (const day of daysToUpdate) {
      await supabase
        .from("course_calendar_days")
        .update({
          day_type: day.day_type,
          reason_id: day.reason_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("course_id", targetCourse.id)
        .eq("class_date", day.class_date);
    }

    await relabelExistingABDays({ writeClient: supabase, course: targetCourse });
    await rebuildPlanFromCalendar({ supabase, courseId: targetCourse.id, userId });
    affectedCourseIds.push(targetCourse.id);
  }

  return affectedCourseIds;
}

export async function applyCalendarBulkAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

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

  const copyToAll = formData.get("copy_to_all") === "1";
  const { updates, selectedDates } = parseBulkUpdates(formData);
  const selectedDayType = String(formData.get("selected_day_type") || "");
  const selectedReasonId = String(formData.get("selected_reason_id") || "");
  const selectedReasonShouldApply = selectedReasonId !== "";
  const bulkScope = String(formData.get("selected_bulk_scope") || "") === "all_visible" ? "all_visible" : "checked";
  const allowed = new Set(["instructional", "off", "half", "modified", "grace_day"]);
  const shouldApplySelectedDayType =
    allowed.has(selectedDayType) && (bulkScope === "all_visible" || selectedDates.size > 0);
  let updatedCount = 0;

  // Bulk editor currently posts all visible rows; use full rebuild for deterministic mapping.
  for (const [classDate, row] of updates.entries()) {
    const isBulkTarget = bulkScope === "all_visible" || selectedDates.has(classDate);
    const dayType = shouldApplySelectedDayType && isBulkTarget ? selectedDayType : row.day_type;
    if (!allowed.has(dayType)) continue;

    const payload = {
      day_type: dayType,
      reason_id:
        shouldApplySelectedDayType && isBulkTarget && selectedReasonShouldApply
          ? selectedReasonId === "__clear__"
            ? null
            : selectedReasonId
          : row.reason_id
            ? row.reason_id
            : null,
      note: row.note && row.note.trim() ? row.note.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await writeClient
      .from("course_calendar_days")
      .update(payload)
      .eq("course_id", course.id)
      .eq("class_date", classDate);

    if (error) throw new Error(error.message);
    updatedCount += 1;
  }

  const relabeledDays = await relabelExistingABDays({ writeClient, course });
  await rebuildPlanFromCalendar({ supabase: writeClient, courseId: course.id, userId: user.id });

  let affectedCourseIds = [];
  if (copyToAll) {
    affectedCourseIds = await copyCourseCalendarToOthers({
      supabase,
      writeClient,
      course,
      userId: user.id,
    });
  }

  perfLog("applyCalendarBulkAction", {
    course: course.id,
    updates: updatedCount,
    selectedUpdates: shouldApplySelectedDayType
      ? bulkScope === "all_visible"
        ? updatedCount
        : selectedDates.size
      : 0,
    bulkScope,
    relabeledDays,
    copyToAll,
    affectedCourses: affectedCourseIds.length,
    ms: Date.now() - actionStart,
  });

  for (const id of affectedCourseIds) {
    revalidatePath(`/classes/${id}/plan`);
    revalidatePath(`/classes/${id}/calendar`);
  }
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  const copied = affectedCourseIds.length > 0 ? "&calendar_copied=1" : "";
  redirect(`/classes/${course.id}/plan?calendar_updated=1${copied}&t=${Date.now()}#modify-calendar`);
}

export async function updateCalendarDayAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");
  const dayType = formData.get("day_type");
  const reasonId = formData.get("reason_id");
  const note = formData.get("note");
  const autoRegenerate = formData.get("auto_regenerate") === "1";

  if (
    typeof courseId !== "string" ||
    typeof classDate !== "string" ||
    typeof dayType !== "string"
  ) {
    return;
  }

  const allowed = new Set(["instructional", "off", "half", "modified", "grace_day"]);
  if (!allowed.has(dayType)) return;

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

  const payload = {
    day_type: dayType,
    reason_id: typeof reasonId === "string" && reasonId ? reasonId : null,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await writeClient
    .from("course_calendar_days")
    .update(payload)
    .eq("course_id", course.id)
    .eq("class_date", classDate);

  if (error) throw new Error(error.message);

  const relabeledDays = await relabelExistingABDays({ writeClient, course });

  if (autoRegenerate) {
    await rebuildPlanFromCalendar({
      supabase: writeClient,
      courseId: course.id,
      userId: user.id,
      startDate: classDate,
    });
  }

  perfLog("updateCalendarDayAction", {
    course: course.id,
    classDate,
    dayType,
    autoRegenerate,
    relabeledDays,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}`);
}

export async function copyCalendarToOtherClassesAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

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

  const affectedCourseIds = await copyCourseCalendarToOthers({
    supabase,
    writeClient,
    course,
    userId: user.id,
  });

  perfLog("copyCalendarToOtherClassesAction", {
    course: courseId,
    affected: affectedCourseIds.length,
    ms: Date.now() - actionStart,
  });

  for (const id of affectedCourseIds) {
    revalidatePath(`/classes/${id}/plan`);
    revalidatePath(`/classes/${id}/calendar`);
  }
  revalidatePath(`/classes/${courseId}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${courseId}/plan?calendar_copied=1&t=${Date.now()}#modify-calendar`);
}
