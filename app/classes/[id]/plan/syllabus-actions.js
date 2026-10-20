"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { logInternalEvent } from "@/lib/observability/events";
import {
  ASSIGNMENT_CATEGORIES,
  isFixedDatesCourse,
  isIsoDate,
  normalizeClockTime,
} from "@/lib/planning/fixed-dates";
import { generateAnnouncementsForCourse } from "../announcements/actions";

const COURSE_COLUMNS =
  "id, owner_id, title, school_year_start, school_year_end, schedule_model, ab_meeting_day, selected_library_id, pacing_mode";
const CATEGORY_VALUES = new Set(ASSIGNMENT_CATEGORIES.map((category) => category.value));

function text(formData, name, max = 500) {
  return String(formData.get(name) || "").trim().slice(0, max);
}

function planPath(courseId, params, anchor = "syllabus-schedule") {
  const query = new URLSearchParams({ ...params, t: String(Date.now()) });
  return `/classes/${courseId}/plan?${query.toString()}#${anchor}`;
}

// Only someone who can edit this class (owner, co-teacher editor, or school
// admin) gets a course back; everyone else is sent away without a write.
async function loadEditableFixedCourse(courseId) {
  if (typeof courseId !== "string" || !courseId) redirect("/classes");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirect=/classes/${courseId}/plan`);
  const access = await getCourseAccessForUser(supabase, user.id, courseId, COURSE_COLUMNS);
  const course = access?.course;
  if (!course) redirect("/classes");
  if (!isFixedDatesCourse(course)) redirect(planPath(course.id, { syllabus_error: "not-syllabus" }));
  return { supabase, user, course, writeClient: getCourseWriteClient(access, supabase) };
}

function inCourseRange(course, iso) {
  return isIsoDate(iso) && iso >= course.school_year_start && iso <= course.school_year_end;
}

// The saved change stands even if announcements fail; the page says so.
async function refreshAnnouncements({ supabase, writeClient, user, course }) {
  try {
    await generateAnnouncementsForCourse({ supabase: writeClient, writeClient, userId: user.id, course });
    return true;
  } catch (error) {
    await logInternalEvent({
      eventKey: "syllabus_announcement_refresh_failed",
      source: "classes.plan.syllabus-actions",
      message: error?.message || String(error),
      user,
      courseId: course.id,
    });
    return false;
  }
}

function finish(course, announcementsOk, anchorDate) {
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/announcements`);
  const params = announcementsOk ? { syllabus_updated: "1" } : { syllabus_updated: "1", announcements_failed: "1" };
  redirect(planPath(course.id, params, anchorDate ? `syllabus-${anchorDate}` : "syllabus-schedule"));
}

