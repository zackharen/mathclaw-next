import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { listSchoolOptions } from "@/lib/schools";
import ProfileForm from "./profile-form";
import AnnouncementAssignmentRuleForm from "./announcement-assignment-rule-form";
import { getSiteCopy } from "@/lib/site-config";
import {
  deleteTeacherAnnouncementAssignmentRuleAction,
  deleteTeacherMarkingPeriodAction,
  saveTeacherAnnouncementAssignmentRuleOccurrenceClassesAction,
  saveStandardMarkingPeriodRulesAction,
  saveAnnouncementTemplateAction,
  saveTeacherAnnouncementAssignmentRuleAction,
  pushSchoolCalendarToAllClassesAction,
  saveSchoolCalendarAction,
  saveTeacherMarkingPeriodAction,
} from "./actions";
import { joinClassByCodeAction } from "@/app/play/actions";
import { buildRuleAssignmentOccurrences } from "@/lib/announcements/assignment-rules";
import {
  buildABMap,
  isCalendarWeekStart,
  isGraceDay,
  normalizeCalendarDayType,
} from "@/lib/school-calendar";
import SubmitButton from "@/app/components/SubmitButton";

const DEFAULT_ANNOUNCEMENT_TEMPLATE = `Day #{day_number} | {date} | {ab_day} | {schedule_type}
{lesson_title}
{objective}
{standards}

{assignments}

{teacher_absences}`;

const LEGACY_DEFAULT_ANNOUNCEMENT_TEMPLATE = `Date: {date}
Class: {class_name}
Day Type: {day_type}
Lesson: {lesson_title}
Objective: {objective}
Standards: {standards}`;

function normalizeAnnouncementTemplate(template) {
  const normalized = String(template || "").trim();
  if (!normalized || normalized === LEGACY_DEFAULT_ANNOUNCEMENT_TEMPLATE) {
    return DEFAULT_ANNOUNCEMENT_TEMPLATE;
  }
  return normalized;
}

function defaultSchoolYearDates() {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    start: `${year}-09-01`,
    end: `${year + 1}-06-30`,
  };
}

function parseDateAtUTC(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prettyDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function shortDate(value) {
  if (!value) return "";
  const [, month, day] = value.split("-").map(Number);
  return `${month}/${day}`;
}

function courseLabel(course) {
  const title = course?.title || "Class";
  const className = course?.class_name ? ` (${course.class_name})` : "";
  return `${title}${className}`;
}

function buildWeekdays(startIso, endIso) {
  const start = parseDateAtUTC(startIso);
  const end = parseDateAtUTC(endIso);
  const dates = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    dates.push(toISODate(cursor));
  }

  return dates;
}

function buildSchoolDayNumberMap(weekdays, schoolDayByDate) {
  const map = new Map();
  let dayNumber = 0;

  for (const date of weekdays) {
    const row = schoolDayByDate.get(date);
    if (row?.day_type === "off") continue;
    dayNumber += 1;
    map.set(dayNumber, date);
  }

  return { map, count: dayNumber };
}

function markingPeriodDateText(period, schoolDayNumberMap) {
  const startDate = schoolDayNumberMap.get(period.start_day_number);
  const endDate = schoolDayNumberMap.get(period.end_day_number);

  if (startDate && endDate) {
    return `${prettyDate(startDate)} to ${prettyDate(endDate)}`;
  }
  if (startDate) {
    return `${prettyDate(startDate)} to beyond the calendar (Day #${period.end_day_number} is not scheduled)`;
  }
  return `Beyond the calendar (Day #${period.start_day_number} is not scheduled)`;
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || "");
  return message.includes(tableName);
}

function schoolCalendarErrorText(code) {
  if (code === "date") {
    return "Use dates like 9/1/2025 or 2025-09-01.";
  }
  if (code === "range") {
    return "School Year Start must be before School Year End.";
  }
  if (code === "profile") {
    return "The dates did not finish saving. Try again.";
  }
  if (code) {
    return "Could not save school calendar.";
  }
  return "";
}


const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

function weekdayName(value) {
  return WEEKDAY_OPTIONS.find((day) => day.value === Number(value))?.label || "Friday";
}

function ruleScopeText(rule, courseById) {
  return rule.course_id ? courseLabel(courseById.get(rule.course_id)) : "All classes";
}

