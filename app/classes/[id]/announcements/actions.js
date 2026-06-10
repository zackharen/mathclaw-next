"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import {
  buildRuleAssignmentsByDate,
  buildSchoolDayNumberByDate,
  buildSchoolWideDayNumberByDate,
} from "@/lib/announcements/assignment-rules";

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday}, ${month}/${day}/${year}`;
}

function formatShortDate(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}`;
}

function getDayOfWeek(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "long" });
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

const DEFAULT_TEMPLATE = `Day #{day_number} | {date} | {ab_day} | {schedule_type}
{lesson_title}
{objective}
{standards}

{assignments}

{teacher_absences}`;

const LEGACY_DEFAULT_TEMPLATE = `Date: {date}
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

function normalizeTemplate(template) {
  const normalized = String(template || "").trim();
  if (!normalized || normalized === LEGACY_DEFAULT_TEMPLATE) {
    return DEFAULT_TEMPLATE;
  }
  return normalized;
}

function titleWithoutCode(lessonTitle) {
  return String(lessonTitle || "")
    .replace(/^\s*[\w.-]+\s*:\s*/u, "")
    .trim();
}

function formatABDay(abDay) {
  return abDay === "A" || abDay === "B" ? `${abDay} Day` : "";
}

function formatScheduleType(dayType) {
  if (dayType === "instructional") return "Full Day Schedule";
  if (dayType === "half") return "Half Day Schedule";
  if (dayType === "modified") return "Modified Day Schedule";
  if (dayType === "grace_day") return "Grace Day Schedule";
  if (dayType === "off") return "No School";
  return "Full Day Schedule";
}

function isMissingTeacherAbsencesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_absences");
}

function isMissingTeacherAnnouncementAssignmentRulesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_announcement_assignment_rules");
}

function isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_announcement_assignment_rule_overrides");
}

function formatTeacherAbsenceList(absences, classDate) {
  const upcomingAbsences = (absences || []).filter(
    (absence) => absence.absence_date >= classDate
  );

  if (upcomingAbsences.length === 0) return "";

  const dates = upcomingAbsences.map((absence) => {
    const note = String(absence.note || "").trim();
    return note ? `${formatShortDate(absence.absence_date)} (${note})` : formatShortDate(absence.absence_date);
  });

  return `I won't be in school on the following dates: ${dates.join(", ")}`;
}

function formatAnnouncementAssignment(assignment) {
  const label = String(assignment?.label || "").trim();
  if (!label) return "";
  return assignment?.due_date ? `${label} | Due ${formatShortDate(assignment.due_date)}` : label;
}

