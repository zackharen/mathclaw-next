"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildAnnouncementContent({ classDate, lessonTitle, objective, standards }) {
  const lines = [];
  lines.push(`Date: ${formatDate(classDate)}`);
  lines.push(`Lesson: ${lessonTitle || "TBD"}`);
  lines.push(`Objective: ${objective || "No objective provided."}`);
  lines.push(`Standards: ${standards.length ? standards.join(", ") : "None listed"}`);
  return lines.join("\n");
}

export async function generateAnnouncementsAction(formData) {
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

  const { data: planRows, error: planError } = await supabase
    .from("course_lesson_plan")
    .select("class_date, lesson_id")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  if (planError) throw new Error(planError.message);
  if (!planRows || planRows.length === 0) {
    revalidatePath(`/classes/${course.id}/announcements`);
    revalidatePath(`/classes/${course.id}/plan`);
    return;
  }

  const lessonIds = [...new Set(planRows.map((row) => row.lesson_id).filter(Boolean))];

  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("id, title, objective")
    .in("id", lessonIds);

  if (lessonsError) throw new Error(lessonsError.message);

  const { data: links, error: linksError } = await supabase
    .from("curriculum_lesson_standards")
    .select("lesson_id, standards(code)")
    .in("lesson_id", lessonIds);

  if (linksError) throw new Error(linksError.message);

  const lessonById = new Map((lessons || []).map((lesson) => [lesson.id, lesson]));
  const standardsByLesson = new Map();

  for (const link of links || []) {
    const arr = standardsByLesson.get(link.lesson_id) || [];
    const code = link.standards?.code;
    if (code && !arr.includes(code)) arr.push(code);
    standardsByLesson.set(link.lesson_id, arr);
  }

  const rows = planRows.map((row) => {
    const lesson = lessonById.get(row.lesson_id);
    const standards = standardsByLesson.get(row.lesson_id) || [];
    return {
      course_id: course.id,
      class_date: row.class_date,
      content: buildAnnouncementContent({
        classDate: row.class_date,
        lessonTitle: lesson?.title,
        objective: lesson?.objective,
        standards,
      }),
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from("course_announcements")
    .upsert(rows, { onConflict: "course_id,class_date" });

  if (upsertError) throw new Error(upsertError.message);

  revalidatePath(`/classes/${course.id}/announcements`);
  revalidatePath(`/classes/${course.id}/plan`);
}