function ruleSummary(rule) {
  const settings = rule.settings || {};
  const count = rule.count_per_period || 1;
  const startSuffix = settings.start_date ? `, starting ${shortDate(settings.start_date)}` : "";
  const dueDays = Number.parseInt(String(settings.due_school_days || ""), 10);
  const dueSuffix =
    Number.isInteger(dueDays) && dueDays > 0
      ? `, due ${dueDays} school day${dueDays === 1 ? "" : "s"} later`
      : "";
  if (rule.cadence === "weekly" || rule.cadence === "biweekly") {
    const weekInterval = settings.week_interval || (rule.cadence === "biweekly" ? 2 : 1);
    const days = (settings.weekdays || [5]).map(weekdayName).join(", ");
    return `Every ${weekInterval} week${Number(weekInterval) === 1 ? "" : "s"} on ${days}${startSuffix}${dueSuffix}`;
  }
  if (rule.cadence === "monthly") {
    const days = (settings.month_days || [1]).slice(0, 1).join(", ");
    const shift = settings.monthly_shift === "before" ? "before" : "after";
    return `Every month on day ${days}; if needed, use the first school day ${shift}${startSuffix}${dueSuffix}`;
  }
  const days = settings.weekdays?.length
    ? ` on ${settings.weekdays.map(weekdayName).join(", ")}`
    : "";
  return `${count} time${count === 1 ? "" : "s"} per marking period${days}${startSuffix}${dueSuffix}`;
}

function buildAssignmentRulePreviews({ rules, courses, calendarDaysByCourseId, markingPeriods, overrides, schoolDayNumberByDate }) {
  const previewsByRuleId = new Map();
  for (const rule of rules || []) {
    const scopedCourses = rule.course_id
      ? (courses || []).filter((course) => course.id === rule.course_id)
      : courses || [];
    const previews = [];

    for (const course of scopedCourses) {
      const calendarDays = calendarDaysByCourseId.get(course.id) || [];
      const courseOverrides = (overrides || []).filter(
        (override) => override.rule_id === rule.id && override.course_id === course.id
      );
      const occurrences = buildRuleAssignmentOccurrences({
        rules: [rule],
        course,
        calendarDays,
        markingPeriodRules: markingPeriods,
        schoolDayNumberByDate,
        overrides: courseOverrides,
        includeSkipped: true,
      });
      for (const occurrence of occurrences) {
        previews.push({
          ...occurrence,
          course_label: courseLabel(course),
        });
      }
    }

    const groups = new Map();
    for (const preview of previews) {
      const group = groups.get(preview.original_date) || {
        rule_id: rule.id,
        original_date: preview.original_date,
        assignment_date: preview.original_date,
        marking_periods: [],
        classes: [],
      };
      if (!preview.is_skipped && group.assignment_date === group.original_date) {
        group.assignment_date = preview.assignment_date;
      }
      if (preview.marking_period && !group.marking_periods.includes(preview.marking_period)) {
        group.marking_periods.push(preview.marking_period);
      }
      group.classes.push(preview);
      groups.set(preview.original_date, group);
    }

    previewsByRuleId.set(
      rule.id,
      Array.from(groups.values()).sort((a, b) => a.original_date.localeCompare(b.original_date))
    );
  }
  return previewsByRuleId;
}

// The loaders below were inline awaits in the page body. They are extracted verbatim so
// the page can run them as parallel waves instead of one long chain of round trips.
async function loadProfileRow(admin, userId) {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "display_name, nickname, school_name, timezone, discoverable, school_year_start, school_year_end"
    )
    .eq("id", userId)
    .maybeSingle();

  if (
    error &&
    typeof error.message === "string" &&
    (error.message.includes("nickname") ||
      error.message.includes("school_year_start") ||
      error.message.includes("discoverable"))
  ) {
    const retry = await admin
      .from("profiles")
      .select("display_name, school_name, timezone, school_year_start, school_year_end")
      .eq("id", userId)
      .maybeSingle();

    return retry.data ? { ...retry.data, nickname: "", discoverable: true } : null;
  }

  return data;
}

async function loadSchoolCalendarDays(supabase, userId, schoolYearStart, schoolYearEnd) {
  const { data, error } = await supabase
    .from("school_calendar_days")
    .select("class_date, day_type, is_grace_day, reason_id, note")
    .eq("owner_id", userId)
    .gte("class_date", schoolYearStart)
    .lte("class_date", schoolYearEnd)
    .order("class_date", { ascending: true });

  if (error && isMissingTableError(error, "school_calendar_days")) {
    return { schoolDays: [], overridesUnavailable: true };
  }
  if (error) throw new Error(error.message);
  return { schoolDays: data || [], overridesUnavailable: false };
}

async function loadMarkingPeriods(supabase, userId, isTeacher) {
  if (!isTeacher) return { markingPeriods: [], migrationNeeded: false };

  const { data, error } = await supabase
    .from("teacher_marking_period_rules")
    .select("id, name, start_day_number, end_day_number")
    .eq("owner_id", userId)
    .order("start_day_number", { ascending: true });

  if (error && typeof error.message === "string" && error.message.includes("teacher_marking_period_rules")) {
    return { markingPeriods: [], migrationNeeded: true };
  }
  if (error) throw new Error(error.message);
  return { markingPeriods: data || [], migrationNeeded: false };
}

