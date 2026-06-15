import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { buildRuleAssignmentOccurrences } from "@/lib/announcements/assignment-rules";

function shortMonthDate(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).split("-").map(Number);
  return `${m}/${d}`;
}

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${m}/${d}/${y}`;
}

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

function formatAssignmentRuleSummary(rule) {
  const settings = rule?.settings || {};
  const startSuffix = settings.start_date ? `, starting ${shortMonthDate(settings.start_date)}` : "";
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

function formatAssignmentOccurrence(occurrence) {
  const due = occurrence.due_date ? ` | Due ${shortMonthDate(occurrence.due_date)}` : "";
  const moved =
    occurrence.assignment_date !== occurrence.original_date
      ? ` (from ${shortMonthDate(occurrence.original_date)})`
      : "";
  return `${shortDate(occurrence.assignment_date)}${moved}: ${occurrence.label}${due}`;
}

function isMissingTable(error, tableName) {
  return Boolean(error && String(error.message || "").includes(tableName));
}

async function loadAssignmentPanelData({ courseId }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, owner_id, school_year_start, school_year_end, schedule_model, ab_meeting_day"
  );
  const course = access?.course;

  if (!course) return null;

  const [
    rulesRes,
    overridesRes,
    calendarDaysRes,
    schoolDaysRes,
    markingPeriodRulesRes,
  ] = await Promise.all([
    supabase
      .from("teacher_announcement_assignment_rules")
      .select("id, course_id, label, cadence, count_per_period, settings, is_active")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("label", { ascending: true }),
    supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .select("id, rule_id, course_id, original_date, assignment_date, is_skipped")
      .eq("owner_id", user.id)
      .eq("course_id", course.id)
      .gte("original_date", course.school_year_start)
      .lte("original_date", course.school_year_end),
    supabase
      .from("course_calendar_days")
      .select("class_date, day_type, ab_day")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    supabase
      .from("school_calendar_days")
      .select("class_date, day_type")
      .eq("owner_id", user.id)
      .gte("class_date", course.school_year_start)
      .lte("class_date", course.school_year_end)
      .order("class_date", { ascending: true }),
    supabase
      .from("teacher_marking_period_rules")
      .select("id, name, start_day_number, end_day_number")
      .eq("owner_id", user.id)
      .order("start_day_number", { ascending: true }),
  ]);

  if (rulesRes.error && !isMissingTable(rulesRes.error, "teacher_announcement_assignment_rules")) {
    throw new Error(rulesRes.error.message);
  }
  if (overridesRes.error && !isMissingTable(overridesRes.error, "teacher_announcement_assignment_rule_overrides")) {
    throw new Error(overridesRes.error.message);
  }

  const rules = (rulesRes.data || []).filter((rule) => !rule.course_id || rule.course_id === course.id);
  const overrides = overridesRes.data || [];
  const calendarDays = calendarDaysRes.data || [];
  const markingPeriodRules = markingPeriodRulesRes.data || [];
  const schoolDayByDate = new Map((schoolDaysRes.data || []).map((day) => [day.class_date, day]));
  const schoolDayNumberByDate = new Map();

  if (course.school_year_start && course.school_year_end) {
    const [sy, sm, sd] = course.school_year_start.split("-").map(Number);
    const [ey, em, ed] = course.school_year_end.split("-").map(Number);
    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const endDate = new Date(Date.UTC(ey, em - 1, ed));
    let dayNumber = 0;
    while (cursor <= endDate) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const iso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
        if (schoolDayByDate.get(iso)?.day_type !== "off") {
          dayNumber += 1;
          schoolDayNumberByDate.set(iso, dayNumber);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const occurrences = buildRuleAssignmentOccurrences({
    rules,
    course,
    calendarDays,
    markingPeriodRules,
    schoolDayNumberByDate,
    overrides,
  });
  const upcoming = occurrences.filter((occurrence) => occurrence.assignment_date >= todayIso).slice(0, 12);

  return { rules, upcoming };
}

export default async function ClassPlanLayout({ children, params }) {
  const { id } = await params;
  const panelData = await loadAssignmentPanelData({ courseId: id });
  const rules = panelData?.rules || [];
  const upcoming = panelData?.upcoming || [];

  return (
    <>
      {rules.length > 0 ? (
        <div className="stack" style={{ marginBottom: "1rem" }}>
          <section className="card">
            <h2>Announcement Assignments</h2>
            <div className="list" style={{ gap: "0.65rem", marginTop: "0.75rem" }}>
              {rules.map((rule) => (
                <div key={rule.id} className="card" style={{ background: "#fff" }}>
                  <h3>{rule.label}</h3>
                  <p>{rule.course_id ? "This class only" : "All classes"}</p>
                  <p>{formatAssignmentRuleSummary(rule)}</p>
                </div>
              ))}
            </div>
            {upcoming.length > 0 ? (
              <details className="inlineDetails" style={{ marginTop: "0.75rem" }}>
                <summary className="btn">Upcoming Assignment Dates</summary>
                <div className="controlExpandedPanel">
                  <div className="list" style={{ gap: "0.35rem" }}>
                    {upcoming.map((occurrence) => (
                      <p key={`${occurrence.rule_id}-${occurrence.original_date}`}>
                        {formatAssignmentOccurrence(occurrence)}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            ) : (
              <p style={{ marginTop: "0.75rem" }}>No upcoming assignment dates generated for this class.</p>
            )}
            <div className="ctaRow">
              <Link className="btn" href="/onboarding/profile#announcement-assignments">
                Edit Assignments
              </Link>
            </div>
          </section>
        </div>
      ) : null}
      {children}
    </>
  );
}