export async function saveDatedAssignmentAction(formData) {
  const { supabase, user, course, writeClient } = await loadEditableFixedCourse(formData.get("course_id"));
  const id = text(formData, "assignment_id", 64);
  const label = text(formData, "label", 200);
  const assignmentDate = text(formData, "assignment_date", 10);
  const dueDate = text(formData, "due_date", 10);
  const category = text(formData, "category", 40);
  const url = text(formData, "url", 2000);
  const lessonId = text(formData, "lesson_id", 64);

  const fail = (code) => redirect(planPath(course.id, { syllabus_error: code }));
  if (!label) fail("label");
  if (!inCourseRange(course, assignmentDate)) fail("release-date");
  if (dueDate && (!inCourseRange(course, dueDate) || dueDate < assignmentDate)) fail("due-date");
  if (category && !CATEGORY_VALUES.has(category)) fail("category");
  if (url && !/^https?:\/\//i.test(url)) fail("url");

  if (lessonId) {
    const { data: planRow, error } = await writeClient
      .from("course_lesson_plan")
      .select("lesson_id")
      .eq("course_id", course.id)
      .eq("lesson_id", lessonId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!planRow) fail("lesson");
  }

  const payload = {
    owner_id: course.owner_id,
    course_id: course.id,
    label,
    assignment_date: assignmentDate,
    due_date: dueDate || null,
    category: category || null,
    provider: text(formData, "provider", 80) || null,
    url: url || null,
    notes: text(formData, "notes", 2000) || null,
    release_time: normalizeClockTime(formData.get("release_time")) || null,
    due_time: normalizeClockTime(formData.get("due_time")) || null,
    is_draft: formData.get("is_draft") === "on",
    lesson_id: lessonId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await writeClient
        .from("teacher_announcement_assignments")
        .update(payload)
        .eq("id", id)
        .eq("course_id", course.id)
    : await writeClient.from("teacher_announcement_assignments").insert(payload);
  if (error) {
    if (String(error.code) === "23505") fail("duplicate");
    throw new Error(error.message);
  }

  finish(course, await refreshAnnouncements({ supabase, writeClient, user, course }), assignmentDate);
}

export async function deleteDatedAssignmentAction(formData) {
  const { supabase, user, course, writeClient } = await loadEditableFixedCourse(formData.get("course_id"));
  const id = text(formData, "assignment_id", 64);
  if (!id) redirect(planPath(course.id, { syllabus_error: "missing" }));

  const { error } = await writeClient
    .from("teacher_announcement_assignments")
    .delete()
    .eq("id", id)
    .eq("course_id", course.id);
  if (error) throw new Error(error.message);

  finish(course, await refreshAnnouncements({ supabase, writeClient, user, course }), text(formData, "anchor_date", 10));
}

// Moves one lesson's release to another date. Its assignments released the same
// day move with it only when asked, and never past their own due dates.
export async function moveLessonReleaseAction(formData) {
  const { supabase, user, course, writeClient } = await loadEditableFixedCourse(formData.get("course_id"));
  const lessonId = text(formData, "lesson_id", 64);
  const fromDate = text(formData, "from_date", 10);
  const toDate = text(formData, "to_date", 10);
  const moveAssignments = formData.get("move_assignments") === "on";
  const fail = (code) => redirect(planPath(course.id, { syllabus_error: code }));

  if (!lessonId || !isIsoDate(fromDate)) fail("missing");
  if (!inCourseRange(course, toDate)) fail("release-date");
  if (toDate === fromDate) finish(course, true, fromDate);

  const [{ data: row, error: rowError }, { data: targetRows, error: targetError }] = await Promise.all([
    writeClient
      .from("course_lesson_plan")
      .select("id")
      .eq("course_id", course.id)
      .eq("lesson_id", lessonId)
      .eq("class_date", fromDate)
      .maybeSingle(),
    writeClient.from("course_lesson_plan").select("lesson_slot").eq("course_id", course.id).eq("class_date", toDate),
  ]);
  if (rowError) throw new Error(rowError.message);
  if (targetError) throw new Error(targetError.message);
  if (!row) fail("missing");

  let assignmentIds = [];
  if (moveAssignments) {
    const { data: linked, error } = await writeClient
      .from("teacher_announcement_assignments")
      .select("id, due_date")
      .eq("course_id", course.id)
      .eq("lesson_id", lessonId)
      .eq("assignment_date", fromDate);
    if (error) throw new Error(error.message);
    if ((linked || []).some((item) => item.due_date && item.due_date < toDate)) fail("move-past-due");
    assignmentIds = (linked || []).map((item) => item.id);
  }

  const nextSlot = Math.max(0, ...(targetRows || []).map((target) => target.lesson_slot)) + 1;
  const { error: moveError } = await writeClient
    .from("course_lesson_plan")
    .update({ class_date: toDate, lesson_slot: nextSlot, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (moveError) throw new Error(moveError.message);

  if (assignmentIds.length) {
    const { error } = await writeClient
      .from("teacher_announcement_assignments")
      .update({ assignment_date: toDate, updated_at: new Date().toISOString() })
      .in("id", assignmentIds);
    if (error) throw new Error(error.message);
  }

  finish(course, await refreshAnnouncements({ supabase, writeClient, user, course }), toDate);
}
