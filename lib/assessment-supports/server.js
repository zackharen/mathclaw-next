import { createAdminClient } from "@/lib/supabase/admin";
import { loadAssessmentScheduleData } from "@/lib/assessment-resources/server";
import {
  getAssessmentSupportCost,
  selectUpcomingAssessmentOccurrence,
} from "@/lib/assessment-supports/pricing";

const SETTINGS_SELECT = "course_id, starting_cost, cost_increment, is_published, updated_at, updated_by";
const SUPPORT_SELECT = "id, course_id, source_key, name, description, sort_order, enabled, created_at, updated_at";
const OVERRIDE_SELECT = "course_id, support_id, rule_id, original_date, cost, updated_at, updated_by";
const ACTIVATION_SELECT = "id, course_id, support_id, rule_id, original_date, assignment_date, assessment_label, assessment_number, marking_period_name, marking_period_number, charged_cost, activated_at, recorded_by, voided_at, voided_by";
const USAGE_SELECT = "id, activation_id, course_id, support_id, rule_id, original_date, assignment_date, assessment_label, assessment_number, marking_period_name, marking_period_number, student_id, support_name, support_description, usage_type, charged_cost, recorded_at, recorded_by, voided_at, voided_by, void_reason";

export function isMissingAssessmentSupportsSchema(error) {
  const message = String(error?.message || "");
  return message.includes("course_assessment_support") || message.includes("assessment_support_");
}

export async function loadTeacherAssessmentSupportsData({ supabase, course }) {
  const admin = createAdminClient();
  const schedule = await loadAssessmentScheduleData({ course, admin });
  const [settingsRes, supportsRes, overridesRes, activationsRes, usagesRes, rosterRes] = await Promise.all([
    supabase
      .from("course_assessment_support_settings")
      .select(SETTINGS_SELECT)
      .eq("course_id", course.id)
      .maybeSingle(),
    supabase
      .from("course_assessment_supports")
      .select(SUPPORT_SELECT)
      .eq("course_id", course.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assessment_support_cost_overrides")
      .select(OVERRIDE_SELECT)
      .eq("course_id", course.id),
    supabase
      .from("assessment_support_activations")
      .select(ACTIVATION_SELECT)
      .eq("course_id", course.id)
      .order("activated_at", { ascending: true }),
    supabase
      .from("assessment_support_usages")
      .select(USAGE_SELECT)
      .eq("course_id", course.id)
      .order("recorded_at", { ascending: true }),
    supabase.rpc("list_course_students", { p_course_id: course.id }),
  ]);

  const results = [settingsRes, supportsRes, overridesRes, activationsRes, usagesRes, rosterRes];
  const missingResult = results.find((result) => isMissingAssessmentSupportsSchema(result.error));
  if (missingResult) {
    return { available: false, ...schedule, settings: null, supports: [], overrides: [], activations: [], usages: [], students: [] };
  }
  const failedResult = results.find((result) => result.error);
  if (failedResult) throw new Error(failedResult.error.message);

  const teacherIds = [...new Set(
    [...(activationsRes.data || []), ...(usagesRes.data || [])]
      .flatMap((row) => [row.recorded_by, row.voided_by])
      .filter(Boolean)
  )];
  const { data: teacherProfiles, error: teacherProfilesError } = teacherIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", teacherIds)
    : { data: [], error: null };
  if (teacherProfilesError) throw new Error(teacherProfilesError.message);

  return {
    available: true,
    ...schedule,
    settings: settingsRes.data,
    supports: supportsRes.data || [],
    overrides: overridesRes.data || [],
    activations: activationsRes.data || [],
    usages: usagesRes.data || [],
    students: (rosterRes.data || []).map((row) => ({
      id: row.profile_id,
      display_name: row.display_name || `Student ${String(row.profile_id || "").slice(0, 8)}`,
    })),
    teachers: teacherProfiles || [],
  };
}

export async function loadStudentAssessmentSupportsData({ supabase, userId, course, todayIso }) {
  const [settingsRes, supportsRes, usagesRes] = await Promise.all([
    supabase
      .from("course_assessment_support_settings")
      .select(SETTINGS_SELECT)
      .eq("course_id", course.id)
      .eq("is_published", true)
      .maybeSingle(),
    supabase
      .from("course_assessment_supports")
      .select(SUPPORT_SELECT)
      .eq("course_id", course.id)
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assessment_support_usages")
      .select(USAGE_SELECT)
      .eq("course_id", course.id)
      .eq("student_id", userId)
      .order("recorded_at", { ascending: false }),
  ]);
  const results = [settingsRes, supportsRes, usagesRes];
  const missingResult = results.find((result) => isMissingAssessmentSupportsSchema(result.error));
  if (missingResult) return { available: false, published: false, supports: [], usages: [] };
  const failedResult = results.find((result) => result.error);
  if (failedResult) throw new Error(failedResult.error.message);
  if (!settingsRes.data) {
    return { available: true, published: false, supports: [], usages: usagesRes.data || [] };
  }

  const admin = createAdminClient();
  const schedule = await loadAssessmentScheduleData({ course, admin });
  const upcomingOccurrence = selectUpcomingAssessmentOccurrence(schedule.occurrences, todayIso);
  const [activationsRes, overridesRes] = upcomingOccurrence
    ? await Promise.all([
        admin
          .from("assessment_support_activations")
          .select(ACTIVATION_SELECT)
          .eq("course_id", course.id),
        admin
          .from("assessment_support_cost_overrides")
          .select(OVERRIDE_SELECT)
          .eq("course_id", course.id)
          .eq("rule_id", upcomingOccurrence.rule_id)
          .eq("original_date", upcomingOccurrence.original_date),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (activationsRes.error) throw new Error(activationsRes.error.message);
  if (overridesRes.error) throw new Error(overridesRes.error.message);

  return {
    available: true,
    published: true,
    settings: settingsRes.data,
    supports: (supportsRes.data || []).map((support) => ({
      ...support,
      current_cost: upcomingOccurrence
        ? getAssessmentSupportCost({
            settings: settingsRes.data,
            supportId: support.id,
            occurrence: upcomingOccurrence,
            activations: activationsRes.data || [],
            overrides: overridesRes.data || [],
          })
        : null,
    })),
    upcomingOccurrence,
    usages: usagesRes.data || [],
  };
}
