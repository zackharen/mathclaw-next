"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const DEFAULT_TEMPLATE = `Date: {date}
Class: {class_name}
Day Type: {day_type}
Lesson: {lesson_title}
Objective: {objective}
Standards: {standards}`;

const QUOTES = [
  "Success is the sum of small efforts, repeated daily.",
  "It always seems impossible until it’s done.",
  "The expert in anything was once a beginner.",
  "Consistency compounds.",
  "Don’t watch the clock; do what it does. Keep going.",
  "Small progress is still progress.",
];

function applyTemplate(template, values) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, value ?? "");
  }
  return output.trim();
}

function titleWithoutCode(lessonTitle) {
  return String(lessonTitle || "")
    .replace(/^\s*[\w.-]+\s*:\s*/u, "")
    .trim();
}

function buildDoNow({ lessonTitle, objective, standards }) {
  const title = titleWithoutCode(lessonTitle) || "today's topic";
  const standard = standards[0] || "today’s standard";
  const objectiveText = String(objective || "").trim();
  if (objectiveText) {
    return `Do Now: In 2-3 sentences, explain how "${title}" connects to this objective: ${objectiveText}`;
  }
  return `Do Now: Write one example and one non-example for "${title}" aligned to ${standard}.`;
}

function buildQuote({ classDate, className }) {
  const seed = `${classDate}|${className || ""}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length];
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
    .select("id, title")
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
    redirect(`/classes/${course.id}/plan?announcements_updated=1&t=${Date.now()}`);
  }

  const lessonIds = [...new Set(planRows.map((row) => row.lesson_id).filter(Boolean))];

  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("id, title, objective")
    .in("id", lessonIds);

  if (lessonsError) throw new Error(lessonsError.message);

  const { data: calendarDays, error: calendarError } = await supabase
    .from("course_calendar_days")
    .select("class_date, day_type, reason_id")
    .eq("course_id", course.id);

  if (calendarError) throw new Error(calendarError.message);

  const reasonIds = [...new Set((calendarDays || []).map((d) => d.reason_id).filter(Boolean))];
  const { data: reasons, error: reasonsError } = reasonIds.length
    ? await supabase.from("day_off_reasons").select("id, label").in("id", reasonIds)
    : { data: [], error: null };

  if (reasonsError) throw new Error(reasonsError.message);

  let { data: templateRow, error: templateError } = await supabase
    .from("announcement_templates")
    .select("body_template, include_do_now, include_quote")
    .eq("owner_id", user.id)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (
    templateError &&
    typeof templateError.message === "string" &&
    (templateError.message.includes("include_do_now") ||
      templateError.message.includes("include_quote"))
  ) {
    const retry = await supabase
      .from("announcement_templates")
      .select("body_template")
      .eq("owner_id", user.id)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    templateRow = retry.data
      ? { ...retry.data, include_do_now: false, include_quote: false }
      : null;
    templateError = retry.error;
  }

  if (templateError) throw new Error(templateError.message);

  const template = templateRow?.body_template?.trim() || DEFAULT_TEMPLATE;
  const includeDoNow = templateRow?.include_do_now ?? false;
  const includeQuote = templateRow?.include_quote ?? false;

  const { data: links, error: linksError } = await supabase
    .from("curriculum_lesson_standards")
    .select("lesson_id, standards(code)")
    .in("lesson_id", lessonIds);

  if (linksError) throw new Error(linksError.message);

  const lessonById = new Map((lessons || []).map((lesson) => [lesson.id, lesson]));
  const standardsByLesson = new Map();
  const calendarByDate = new Map((calendarDays || []).map((d) => [d.class_date, d]));
  const reasonById = new Map((reasons || []).map((r) => [r.id, r.label]));

  for (const link of links || []) {
    const arr = standardsByLesson.get(link.lesson_id) || [];
    const code = link.standards?.code;
    if (code && !arr.includes(code)) arr.push(code);
    standardsByLesson.set(link.lesson_id, arr);
  }

  const rows = planRows.map((row) => {
    const lesson = lessonById.get(row.lesson_id);
    const standards = standardsByLesson.get(row.lesson_id) || [];
    const day = calendarByDate.get(row.class_date);
    const reasonLabel = day?.reason_id ? reasonById.get(day.reason_id) : "";
    const dayType = day?.day_type || "instructional";
    const doNow = includeDoNow
      ? buildDoNow({
          lessonTitle: lesson?.title,
          objective: lesson?.objective,
          standards,
        })
      : "";
    const quote = includeQuote
      ? `Quote: "${buildQuote({ classDate: row.class_date, className: course.title })}"`
      : "";

    let content = applyTemplate(template, {
      date: formatDate(row.class_date),
      class_name: course.title || "Class",
      day_type: dayType,
      reason: reasonLabel || "",
      lesson_title: lesson?.title || "TBD",
      objective: lesson?.objective || "No objective provided.",
      standards: standards.length ? standards.join(", ") : "None listed",
      do_now: doNow,
      quote,
    });

    if (includeDoNow && !template.includes("{do_now}")) {
      content = `${content}\n${doNow}`.trim();
    }
    if (includeQuote && !template.includes("{quote}")) {
      content = `${content}\n${quote}`.trim();
    }

    return {
      course_id: course.id,
      class_date: row.class_date,
      content,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from("course_announcements")
    .upsert(rows, { onConflict: "course_id,class_date" });

  if (upsertError) throw new Error(upsertError.message);

  revalidatePath(`/classes/${course.id}/announcements`);
  revalidatePath(`/classes/${course.id}/plan`);
  redirect(`/classes/${course.id}/plan?announcements_updated=1&t=${Date.now()}`);
}
