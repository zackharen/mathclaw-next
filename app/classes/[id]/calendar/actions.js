"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

async function rebuildPlanFromCalendar({ supabase, courseId, userId }) {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, owner_id, selected_library_id, schedule_model, ab_meeting_day")
    .eq("id", courseId)
    .eq("owner_id", userId)
    .single();

  if (courseError) throw new Error(courseError.message);
  if (!course || !course.selected_library_id) return;

  const { data: calendarDays, error: calendarError } = await supabase
    .from("course_calendar_days")
    .select("class_date, ab_day, day_type")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  if (calendarError) throw new Error(calendarError.message);

  const filteredInstructionalDays = (calendarDays || []).filter((day) => {
    if (day.day_type !== "instructional") return false;
    if (course.schedule_model !== "ab") return true;
    if (!course.ab_meeting_day) return true;
    return day.ab_day === course.ab_meeting_day;
  });

  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("id, sequence_index")
    .eq("library_id", course.selected_library_id)
    .order("sequence_index", { ascending: true });

  if (lessonsError) throw new Error(lessonsError.message);

  const { error: deleteError } = await supabase
    .from("course_lesson_plan")
    .delete()
    .eq("course_id", course.id);

  if (deleteError) throw new Error(deleteError.message);

  const rowsToInsert = [];
  const dayCount = filteredInstructionalDays.length;
  const lessonCount = lessons?.length || 0;
  const count = Math.min(dayCount, lessonCount);

  for (let i = 0; i < count; i++) {
    rowsToInsert.push({
      course_id: course.id,
      class_date: filteredInstructionalDays[i].class_date,
      lesson_id: lessons[i].id,
      status: "planned",
      is_added_buffer_day: false,
    });
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("course_lesson_plan")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);
  }
}

function parseBulkUpdates(formData) {
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

export async function generateCalendarAction(formData) {
  const courseId = formData.get("course_id");
  const force = formData.get("force") === "1";
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  let { data: course, error: courseError } = await supabase
    .from("courses")
    .select(
      "id, owner_id, schedule_model, ab_meeting_day, ab_pattern_start_date, school_year_start, school_year_end"
    )
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (
    courseError &&
    typeof courseError.message === "string" &&
    courseError.message.includes("ab_meeting_day")
  ) {
    const retry = await supabase
      .from("courses")
      .select(
        "id, owner_id, schedule_model, ab_pattern_start_date, school_year_start, school_year_end"
      )
      .eq("id", courseId)
      .eq("owner_id", user.id)
      .single();
    course = retry.data ? { ...retry.data, ab_meeting_day: null } : null;
    courseError = retry.error;
  }

  if (!course || courseError) return;

  const { count } = await supabase
    .from("course_calendar_days")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id);

  if (count && count > 0 && !force) {
    revalidatePath(`/classes/${course.id}/calendar`);
    revalidatePath(`/classes/${course.id}/plan`);
    redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}#modify-calendar`);
  }

  if (count && count > 0 && force) {
    const { error: clearError } = await supabase
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

  if (abStart && abStart > start) {
    currentAB = "A";
  }

  const rows = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayWeekend = isWeekend(cursor);
    let dayType = dayWeekend ? "off" : "instructional";
    let abDay = null;

    if (course.schedule_model === "ab") {
      if (!dayWeekend && (!abStart || cursor >= abStart)) {
        abDay = currentAB;
        if (course.ab_meeting_day && abDay !== course.ab_meeting_day) {
          dayType = "off";
        }
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

  const { error } = await supabase.from("course_calendar_days").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  await rebuildPlanFromCalendar({ supabase, courseId: course.id, userId: user.id });

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}`);
}

export async function applyCalendarBulkAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  const updates = parseBulkUpdates(formData);
  const allowed = new Set(["instructional", "off", "half", "modified"]);

  for (const [classDate, row] of updates.entries()) {
    if (!allowed.has(row.day_type)) continue;

    const payload = {
      day_type: row.day_type,
      reason_id: row.reason_id ? row.reason_id : null,
      note: row.note && row.note.trim() ? row.note.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("course_calendar_days")
      .update(payload)
      .eq("course_id", course.id)
      .eq("class_date", classDate);

    if (error) throw new Error(error.message);
  }

  await rebuildPlanFromCalendar({ supabase, courseId: course.id, userId: user.id });

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}#modify-calendar`);
}

export async function updateCalendarDayAction(formData) {
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

  const allowed = new Set(["instructional", "off", "half", "modified"]);
  if (!allowed.has(dayType)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  const payload = {
    day_type: dayType,
    reason_id: typeof reasonId === "string" && reasonId ? reasonId : null,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("course_calendar_days")
    .update(payload)
    .eq("course_id", course.id)
    .eq("class_date", classDate);

  if (error) {
    throw new Error(error.message);
  }

  if (autoRegenerate) {
    await rebuildPlanFromCalendar({ supabase, courseId: course.id, userId: user.id });
  }

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}`);
}
