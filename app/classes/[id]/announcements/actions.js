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

function getDayOfWeek(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getDayNumber(isoDate, schoolYearStart) {
  const start = new Date(`${schoolYearStart}T00:00:00`);
  const date = new Date(`${isoDate}T00:00:00`);
  const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff >= 0 ? String(diff + 1) : "";
}

function parseRecurringAssignments(rawText) {
  const map = new Map();
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [left, ...rest] = line.split(":");
    if (!left || rest.length === 0) continue;
    const key = left.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value) continue;
    map.set(key, value);
  }
  return map;
}

function recurringAssignmentForDate(isoDate, assignmentsMap) {
  const weekday = getDayOfWeek(isoDate).toLowerCase();
  const short = weekday.slice(0, 3);
  return (
    assignmentsMap.get(weekday) ||
    assignmentsMap.get(short) ||
    ""
  );
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
    .select("id, title, school_year_start")
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
    .select(
      "body_template, include_do_now, include_quote, include_day_number, include_day_of_week, include_regular_assignments, regular_assignments"
    )
    .eq("owner_id", user.id)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (
    templateError &&
    typeof templateError.message === "string" &&
    (templateError.message.includes("include_do_now") ||
      templateError.message.includes("include_quote") ||
      templateError.message.includes("include_day_number") ||
      templateError.message.includes("include_day_of_week") ||
      templateError.message.includes("include_regular_assignments") ||
      templateError.message.includes("regular_assignments"))
  ) {
    const retry = await supabase
      .from("announcement_templates")
      .select("body_template")
      .eq("owner_id", user.id)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    templateRow = retry.data
      ? {
          ...retry.data,
          include_do_now: false,
          include_quote: false,
          include_day_number: false,
          include_day_of_week: false,
          include_regular_assignments: false,
          regular_assignments: "",
        }
      : null;
    templateError = retry.error;
  }

  if (templateError) throw new Error(templateError.message);

  const template = templateRow?.body_template?.trim() || DEFAULT_TEMPLATE;
  const includeDoNow = templateRow?.include_do_now ?? false;
  const includeQuote = templateRow?.include_quote ?? false;
  const includeDayNumber = templateRow?.include_day_number ?? false;
  const includeDayOfWeek = templateRow?.include_day_of_week ?? false;
  const includeRegularAssignments = templateRow?.include_regular_assignments ?? false;
  const recurringAssignments = parseRecurringAssignments(
    templateRow?.regular_assignments || ""
  );

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
    const dayOfWeek = includeDayOfWeek ? getDayOfWeek(row.class_date) : "";
    const dayNumber = includeDayNumber
      ? getDayNumber(row.class_date, course.school_year_start || row.class_date)
      : "";
    const regularAssignment = includeRegularAssignments
      ? recurringAssignmentForDate(row.class_date, recurringAssignments)
      : "";

    let content = applyTemplate(template, {
      date: formatDate(row.class_date),
      class_name: course.title || "Class",
      day_type: dayType,
      reason: reasonLabel || "",
      lesson_title: lesson?.title || "TBD",
      objective: lesson?.objective || "No objective provided.",
      standards: standards.length ? standards.join(", ") : "None listed",
      day_number: dayNumber,
      day_of_week: dayOfWeek,
      regular_assignment: regularAssignment,
      do_now: doNow,
      quote,
    });

    if (includeDoNow && !template.includes("{do_now}")) {
      content = `${content}\n${doNow}`.trim();
    }
    if (includeQuote && !template.includes("{quote}")) {
      content = `${content}\n${quote}`.trim();
    }
    if (includeDayNumber && dayNumber && !template.includes("{day_number}")) {
      content = `${content}\nDay Number: ${dayNumber}`.trim();
    }
    if (includeDayOfWeek && dayOfWeek && !template.includes("{day_of_week}")) {
      content = `${content}\nDay of Week: ${dayOfWeek}`.trim();
    }
    if (
      includeRegularAssignments &&
      regularAssignment &&
      !template.includes("{regular_assignment}")
    ) {
      content = `${content}\nRegular Assignment: ${regularAssignment}`.trim();
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