async function loadTeacherAbsences(supabase, userId, isTeacher, schoolYearStart, schoolYearEnd) {
  if (!isTeacher) return { teacherAbsences: [], migrationNeeded: false };

  const { data, error } = await supabase
    .from("teacher_absences")
    .select("id, absence_date, course_id, note")
    .eq("owner_id", userId)
    .gte("absence_date", schoolYearStart)
    .lte("absence_date", schoolYearEnd)
    .order("absence_date", { ascending: true });

  if (error && typeof error.message === "string" && error.message.includes("teacher_absences")) {
    return { teacherAbsences: [], migrationNeeded: true };
  }
  if (error) throw new Error(error.message);
  return { teacherAbsences: data || [], migrationNeeded: false };
}

async function loadAssignmentRuleState(supabase, userId, isTeacher, schoolYearStart, schoolYearEnd) {
  if (!isTeacher) {
    return { rules: [], overrides: [], rulesMigrationNeeded: false, overridesMigrationNeeded: false };
  }

  const [
    { data: rulesData, error: rulesError },
    { data: overridesData, error: overridesError },
  ] = await Promise.all([
    supabase
      .from("teacher_announcement_assignment_rules")
      .select("id, course_id, label, cadence, count_per_period, settings, is_active")
      .eq("owner_id", userId)
      .eq("is_active", true)
      .order("label", { ascending: true }),
    supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .select("id, rule_id, course_id, original_date, assignment_date, is_skipped")
      .eq("owner_id", userId)
      .gte("original_date", schoolYearStart)
      .lte("original_date", schoolYearEnd),
  ]);

  let rules = [];
  let rulesMigrationNeeded = false;
  if (
    rulesError &&
    typeof rulesError.message === "string" &&
    rulesError.message.includes("teacher_announcement_assignment_rules")
  ) {
    rulesMigrationNeeded = true;
  } else if (rulesError) {
    throw new Error(rulesError.message);
  } else {
    rules = rulesData || [];
  }

  let overrides = [];
  let overridesMigrationNeeded = false;
  if (
    overridesError &&
    typeof overridesError.message === "string" &&
    overridesError.message.includes("teacher_announcement_assignment_rule_overrides")
  ) {
    overridesMigrationNeeded = true;
  } else if (overridesError) {
    throw new Error(overridesError.message);
  } else {
    overrides = overridesData || [];
  }

  return { rules, overrides, rulesMigrationNeeded, overridesMigrationNeeded };
}

