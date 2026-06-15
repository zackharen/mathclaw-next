import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { listEditableCoursesForUser } from "@/lib/courses/access";

function weekdayName(value) {
  const names = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
  };
  return names[Number(value)] || "";
}

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function formatAssignmentRuleSummary(rule) {
  const settings = rule?.settings || {};
  const startSuffix = settings.start_date ? `, starting ${shortDate(settings.start_date)}` : "";
  const dueDays = Number.parseInt(String(settings.due_school_days || ""), 10);
  const dueSuffix =
    Number.isInteger(dueDays) && dueDays > 0
      ? `, due ${dueDays} school day${dueDays === 1 ? "" : "s"} later`
      : "";

  if (rule.cadence === "weekly" || rule.cadence === "biweekly") {
    const weekInterval = settings.week_interval || (rule.cadence === "biweekly" ? 2 : 1);
    const days = (settings.weekdays || [5]).map(weekdayName).filter(Boolean).join(", ");
    return `Every ${weekInterval} week${Number(weekInterval) === 1 ? "" : "s"} on ${days}${startSuffix}${dueSuffix}`;
  }

  if (rule.cadence === "monthly") {
    const days = (settings.month_days || [1]).slice(0, 1).join(", ");
    const shift = settings.monthly_shift === "before" ? "before" : "after";
    return `Every month on day ${days}; if needed, use the first school day ${shift}${startSuffix}${dueSuffix}`;
  }

  const count = rule.count_per_period || 1;
  const days = settings.weekdays?.length
    ? ` on ${settings.weekdays.map(weekdayName).filter(Boolean).join(", ")}`
    : "";
  return `${count} time${count === 1 ? "" : "s"} per marking period${days}${startSuffix}${dueSuffix}`;
}

function isMissingTable(error) {
  return Boolean(
    error &&
      String(error.message || "").includes("teacher_announcement_assignment_rules")
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ assignmentsByCourseId: {} }, { status: 401 });
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return NextResponse.json({ assignmentsByCourseId: {} }, { status: 403 });
  }

  const [courses, rulesRes] = await Promise.all([
    listEditableCoursesForUser(supabase, user.id, "id, title, owner_id, created_at"),
    supabase
      .from("teacher_announcement_assignment_rules")
      .select("id, course_id, label, cadence, count_per_period, settings, is_active")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("label", { ascending: true }),
  ]);

  if (rulesRes.error && !isMissingTable(rulesRes.error)) {
    return NextResponse.json({ error: rulesRes.error.message }, { status: 500 });
  }

  const rules = rulesRes.data || [];
  const assignmentsByCourseId = {};

  for (const course of courses || []) {
    assignmentsByCourseId[course.id] = rules
      .filter((rule) => !rule.course_id || rule.course_id === course.id)
      .map((rule) => ({
        id: rule.id,
        label: rule.label,
        scope: rule.course_id ? "This class only" : "All classes",
        summary: formatAssignmentRuleSummary(rule),
      }));
  }

  return NextResponse.json({ assignmentsByCourseId });
}
