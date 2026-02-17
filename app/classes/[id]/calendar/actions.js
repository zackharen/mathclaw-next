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
    return;
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

  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
}

export async function updateCalendarDayAction(formData) {
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");
  const dayType = formData.get("day_type");
  const reasonId = formData.get("reason_id");
  const note = formData.get("note");

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

  revalidatePath(`/classes/${course.id}/calendar`);
  redirect(`/classes/${course.id}/calendar`);
}