function buildAssignmentText(assignments) {
  return (assignments || [])
    .map(formatAnnouncementAssignment)
    .filter(Boolean)
    .join("\n");
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

export async function generateAnnouncementsForCourse({ supabase, writeClient, userId, course }) {
  const { data: planRows, error: planError } = await supabase
    .from("course_lesson_plan")
    .select("class_date, lesson_slot, lesson_id")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true })
    .order("lesson_slot", { ascending: true });

  if (planError) throw new Error(planError.message);

  const lessonIds = [...new Set((planRows || []).map((row) => row.lesson_id).filter(Boolean))];

  const { data: lessons, error: lessonsError } = lessonIds.length
    ? await supabase.from("curriculum_lessons").select("id, title, objective").in("id", lessonIds)
    : { data: [], error: null };

  if (lessonsError) throw new Error(lessonsError.message);

  const { data: calendarDays, error: calendarError } = await supabase
    .from("course_calendar_days")
    .select("class_date, day_type, ab_day, reason_id")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  if (calendarError) throw new Error(calendarError.message);

  const reasonIds = [...new Set((calendarDays || []).map((d) => d.reason_id).filter(Boolean))];
  const { data: reasons, error: reasonsError } = reasonIds.length
    ? await supabase.from("day_off_reasons").select("id, label").in("id", reasonIds)
    : { data: [], error: null };

  if (reasonsError) throw new Error(reasonsError.message);

  const firstCalendarDate = calendarDays?.[0]?.class_date || course.school_year_start;
  const lastCalendarDate =
    calendarDays?.[calendarDays.length - 1]?.class_date || course.school_year_end || firstCalendarDate;

  let teacherAbsences = [];
  let assignmentRules = [];
  let assignmentRuleOverrides = [];
  let markingPeriodRules = [];
  if (firstCalendarDate && lastCalendarDate) {
    const { data: absencesData, error: absencesError } = await supabase
      .from("teacher_absences")
      .select("absence_date, course_id, note")
      .eq("owner_id", userId)
      .gte("absence_date", firstCalendarDate)
      .lte("absence_date", lastCalendarDate)
      .order("absence_date", { ascending: true });

    if (absencesError && !isMissingTeacherAbsencesTableError(absencesError)) {
      throw new Error(absencesError.message);
    }

    teacherAbsences = (absencesData || []).filter(
      (absence) => !absence.course_id || absence.course_id === course.id
    );

    const { data: rulesData, error: rulesError } = await supabase
      .from("teacher_announcement_assignment_rules")
      .select("id, course_id, label, cadence, count_per_period, settings, is_active")
      .eq("owner_id", userId)
      .eq("is_active", true)
      .order("label", { ascending: true });

    if (
      rulesError &&
      !isMissingTeacherAnnouncementAssignmentRulesTableError(rulesError)
    ) {
      throw new Error(rulesError.message);
    }

    assignmentRules = (rulesData || []).filter(
      (rule) => !rule.course_id || rule.course_id === course.id
    );

    const { data: overridesData, error: overridesError } = await supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .select("id, rule_id, course_id, original_date, assignment_date, is_skipped")
      .eq("owner_id", userId)
      .eq("course_id", course.id)
      .gte("original_date", firstCalendarDate)
      .lte("original_date", lastCalendarDate);

    if (
      overridesError &&
      !isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(overridesError)
    ) {
      throw new Error(overridesError.message);
    }

    assignmentRuleOverrides = overridesData || [];

    const { data: periodsData, error: periodsError } = await supabase
      .from("teacher_marking_period_rules")
      .select("id, name, start_day_number, end_day_number")
      .eq("owner_id", userId)
      .order("start_day_number", { ascending: true });

    if (periodsError && !String(periodsError.message || "").includes("teacher_marking_period_rules")) {
      throw new Error(periodsError.message);
    }

    markingPeriodRules = periodsData || [];
  }

  let schoolCalendarDays = [];
  if (course.school_year_start && course.school_year_end) {
    const { data: schoolDaysData, error: schoolDaysError } = await supabase
      .from("school_calendar_days")
      .select("class_date, day_type")
      .eq("owner_id", userId)
      .gte("class_date", course.school_year_start)
      .lte("class_date", course.school_year_end)
      .order("class_date", { ascending: true });

    if (schoolDaysError && !String(schoolDaysError.message || "").includes("school_calendar_days")) {
      throw new Error(schoolDaysError.message);
    }

    schoolCalendarDays = schoolDaysData || [];
  }

  let { data: templateRow, error: templateError } = await supabase
    .from("announcement_templates")
    .select(
      "body_template, include_do_now, include_quote, include_day_number, include_day_of_week, include_regular_assignments, regular_assignments"
    )
    .eq("owner_id", userId)
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
      .eq("owner_id", userId)
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

  const template = normalizeTemplate(templateRow?.body_template);
  const includeDoNow = templateRow?.include_do_now ?? false;
  const includeQuote = templateRow?.include_quote ?? false;
  const includeDayNumber = templateRow?.include_day_number ?? false;
  const includeDayOfWeek = templateRow?.include_day_of_week ?? false;
  const includeRegularAssignments = templateRow?.include_regular_assignments ?? false;
  const recurringAssignments = parseRecurringAssignments(
    templateRow?.regular_assignments || ""
  );

  const { data: links, error: linksError } = lessonIds.length
    ? await supabase.from("curriculum_lesson_standards").select("lesson_id, standards(code)").in("lesson_id", lessonIds)
    : { data: [], error: null };

  if (linksError) throw new Error(linksError.message);

  const lessonById = new Map((lessons || []).map((lesson) => [lesson.id, lesson]));
  const standardsByLesson = new Map();
  const calendarByDate = new Map((calendarDays || []).map((d) => [d.class_date, d]));
  const schoolDayNumberByDate =
    course.school_year_start && course.school_year_end
      ? buildSchoolWideDayNumberByDate({
          schoolYearStart: course.school_year_start,
          schoolYearEnd: course.school_year_end,
          schoolDays: schoolCalendarDays,
        })
      : buildSchoolDayNumberByDate(calendarDays || []);
  const reasonById = new Map((reasons || []).map((r) => [r.id, r.label]));
  const assignmentsByDate = buildRuleAssignmentsByDate({
    rules: assignmentRules,
    course,
    calendarDays: calendarDays || [],
    markingPeriodRules,
    schoolDayNumberByDate,
    overrides: assignmentRuleOverrides,
  });

  for (const link of links || []) {
    const arr = standardsByLesson.get(link.lesson_id) || [];
    const code = link.standards?.code;
    if (code && !arr.includes(code)) arr.push(code);
    standardsByLesson.set(link.lesson_id, arr);
  }

  const planRowsByDate = new Map();
  for (const row of planRows || []) {
    const rowsForDate = planRowsByDate.get(row.class_date) || [];
    rowsForDate.push(row);
    planRowsByDate.set(row.class_date, rowsForDate);
  }

  function buildAnnouncementContent({ classDate, rowsForDate, lesson, standards, day }) {
    const reasonLabel = day?.reason_id ? reasonById.get(day.reason_id) : "";
    const dayType = day?.day_type || "instructional";
    const abDay = formatABDay(day?.ab_day);
    const scheduleType = formatScheduleType(dayType);
    const lessonSummary = rowsForDate
      .map((row, index) => {
        const rowLesson = lessonById.get(row.lesson_id);
        return `Lesson ${index + 1}: ${rowLesson?.title || "TBD"}`;
      })
      .join("\n");
    const doNow = includeDoNow
      ? buildDoNow({ lessonTitle: lesson?.title, objective: lesson?.objective, standards })
      : "";
    const quote = includeQuote
      ? `Quote: "${buildQuote({ classDate, className: course.title })}"`
      : "";
    const dayOfWeek = getDayOfWeek(classDate);
    const dayNumber = schoolDayNumberByDate.get(classDate) || "";
    const regularAssignment = includeRegularAssignments
      ? recurringAssignmentForDate(classDate, recurringAssignments)
      : "";
    const selectedAssignments = buildAssignmentText(assignmentsByDate.get(classDate) || []);
    const assignments = [selectedAssignments, regularAssignment].filter(Boolean).join("\n");
    const teacherAbsencesText = formatTeacherAbsenceList(teacherAbsences, classDate);

    let content = applyTemplate(template, {
      date: formatDate(classDate),
      class_name: course.title || "Class",
      ab_day: abDay,
      day_type: dayType,
      schedule_type: scheduleType,
      reason: reasonLabel || "",
      lesson_title: rowsForDate.length > 1 ? lessonSummary : lesson?.title || "Grace Day",
      objective: lesson?.objective || "No objective provided.",
      standards: standards.length ? standards.join(", ") : "None listed",
      day_number: dayNumber,
      day_of_week: dayOfWeek,
      assignments,
      regular_assignment: regularAssignment,
      teacher_absences: teacherAbsencesText,
      do_now: doNow,
      quote,
    });

    if (includeDoNow && doNow && !template.includes("{do_now}")) {
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
    if (includeRegularAssignments && regularAssignment && !template.includes("{regular_assignment}")) {
      content = `${content}\nRegular Assignment: ${regularAssignment}`.trim();
    }

    return content;
  }

  const rows = [...planRowsByDate.entries()].map(([classDate, rowsForDate]) => {
    const firstRow = rowsForDate[0];
    const lesson = lessonById.get(firstRow.lesson_id);
    const standards = standardsByLesson.get(firstRow.lesson_id) || [];
    const day = calendarByDate.get(classDate);
    return {
      course_id: course.id,
      class_date: classDate,
      content: buildAnnouncementContent({ classDate, rowsForDate, lesson, standards, day }),
      updated_at: new Date().toISOString(),
    };
  });

  // Also generate announcements for non-off class days that have no lesson rows (e.g. grace days)
  for (const [classDate, day] of calendarByDate.entries()) {
    if (day.day_type === "off") continue;
    if (planRowsByDate.has(classDate)) continue;
    rows.push({
      course_id: course.id,
      class_date: classDate,
      content: buildAnnouncementContent({ classDate, rowsForDate: [], lesson: null, standards: [], day }),
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return 0;

  const { error: upsertError } = await writeClient
    .from("course_announcements")
    .upsert(rows, { onConflict: "course_id,class_date" });

  if (upsertError) throw new Error(upsertError.message);

  return rows.length;
}

export async function generateAnnouncementsAction(formData) {
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
    "id, title, school_year_start, school_year_end, owner_id, schedule_model, ab_meeting_day"
  );
  const course = access?.course;

  if (!course) return;
  const writeClient = getCourseWriteClient(access, supabase);

  await generateAnnouncementsForCourse({
    supabase,
    writeClient,
    userId: user.id,
    course,
  });

  revalidatePath(`/classes/${course.id}/announcements`);
  revalidatePath(`/classes/${course.id}/plan`);
  redirect(`/classes/${course.id}/plan?announcements_updated=1&t=${Date.now()}`);
}
