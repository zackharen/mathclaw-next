import {
  buildRuleAssignmentOccurrences,
  buildSchoolWideDayNumberByDate,
  numberRuleAssignmentOccurrences,
} from "@/lib/announcements/assignment-rules";
import { buildAssessmentCoverage } from "@/lib/announcements/assessment-coverage";
import { isWeeklyAssessmentRule, ruleAppliesToCourse } from "@/lib/announcements/assignment-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { assessmentDefaultLessonCount, nextAssessmentLessonIds } from "@/lib/assessment-resources/defaults";

export const ASSESSMENT_RESOURCE_SELECT =
  "id, owner_id, course_id, rule_id, original_date, assignment_date, assignment_label, assessment_number, resource_type, title, url, storage_bucket, storage_path, file_name, mime_type, size_bytes, created_at";

function missingSchema(error) {
  return Boolean(error && String(error.message || "").includes("assessment_resources"));
}

export async function loadAssessmentScheduleData({ course, admin = createAdminClient() }) {
  const [rulesRes, overridesRes, calendarRes, schoolDaysRes, periodsRes] = await Promise.all([
    admin
      .from("teacher_announcement_assignment_rules")
      .select("id, course_id, label, cadence, count_per_period, settings, is_active")
      .eq("owner_id", course.owner_id)
      .eq("is_active", true),
    admin
      .from("teacher_announcement_assignment_rule_overrides")
      .select("rule_id, course_id, original_date, assignment_date, is_skipped")
      .eq("owner_id", course.owner_id)
      .eq("course_id", course.id),
    admin
      .from("course_calendar_days")
      .select("class_date, day_type, ab_day")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    admin
      .from("school_calendar_days")
      .select("class_date, day_type")
      .eq("owner_id", course.owner_id)
      .gte("class_date", course.school_year_start)
      .lte("class_date", course.school_year_end)
      .order("class_date", { ascending: true }),
    admin
      .from("teacher_marking_period_rules")
      .select("id, name, start_day_number, end_day_number")
      .eq("owner_id", course.owner_id)
      .order("start_day_number", { ascending: true }),
  ]);
  for (const result of [rulesRes, overridesRes, calendarRes, schoolDaysRes, periodsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rules = (rulesRes.data || []).filter((rule) => ruleAppliesToCourse(rule, course.id));
  const markingPeriodRules = periodsRes.data || [];
  const occurrences = numberRuleAssignmentOccurrences(
    buildRuleAssignmentOccurrences({
      rules,
      course,
      calendarDays: calendarRes.data || [],
      markingPeriodRules,
      schoolDayNumberByDate: buildSchoolWideDayNumberByDate({
        schoolYearStart: course.school_year_start,
        schoolYearEnd: course.school_year_end,
        schoolDays: schoolDaysRes.data || [],
      }),
      overrides: overridesRes.data || [],
      includeSkipped: true,
    }),
    markingPeriodRules
  );
  return { rules, markingPeriodRules, occurrences };
}

export async function loadAssessmentFolderData({ userId, course, admin = createAdminClient() }) {
  const schedule = await loadAssessmentScheduleData({ course, admin });
  const { data: lessons, error: lessonsError } = course.selected_library_id
    ? await admin
        .from("curriculum_lessons")
        .select("id, sequence_index, source_lesson_code, title")
        .eq("library_id", course.selected_library_id)
        .order("sequence_index", { ascending: true })
    : { data: [], error: null };
  if (lessonsError) throw new Error(lessonsError.message);

  const { data: resources, error: resourcesError } = await admin
    .from("assessment_resources")
    .select(ASSESSMENT_RESOURCE_SELECT)
    .eq("course_id", course.id)
    .order("created_at", { ascending: false });
  if (resourcesError) {
    if (missingSchema(resourcesError)) {
      return { available: false, ...schedule, lessons: lessons || [], resources: [], defaultLessonIds: [] };
    }
    throw new Error(resourcesError.message);
  }

  const resourceIds = (resources || []).map((resource) => resource.id);
  const { data: associations, error: associationsError } = resourceIds.length
    ? await admin
        .from("assessment_resource_lessons")
        .select("resource_id, lesson_id")
        .in("resource_id", resourceIds)
    : { data: [], error: null };
  if (associationsError) throw new Error(associationsError.message);
  const lessonIdsByResource = new Map();
  for (const row of associations || []) {
    const ids = lessonIdsByResource.get(row.resource_id) || [];
    ids.push(row.lesson_id);
    lessonIdsByResource.set(row.resource_id, ids);
  }
  const withLessons = (resources || []).map((resource) => ({
    ...resource,
    lessonIds: lessonIdsByResource.get(resource.id) || [],
    canDelete: resource.owner_id === userId,
  }));
  const latest = withLessons[0];
  const count = assessmentDefaultLessonCount(course);
  return {
    available: true,
    ...schedule,
    lessons: lessons || [],
    resources: withLessons,
    defaultLessonCount: count,
    defaultLessonIds: nextAssessmentLessonIds({
      lessons: lessons || [],
      latestLessonIds: latest?.lessonIds || [],
      count,
    }),
  };
}

// Which lessons each weekly assessment covers, for the class plan and grid.
// hasWeeklyAssessment is false when no rule is marked as the weekly assessment.
export async function loadAssessmentCoverage({ course, admin = createAdminClient() }) {
  const [schedule, planRes] = await Promise.all([
    loadAssessmentScheduleData({ course, admin }),
    admin
      .from("course_lesson_plan")
      .select("class_date, lesson_slot, curriculum_lessons(source_lesson_code)")
      .eq("course_id", course.id),
  ]);
  if (planRes.error) throw new Error(planRes.error.message);
  return {
    hasWeeklyAssessment: schedule.rules.some(isWeeklyAssessmentRule),
    // Rule work by deadline, labeled as in announcements (e.g. "Choice Board 1.2").
    // A rule with no "Due After" is due the day it's assigned (the rule form's
    // "blank means same day"), so Assessments and Notebook Checks show too.
    dueAssignments: schedule.occurrences
      .filter((occurrence) => !occurrence.is_skipped)
      .map((occurrence) => ({
        id: `rule:${occurrence.rule_id}:${occurrence.original_date}`,
        course_id: course.id,
        label: `${occurrence.label} ${occurrence.assessment_number}`,
        due_date: occurrence.due_date || occurrence.assignment_date,
      })),
    entries: buildAssessmentCoverage({
      rules: schedule.rules,
      occurrences: schedule.occurrences,
      planRows: (planRes.data || []).map((row) => ({
        class_date: row.class_date,
        lesson_slot: row.lesson_slot,
        code: row.curriculum_lessons?.source_lesson_code || "",
      })),
    }),
  };
}

export function occurrenceKey(ruleId, originalDate) {
  return `${ruleId || ""}|${originalDate || ""}`;
}