async function loadAnnouncementTemplate(supabase, userId) {
  const { data, error } = await supabase
    .from("announcement_templates")
    .select(
      "body_template, include_do_now, include_quote, include_day_number, include_day_of_week, include_regular_assignments, regular_assignments"
    )
    .eq("owner_id", userId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (
    error &&
    typeof error.message === "string" &&
    (error.message.includes("include_do_now") ||
      error.message.includes("include_quote") ||
      error.message.includes("include_day_number") ||
      error.message.includes("include_day_of_week") ||
      error.message.includes("include_regular_assignments") ||
      error.message.includes("regular_assignments"))
  ) {
    const retry = await supabase
      .from("announcement_templates")
      .select("body_template")
      .eq("owner_id", userId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    if (retry.error) throw new Error(retry.error.message);
    return retry.data
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
  }

  if (error) throw new Error(error.message);
  return data;
}

export default async function OnboardingProfilePage({ searchParams }) {
  const qs = (await searchParams) || {};
  const schoolCalendarUpdated = qs.school_calendar_updated === "1";
  const schoolCalendarPushed = qs.school_calendar_pushed === "1";
  const schoolCalendarPushError = qs.school_calendar_push_error || "";
  const schoolCalendarError = qs.school_calendar_error || "";
  const schoolCalendarErrorMessage = schoolCalendarErrorText(schoolCalendarError);
  const templateUpdated = qs.template_updated === "1";
  const absenceUpdated = qs.absence_updated === "1";
  const absenceError = qs.absence_error;
  const markingPeriodUpdated = qs.marking_period_updated === "1";
  const markingPeriodError = qs.marking_period_error;
  const assignmentsUpdated = qs.assignments_updated === "1";
  const assignmentError = qs.assignment_error;
  const siteCopyPromise = getSiteCopy();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const admin = createAdminClient();
  const defaults = defaultSchoolYearDates();

  // Wave 1: nothing here depends on anything else this page loads.
  const [siteCopy, accountType, schoolOptions, profile] = await Promise.all([
    siteCopyPromise,
    getAccountTypeForUser(supabase, user),
    listSchoolOptions().catch(() => []),
    loadProfileRow(admin, user.id),
  ]);

  const isTeacher = isTeacherAccountType(accountType);
  const schoolYearStart = profile?.school_year_start || defaults.start;
  const schoolYearEnd = profile?.school_year_end || defaults.end;

  // Wave 2: every read below needs only the school-year window and the account type,
  // so they run together rather than as eight sequential round trips.
  const [
    { data: abSeedCourse },
    { data: teacherCourses },
    { data: reasons },
    schoolCalendar,
    markingPeriodState,
    absenceState,
    assignmentRuleState,
    templateRow,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("ab_pattern_start_date")
      .eq("owner_id", user.id)
      .eq("schedule_model", "ab")
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    isTeacher
      ? supabase
          .from("courses")
          .select("id, title, class_name, school_year_start, school_year_end, schedule_model, ab_meeting_day")
          .eq("owner_id", user.id)
          .is("archived_at", null)
          .order("title", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("day_off_reasons")
      .select("id, label")
      .or(`owner_id.is.null,owner_id.eq.${user.id}`)
      .order("label", { ascending: true }),
    loadSchoolCalendarDays(supabase, user.id, schoolYearStart, schoolYearEnd),
    loadMarkingPeriods(supabase, user.id, isTeacher),
    loadTeacherAbsences(supabase, user.id, isTeacher, schoolYearStart, schoolYearEnd),
    loadAssignmentRuleState(supabase, user.id, isTeacher, schoolYearStart, schoolYearEnd),
    loadAnnouncementTemplate(supabase, user.id),
  ]);

  const weekdays = buildWeekdays(schoolYearStart, schoolYearEnd);
  const abPatternStartIso = abSeedCourse?.ab_pattern_start_date || schoolYearStart;

  const schoolDays = schoolCalendar.schoolDays;
  const schoolCalendarOverridesUnavailable = schoolCalendar.overridesUnavailable;

  const schoolDayByDate = new Map(
    (schoolDays || []).map((row) => [row.class_date, row])
  );
  const abByDate = buildABMap(weekdays, abPatternStartIso, schoolDayByDate);
  const { map: schoolDayNumberMap, count: schoolDayCount } =
    buildSchoolDayNumberMap(weekdays, schoolDayByDate);

  const dateToSchoolDayNumber = new Map(
    Array.from(schoolDayNumberMap.entries()).map(([num, date]) => [date, num])
  );

  const markingPeriods = markingPeriodState.markingPeriods;
  const markingPeriodsMigrationNeeded = markingPeriodState.migrationNeeded;

  // Official school-year accounting: the target year length is the highest
  // marking period day number (180 with standard quarters).
  const markingPeriodTargetDay = markingPeriods.length
    ? Math.max(...markingPeriods.map((period) => period.end_day_number))
    : 180;
  const markingPeriodFinalDate = schoolDayNumberMap.get(markingPeriodTargetDay) || "";
  const markingPeriodShortfall = Math.max(0, markingPeriodTargetDay - schoolDayCount);
  const markingPeriodExtraDays = Math.max(0, schoolDayCount - markingPeriodTargetDay);

  const teacherAbsences = absenceState.teacherAbsences;
  const absencesMigrationNeeded = absenceState.migrationNeeded;

  const teacherCourseById = new Map(
    (teacherCourses || []).map((course) => [course.id, course])
  );
  const assignmentFormCourses = (teacherCourses || []).map((course) => ({
    id: course.id,
    label: courseLabel(course),
  }));
  const longestCourseLabelChars = Math.max(
    0,
    ...assignmentFormCourses.map((course) => course.label.length)
  );
  const classesColumnWidth = `max(12rem, ${longestCourseLabelChars + 7}ch)`;

  const assignmentRules = assignmentRuleState.rules;
  const assignmentRuleOverrides = assignmentRuleState.overrides;
  const assignmentRulesMigrationNeeded = assignmentRuleState.rulesMigrationNeeded;
  const assignmentRuleOverridesMigrationNeeded = assignmentRuleState.overridesMigrationNeeded;

  // Wave 3: the only read that needs the course list loaded above.
  let assignmentCalendarDays = [];
  if (isTeacher && teacherCourses?.length) {
    const { data: calendarData, error: calendarError } = await supabase
      .from("course_calendar_days")
      .select("course_id, class_date, day_type, ab_day")
      .in("course_id", teacherCourses.map((course) => course.id))
      .gte("class_date", schoolYearStart)
      .lte("class_date", schoolYearEnd)
      .order("class_date", { ascending: true });

    if (calendarError) {
      throw new Error(calendarError.message);
    }
    assignmentCalendarDays = calendarData || [];
  }

  const assignmentCalendarDaysByCourseId = new Map();
  for (const day of assignmentCalendarDays) {
    const arr = assignmentCalendarDaysByCourseId.get(day.course_id) || [];
    arr.push(day);
    assignmentCalendarDaysByCourseId.set(day.course_id, arr);
  }
  const assignmentRulePreviews = buildAssignmentRulePreviews({
    rules: assignmentRules,
    courses: teacherCourses || [],
    calendarDaysByCourseId: assignmentCalendarDaysByCourseId,
    markingPeriods,
    overrides: assignmentRuleOverrides,
    schoolDayNumberByDate: dateToSchoolDayNumber,
  });

  const defaultTemplate = normalizeAnnouncementTemplate(templateRow?.body_template);
  const includeDoNow = templateRow?.include_do_now ?? false;
  const includeQuote = templateRow?.include_quote ?? false;
  const includeDayNumber = templateRow?.include_day_number ?? false;
  const includeDayOfWeek = templateRow?.include_day_of_week ?? false;
  const includeRegularAssignments = templateRow?.include_regular_assignments ?? false;
  const regularAssignments = templateRow?.regular_assignments || "";

  return (
    <div className="stack profileWorkspace">
      <section className="profileWorkspaceHero">
        <div className="profileWorkspaceHeroCopy">
          <p className="eyebrow">Account workspace</p>
          <h1>{siteCopy.profileTitle}</h1>
          <p>
            {accountType === "teacher"
              ? siteCopy.profileTeacherDescription
              : accountType === "student"
                ? siteCopy.profileStudentDescription
                : siteCopy.profilePlayerDescription}
          </p>
          <nav className="profileWorkspaceNav" aria-label="Profile workspace sections">
            <a className="btn primary" href="#profile-details">Profile Details</a>
            {accountType === "student" ? <a className="btn ghost" href="#join-class">Join Class</a> : null}
            {isTeacher ? <a className="btn ghost" href="#school-calendar">School Calendar</a> : null}
            {isTeacher ? <a className="btn ghost" href="#announcement-assignments">Announcement Rules</a> : null}
          </nav>
        </div>
        <div className="profileWorkspaceSummary" aria-label="Profile overview">
          <div><span>Account</span><strong>{accountType === "teacher" ? "Teacher" : accountType === "student" ? "Student" : "Player"}</strong></div>
          <div><span>School</span><strong>{profile?.school_name || "Not set"}</strong></div>
          <div><span>Timezone</span><strong>{profile?.timezone || "America/New_York"}</strong></div>
        </div>
      </section>

      <section className="card profileSettingsCard" id="profile-details">
        <div className="profileSectionHeading">
          <div>
            <p className="eyebrow">Identity &amp; preferences</p>
            <h2>Profile details</h2>
          </div>
          <p>Keep the name, school, timezone, and visibility MathClaw uses across your workspace up to date.</p>
        </div>
        <ProfileForm
          userId={user.id}
          initialDisplayName={profile?.display_name || ""}
          initialNickname={profile?.nickname || ""}
          initialSchoolName={profile?.school_name || ""}
          schoolOptions={schoolOptions}
          initialTimezone={profile?.timezone || "America/New_York"}
          initialDiscoverable={profile?.discoverable ?? isTeacher}
          accountType={accountType}
        />
      </section>

      {accountType === "student" ? (
        <section className="card studentClassCodeCard profileToolCard" id="join-class">
          <h2>Join Your Math Class</h2>
          <p>
            Ask your teacher for the class code and enter it here. You can save your
            profile without a code, but joining your class unlocks the right games
            and assignments.
          </p>
          <form action={joinClassByCodeAction} className="ctaRow" style={{ marginTop: "0.75rem" }}>
            <label className="profileJoinCodeField">
              <span>Class join code</span>
              <input
                className="input"
                name="join_code"
                placeholder="Ask your teacher for this code"
                autoComplete="off"
                spellCheck="false"
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              />
            </label>
            <SubmitButton className="btn primary" pendingLabel="Joining Class…">Join Class</SubmitButton>
          </form>
        </section>
      ) : null}

      {isTeacher ? (
      <section className="card profileToolCard" id="school-calendar">
        <h2>School Calendar</h2>
        <p>
          Set school-year dates and non-full school days once, then apply to all
          classes.
        </p>

        <div className="list" style={{ marginTop: "0.75rem" }}>
          <details open>
            <summary className="btn" style={{ display: "inline-block" }}>
              Calendar
            </summary>

            {schoolCalendarOverridesUnavailable ? (
              <p style={{ marginTop: "0.75rem" }}>
                Note: global calendar overrides are unavailable until the school
                calendar table migration is applied. You can still set school-year
                dates and apply changes to class calendars.
              </p>
            ) : null}
            <form
              key={`${schoolYearStart}-${schoolYearEnd}`}
              action={saveSchoolCalendarAction}
              className="list"
              style={{ marginTop: "0.75rem" }}
            >
              <div className="schoolYearRangeRow">
                <label>
                  School Year Start
                  <input
                    className="input"
                    type="date"
                    name="school_year_start"
                    defaultValue={schoolYearStart}
                    required
                  />
                </label>
                <label>
                  School Year End
                  <input
                    className="input"
                    type="date"
                    name="school_year_end"
                    defaultValue={schoolYearEnd}
                    required
                  />
                </label>
              </div>

              <div className="schoolCalendarHeader">
                <span>Date</span>
                <span>Day #</span>
                <span>AB</span>
                <span>Grace Day</span>
                <span>Day Type</span>
                <span>Reason</span>
                <span>Note</span>
              </div>

              <div className="schoolCalendarBody">
                {weekdays.map((date) => {
                  const row = schoolDayByDate.get(date);
                  const dayNum = dateToSchoolDayNumber.get(date);
                  return (
                    <div
                      className={`schoolCalendarRow${isCalendarWeekStart(date) ? " calendarWeekStart" : ""}`}
                      key={date}
                    >
                      <span>{prettyDate(date)}</span>
                      <span>{dayNum ? `#${dayNum}` : "—"}</span>
                      <span>{abByDate.get(date) || "-"}</span>
                      <input
                        className="schoolCalendarGraceCheck"
                        type="checkbox"
                        name={`grace_day__${date}`}
                        defaultChecked={isGraceDay(row)}
                        aria-label={`Grace Day for ${prettyDate(date)}`}
                      />
                      <select
                        className="input"
                        name={`day_type__${date}`}
                        defaultValue={normalizeCalendarDayType(row?.day_type || "instructional")}
                      >
                        <option value="instructional">Full</option>
                        <option value="off">Off</option>
                        <option value="half">Half Day</option>
                        <option value="modified">Modified</option>
                      </select>
                      <select
                        className="input"
                        name={`reason_id__${date}`}
                        defaultValue={row?.reason_id || ""}
                      >
                        <option value="">None</option>
                        {(reasons || []).map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        name={`note__${date}`}
                        defaultValue={row?.note || ""}
                        placeholder="Optional"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="ctaRow">
                <SubmitButton className="btn primary" pendingLabel="Applying Calendar…">
                  Apply Calendar Changes
                </SubmitButton>
                {schoolCalendarUpdated ? (
                  <span className="statusNote">School Calendar Updated!</span>
                ) : null}
                {schoolCalendarErrorMessage ? (
                  <span className="statusNote">{schoolCalendarErrorMessage}</span>
                ) : null}
              </div>
            </form>

            <div className="profileCalendarPush">
              <div>
                <strong>Need to sync again?</strong>
                <p>
                  Push the last saved school calendar to every active class you own.
                </p>
              </div>
              <form action={pushSchoolCalendarToAllClassesAction}>
                <SubmitButton
                  className="btn ghost"
                  pendingLabel="Pushing Schedule…"
                >
                  Push Saved Schedule to All Classes
                </SubmitButton>
              </form>
              {schoolCalendarPushed ? (
                <span className="statusNote">Schedule pushed to all active classes.</span>
              ) : null}
              {schoolCalendarPushError ? (
                <span className="statusNote">
                  Save the school-year dates before pushing the schedule.
                </span>
              ) : null}
            </div>
          </details>

          <details style={{ marginTop: "1.1rem" }}>
            <summary className="btn btnNoToggle" style={{ display: "inline-block" }}>
              Marking Periods
            </summary>
            <div className="list">
              <h3>Marking Periods</h3>
              <p>
                Set marking periods by school day number. Current date ranges recalculate when the school
                calendar changes.
              </p>
              <p style={{ marginTop: "0.25rem" }}>
                School days in calendar: {schoolDayCount} · Final marking period day: #{markingPeriodTargetDay}
              </p>
              {markingPeriodShortfall > 0 ? (
                <p className="statusNote">
                  The calendar is {markingPeriodShortfall} school day{markingPeriodShortfall === 1 ? "" : "s"} short
                  of Day #{markingPeriodTargetDay}, so the last marking period ends early. Extend School Year End or
                  un-mark Off days to fit the full year.
                </p>
              ) : markingPeriodFinalDate ? (
                <p style={{ marginTop: "0.25rem" }}>
                  Day #{markingPeriodTargetDay} lands on {prettyDate(markingPeriodFinalDate)}.
                  {markingPeriodExtraDays > 0
                    ? ` ${markingPeriodExtraDays} school day${markingPeriodExtraDays === 1 ? "" : "s"} after that fall outside the marking periods — mark holidays and breaks as Off to shift Day #${markingPeriodTargetDay} later.`
                    : " The calendar fits the marking periods exactly."}
                </p>
              ) : null}
            </div>

            {markingPeriodsMigrationNeeded || markingPeriodError === "missing-table" ? (
              <p>
                Marking periods are unavailable until the marking periods migration
                is applied.
              </p>
            ) : null}

            {!markingPeriodsMigrationNeeded ? (
              <>
                <form action={saveStandardMarkingPeriodRulesAction}>
                  <SubmitButton pendingLabel="Creating Quarters…">
                    Use 4 Standard Quarters
                  </SubmitButton>
                </form>

                <form action={saveTeacherMarkingPeriodAction} className="list">
                  <div className="schoolYearRangeRow">
                    <label>
                      Name
                      <input className="input" name="name" placeholder="Quarter 1" required />
                    </label>
                    <label>
                      Start Day #
                      <input className="input" type="number" min="1" name="start_day_number" placeholder="1" required />
                    </label>
                    <label>
                      End Day #
                      <input className="input" type="number" min="1" name="end_day_number" placeholder="45" required />
                    </label>
                  </div>
                  <div className="ctaRow">
                    <SubmitButton className="btn primary" pendingLabel="Saving Rule…">
                      Add / Update Rule
                    </SubmitButton>
                    {markingPeriodUpdated ? (
                      <span className="statusNote">Marking Periods Updated!</span>
                    ) : null}
                    {markingPeriodError && markingPeriodError !== "missing-table" ? (
                      <span className="statusNote">Could not save marking period.</span>
                    ) : null}
                  </div>
                </form>
              </>
            ) : null}

            {markingPeriods.length > 0 ? (
              <div className="list">
                {markingPeriods.map((period) => (
                  <div className="card" key={period.id} style={{ background: "#fff", padding: "0.55rem 0.9rem" }}>
                    <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        <strong>{period.name}</strong>
                        <p>Days #{period.start_day_number}-{period.end_day_number}</p>
                        <p>Current dates: {markingPeriodDateText(period, schoolDayNumberMap)}</p>
                      </div>
                      <form action={deleteTeacherMarkingPeriodAction}>
                        <input type="hidden" name="period_id" value={period.id} />
                        <SubmitButton pendingLabel="Deleting Period…">
                          Delete
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </details>

          <details id="announcement-assignments" style={{ marginTop: "1.1rem" }}>
            <summary className="btn btnNoToggle" style={{ display: "inline-block" }}>
              Announcement Assignments
            </summary>
            <div className="list">
              <h3>Announcement Assignments</h3>
              <p>
                Set assignment types once, then choose how often each type appears in generated
                announcements.
              </p>
            </div>

            {assignmentRulesMigrationNeeded || assignmentError === "missing-table" ? (
              <p>
                Announcement assignment rules are unavailable until the assignment rules
                migration is applied.
              </p>
            ) : null}
            {assignmentRuleOverridesMigrationNeeded || assignmentError === "missing-overrides" ? (
              <p>
                Announcement assignment rescheduling is unavailable until the override
                migration is applied.
              </p>
            ) : null}

            {!assignmentRulesMigrationNeeded ? (
              <>
                <AnnouncementAssignmentRuleForm
                  action={saveTeacherAnnouncementAssignmentRuleAction}
                  courses={assignmentFormCourses}
                />

                {assignmentsUpdated || (assignmentError && assignmentError !== "missing-table") ? (
                  <div className="ctaRow">
                    {assignmentsUpdated ? (
                      <span className="statusNote">Announcement Assignments Updated!</span>
                    ) : null}
                    {assignmentError && assignmentError !== "missing-table" ? (
                      <span className="statusNote">Could not save announcement assignments.</span>
                    ) : null}
                  </div>
                ) : null}

                {assignmentRules.length > 0 ? (
                  <div className="list">
                    {assignmentRules.map((rule) => (
                      <details className="card" key={rule.id} style={{ background: "#fff", padding: "0.7rem 0.9rem" }}>
                        <summary>
                          <strong>{rule.label}</strong>{" "}
                          <span style={{ opacity: 0.75 }}>
                            {ruleScopeText(rule, teacherCourseById)} · {ruleSummary(rule)}
                          </span>
                        </summary>
                        <div style={{ marginTop: "0.75rem" }}>
                          <AnnouncementAssignmentRuleForm
                            action={saveTeacherAnnouncementAssignmentRuleAction}
                            courses={assignmentFormCourses}
                            rule={rule}
                            submitLabel="Update Assignment"
                          />
                        </div>
                        <div className="list" style={{ marginTop: "0.75rem" }}>
                          <div>
                            <strong>Generated Schedule Preview</strong>
                            <p>
                              These are the assignment lines this rule will place across the school year.
                            </p>
                          </div>
                          {(assignmentRulePreviews.get(rule.id) || []).length > 0 ? (
                            <div style={{ overflowX: "auto", "--classes-col": classesColumnWidth }}>
                              <div className="schoolCalendarHeader assignmentPreviewGrid">
                                <span>Original</span>
                                <span>Assignment Date</span>
                                <span>MP</span>
                                <span>Classes</span>
                              </div>
                              <div className="schoolCalendarBody">
                                {(assignmentRulePreviews.get(rule.id) || []).map((preview) => {
                                  const activeCount = preview.classes.filter((item) => !item.is_skipped).length;
                                  return (
                                  <form
                                    action={saveTeacherAnnouncementAssignmentRuleOccurrenceClassesAction}
                                    className="schoolCalendarRow assignmentPreviewGrid"
                                    key={preview.original_date}
                                  >
                                    <input type="hidden" name="rule_id" value={preview.rule_id} />
                                    <input type="hidden" name="original_date" value={preview.original_date} />
                                    {preview.classes.map((item) => (
                                      <input
                                        key={item.course_id}
                                        type="hidden"
                                        name="occurrence_course_id"
                                        value={item.course_id}
                                      />
                                    ))}
                                    <span>{shortDate(preview.original_date)}</span>
                                    <span className="ctaRow" style={{ marginTop: 0, gap: "0.35rem", flexWrap: "nowrap" }}>
                                      <input
                                        className="input"
                                        type="date"
                                        name="assignment_date"
                                        defaultValue={preview.assignment_date}
                                        aria-label={`Assignment date originally on ${preview.original_date}`}
                                        required
                                        style={{ width: "10.25rem", minWidth: 0 }}
                                      />
                                      <SubmitButton pendingLabel="Saving Date…">
                                        Save
                                      </SubmitButton>
                                    </span>
                                    <span>{preview.marking_periods.join(", ") || "—"}</span>
                                    <details style={{ position: "relative" }}>
                                      <summary className="btn" style={{ display: "inline-block" }}>
                                        Classes {activeCount}/{preview.classes.length}
                                      </summary>
                                      <div
                                        className="card"
                                        style={{
                                          background: "#fff",
                                          width: "max-content",
                                          minWidth: "12rem",
                                          padding: "0.7rem",
                                          marginTop: "0.45rem",
                                        }}
                                      >
                                        <div className="list">
                                          {preview.classes.map((item) => (
                                            <label
                                              key={item.course_id}
                                              style={{ display: "flex", alignItems: "center", gap: "0.45rem", whiteSpace: "nowrap" }}
                                            >
                                              <input
                                                type="checkbox"
                                                name="active_course_id"
                                                value={item.course_id}
                                                defaultChecked={!item.is_skipped}
                                              />
                                              {item.course_label}
                                            </label>
                                          ))}
                                          <SubmitButton className="btn primary" pendingLabel="Saving Classes…">
                                            Save Classes
                                          </SubmitButton>
                                        </div>
                                      </div>
                                    </details>
                                  </form>
                                );
                                })}
                              </div>
                            </div>
                          ) : (
                            <p>No generated dates found for the current school-year calendar.</p>
                          )}
                        </div>
                        <form action={deleteTeacherAnnouncementAssignmentRuleAction} className="ctaRow">
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <SubmitButton pendingLabel="Deleting Rule…">
                            Delete
                          </SubmitButton>
                        </form>
                      </details>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </details>
        </div>
      </section>
      ) : null}


      {isTeacher ? (
      <section className="card">
        <h2>Announcement Template</h2>
        <p>
          Control how daily announcements are generated. Supported placeholders:
          {" "}
          <code>{"{date}"}</code>, <code>{"{class_name}"}</code>,{" "}
          <code>{"{ab_day}"}</code>, <code>{"{day_type}"}</code>,{" "}
          <code>{"{schedule_type}"}</code>, <code>{"{reason}"}</code>,{" "}
          <code>{"{lesson_title}"}</code>, <code>{"{objective}"}</code>,{" "}
          <code>{"{standards}"}</code>, <code>{"{day_number}"}</code>,{" "}
          <code>{"{day_of_week}"}</code>, <code>{"{assignments}"}</code>,{" "}
          <code>{"{regular_assignment}"}</code>, <code>{"{teacher_absences}"}</code>,{" "}
          <code>{"{do_now}"}</code>, <code>{"{quote}"}</code>.
        </p>

        <form
          action={saveAnnouncementTemplateAction}
          className="list"
          style={{ marginTop: "0.75rem" }}
        >
          <textarea
            className="input"
            name="body_template"
            rows={8}
            defaultValue={defaultTemplate}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <input
              type="checkbox"
              name="include_do_now"
              defaultChecked={includeDoNow}
            />
            Include AI-style Do Now line
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <input
              type="checkbox"
              name="include_quote"
              defaultChecked={includeQuote}
            />
            Include quote of the day line
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <input
              type="checkbox"
              name="include_day_number"
              defaultChecked={includeDayNumber}
            />
            Include school day number line
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <input
              type="checkbox"
              name="include_day_of_week"
              defaultChecked={includeDayOfWeek}
            />
            Include day of week line
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <input
              type="checkbox"
              name="include_regular_assignments"
              defaultChecked={includeRegularAssignments}
            />
            Include recurring assignment line
          </label>
          <label>
            Recurring Assignments (one per line, e.g. <code>Fri: Assessment</code>)
            <textarea
              className="input"
              name="regular_assignments"
              rows={4}
              defaultValue={regularAssignments}
            />
          </label>
          <div className="ctaRow">
            <SubmitButton className="btn primary" pendingLabel="Saving Template…">
              Save Template
            </SubmitButton>
            {templateUpdated ? (
              <span className="statusNote">Template Updated!</span>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}
    </div>
  );
}
