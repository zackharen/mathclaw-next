import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { listSchoolOptions } from "@/lib/schools";
import ProfileForm from "./profile-form";
import { getSiteCopy } from "@/lib/site-config";
import {
  deleteTeacherMarkingPeriodAction,
  saveStandardMarkingPeriodRulesAction,
  saveAnnouncementTemplateAction,
  saveTeacherAnnouncementAssignmentsAction,
  saveSchoolCalendarAction,
  saveTeacherMarkingPeriodAction,
} from "./actions";
import { joinClassByCodeAction } from "@/app/play/actions";

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
    return `${prettyDate(startDate)} to not scheduled yet`;
  }
  return "Not scheduled yet";
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


function buildABMap(dates, abPatternStartIso) {
  const map = new Map();
  if (!abPatternStartIso) {
    dates.forEach((d) => map.set(d, "-"));
    return map;
  }

  const start = parseDateAtUTC(abPatternStartIso);
  let current = "A";

  for (const date of dates) {
    const dateObj = parseDateAtUTC(date);
    if (dateObj < start) {
      map.set(date, "-");
      continue;
    }
    map.set(date, current);
    current = current === "A" ? "B" : "A";
  }

  return map;
}

function getDayOfWeekIndex(isoDate) {
  return parseDateAtUTC(isoDate).getUTCDay();
}

function addDaysISO(isoDate, days) {
  const date = parseDateAtUTC(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

function formatAssignmentDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

function assignmentCourseScopeText(course) {
  return course ? courseLabel(course) : "All classes";
}

function assignmentCandidateKey(candidate) {
  return `${candidate.course_id || "all"}|${candidate.assignment_date}|${candidate.label}`;
}

function assignmentCandidateValue(candidate) {
  return [
    candidate.course_id || "all",
    candidate.assignment_date,
    candidate.label,
    candidate.due_date || "",
    candidate.source || "",
  ].join("|");
}

function pickEvenly(items, count) {
  if (items.length <= count) return items;
  const picked = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    if (!seen.has(index)) {
      picked.push(items[index]);
      seen.add(index);
    }
  }
  return picked;
}

function isCourseMeetingDay(course, day) {
  if (!day || day.day_type === "off") return false;
  if (course.schedule_model !== "ab") return true;
  if (course.ab_meeting_day === "A") return day.ab_day === "A";
  if (course.ab_meeting_day === "B") return day.ab_day === "B";
  return day.ab_day === "A" || day.ab_day === "B";
}

function buildCourseAssignmentCandidates({
  course,
  courseDays,
  markingPeriods,
  schoolDayNumberByDate,
}) {
  const meetingDays = (courseDays || []).filter((day) => isCourseMeetingDay(course, day));
  const candidates = [];

  for (const day of meetingDays) {
    const weekday = getDayOfWeekIndex(day.class_date);
    if (course.schedule_model !== "ab" && weekday === 5) {
      candidates.push({
        course_id: course.id,
        assignment_date: day.class_date,
        label: "Assessment",
        due_date: "",
        source: "Friday assessments",
      });
    }
    if (course.schedule_model === "ab" && (weekday === 4 || weekday === 5)) {
      candidates.push({
        course_id: course.id,
        assignment_date: day.class_date,
        label: "Assessment",
        due_date: "",
        source: "AB Thu/Fri assessments",
      });
    }
  }

  for (const period of markingPeriods || []) {
    const periodDays = meetingDays.filter((day) => {
      const dayNumber = schoolDayNumberByDate.get(day.class_date);
      return (
        dayNumber &&
        dayNumber >= period.start_day_number &&
        dayNumber <= period.end_day_number
      );
    });
    const periodFridays = periodDays.filter((day) => getDayOfWeekIndex(day.class_date) === 5);

    for (const day of pickEvenly(periodFridays, 3)) {
      candidates.push({
        course_id: course.id,
        assignment_date: day.class_date,
        label: "Notebook Check",
        due_date: "",
        source: `${period.name} notebook checks`,
      });
    }

    for (const day of pickEvenly(periodDays, 2)) {
      candidates.push({
        course_id: course.id,
        assignment_date: day.class_date,
        label: "Choice Board",
        due_date: addDaysISO(day.class_date, 7),
        source: `${period.name} choice boards`,
      });
    }
  }

  const byKey = new Map();
  for (const candidate of candidates) {
    byKey.set(assignmentCandidateKey(candidate), candidate);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.assignment_date !== b.assignment_date) {
      return a.assignment_date.localeCompare(b.assignment_date);
    }
    return a.label.localeCompare(b.label);
  });
}

export default async function OnboardingProfilePage({ searchParams }) {
  const qs = (await searchParams) || {};
  const schoolCalendarUpdated = qs.school_calendar_updated === "1";
  const schoolCalendarError = qs.school_calendar_error || "";
  const schoolCalendarErrorMessage = schoolCalendarErrorText(schoolCalendarError);
  const templateUpdated = qs.template_updated === "1";
  const absenceUpdated = qs.absence_updated === "1";
  const absenceError = qs.absence_error;
  const markingPeriodUpdated = qs.marking_period_updated === "1";
  const markingPeriodError = qs.marking_period_error;
  const assignmentsUpdated = qs.assignments_updated === "1";
  const assignmentError = qs.assignment_error;
  const siteCopy = await getSiteCopy();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const admin = createAdminClient();
  const defaults = defaultSchoolYearDates();
  const accountType = await getAccountTypeForUser(supabase, user);
  const isTeacher = isTeacherAccountType(accountType);
  let schoolOptions = [];

  try {
    schoolOptions = await listSchoolOptions();
  } catch {
    schoolOptions = [];
  }

  let { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "display_name, nickname, school_name, timezone, discoverable, school_year_start, school_year_end"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError &&
    typeof profileError.message === "string" &&
    (profileError.message.includes("nickname") ||
      profileError.message.includes("school_year_start") ||
      profileError.message.includes("discoverable"))
  ) {
    const retry = await admin
      .from("profiles")
      .select("display_name, school_name, timezone, school_year_start, school_year_end")
      .eq("id", user.id)
      .maybeSingle();

    profile = retry.data
        ? {
            ...retry.data,
            nickname: "",
            discoverable: true,
          }
      : null;

    profileError = retry.error;
  }

  const schoolYearStart = profile?.school_year_start || defaults.start;
  const schoolYearEnd = profile?.school_year_end || defaults.end;

  const { data: abSeedCourse } = await supabase
    .from("courses")
    .select("ab_pattern_start_date")
    .eq("owner_id", user.id)
    .eq("schedule_model", "ab")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: teacherCourses } = isTeacher
    ? await supabase
        .from("courses")
        .select("id, title, class_name, schedule_model, ab_meeting_day")
        .eq("owner_id", user.id)
        .order("title", { ascending: true })
    : { data: [] };

  const weekdays = buildWeekdays(schoolYearStart, schoolYearEnd);
  const abPatternStartIso = abSeedCourse?.ab_pattern_start_date || schoolYearStart;
  const abByDate = buildABMap(weekdays, abPatternStartIso);

  const { data: reasons } = await supabase
    .from("day_off_reasons")
    .select("id, label")
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("label", { ascending: true });

  let schoolDays = [];
  let schoolCalendarOverridesUnavailable = false;
  const { data: schoolDaysData, error: schoolDaysError } = await supabase
    .from("school_calendar_days")
    .select("class_date, day_type, reason_id, note")
    .eq("owner_id", user.id)
    .gte("class_date", schoolYearStart)
    .lte("class_date", schoolYearEnd)
    .order("class_date", { ascending: true });

  if (schoolDaysError && isMissingTableError(schoolDaysError, "school_calendar_days")) {
    schoolCalendarOverridesUnavailable = true;
  } else if (schoolDaysError) {
    throw new Error(schoolDaysError.message);
  } else {
    schoolDays = schoolDaysData || [];
  }

  const schoolDayByDate = new Map(
    (schoolDays || []).map((row) => [row.class_date, row])
  );
  const { map: schoolDayNumberMap, count: schoolDayCount } =
    buildSchoolDayNumberMap(weekdays, schoolDayByDate);

  const dateToSchoolDayNumber = new Map(
    Array.from(schoolDayNumberMap.entries()).map(([num, date]) => [date, num])
  );

  let markingPeriods = [];
  let markingPeriodsMigrationNeeded = false;
  if (isTeacher) {
    const { data: periodsData, error: periodsError } = await supabase
      .from("teacher_marking_period_rules")
      .select("id, name, start_day_number, end_day_number")
      .eq("owner_id", user.id)
      .order("start_day_number", { ascending: true });

    if (
      periodsError &&
      typeof periodsError.message === "string" &&
      periodsError.message.includes("teacher_marking_period_rules")
    ) {
      markingPeriodsMigrationNeeded = true;
    } else if (periodsError) {
      throw new Error(periodsError.message);
    } else {
      markingPeriods = periodsData || [];
    }
  }

  let teacherAbsences = [];
  let absencesMigrationNeeded = false;
  if (isTeacher) {
    const { data: absencesData, error: absencesError } = await supabase
      .from("teacher_absences")
      .select("id, absence_date, course_id, note")
      .eq("owner_id", user.id)
      .gte("absence_date", schoolYearStart)
      .lte("absence_date", schoolYearEnd)
      .order("absence_date", { ascending: true });

    if (
      absencesError &&
      typeof absencesError.message === "string" &&
      absencesError.message.includes("teacher_absences")
    ) {
      absencesMigrationNeeded = true;
    } else if (absencesError) {
      throw new Error(absencesError.message);
    } else {
      teacherAbsences = absencesData || [];
    }
  }

  const teacherCourseById = new Map(
    (teacherCourses || []).map((course) => [course.id, course])
  );

  let courseCalendarDays = [];
  const teacherCourseIds = (teacherCourses || []).map((course) => course.id);
  if (isTeacher && teacherCourseIds.length > 0) {
    const { data: courseCalendarData, error: courseCalendarError } = await supabase
      .from("course_calendar_days")
      .select("course_id, class_date, day_type, ab_day")
      .in("course_id", teacherCourseIds)
      .gte("class_date", schoolYearStart)
      .lte("class_date", schoolYearEnd)
      .order("class_date", { ascending: true });

    if (courseCalendarError) {
      throw new Error(courseCalendarError.message);
    }

    courseCalendarDays = courseCalendarData || [];
  }

  let announcementAssignments = [];
  let announcementAssignmentsMigrationNeeded = false;
  if (isTeacher) {
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from("teacher_announcement_assignments")
      .select("id, course_id, assignment_date, label, due_date, source")
      .eq("owner_id", user.id)
      .gte("assignment_date", schoolYearStart)
      .lte("assignment_date", schoolYearEnd)
      .order("assignment_date", { ascending: true })
      .order("label", { ascending: true });

    if (
      assignmentsError &&
      typeof assignmentsError.message === "string" &&
      assignmentsError.message.includes("teacher_announcement_assignments")
    ) {
      announcementAssignmentsMigrationNeeded = true;
    } else if (assignmentsError) {
      throw new Error(assignmentsError.message);
    } else {
      announcementAssignments = assignmentsData || [];
    }
  }

  const courseCalendarByCourse = new Map();
  for (const day of courseCalendarDays || []) {
    const arr = courseCalendarByCourse.get(day.course_id) || [];
    arr.push(day);
    courseCalendarByCourse.set(day.course_id, arr);
  }

  const existingAssignmentKeys = new Set(
    (announcementAssignments || []).map((assignment) => assignmentCandidateKey(assignment))
  );

  const assignmentCandidates = (teacherCourses || []).flatMap((course) =>
    buildCourseAssignmentCandidates({
      course,
      courseDays: courseCalendarByCourse.get(course.id) || [],
      markingPeriods,
      schoolDayNumberByDate: dateToSchoolDayNumber,
    })
  );

  const selectedOnlyAssignments = (announcementAssignments || []).filter(
    (assignment) => !assignmentCandidates.some(
      (candidate) => assignmentCandidateKey(candidate) === assignmentCandidateKey(assignment)
    )
  );

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

  const defaultTemplate = normalizeAnnouncementTemplate(templateRow?.body_template);
  const includeDoNow = templateRow?.include_do_now ?? false;
  const includeQuote = templateRow?.include_quote ?? false;
  const includeDayNumber = templateRow?.include_day_number ?? false;
  const includeDayOfWeek = templateRow?.include_day_of_week ?? false;
  const includeRegularAssignments = templateRow?.include_regular_assignments ?? false;
  const regularAssignments = templateRow?.regular_assignments || "";

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.profileTitle}</h1>
        <p>
          {accountType === "teacher"
            ? siteCopy.profileTeacherDescription
            : accountType === "student"
              ? siteCopy.profileStudentDescription
              : siteCopy.profilePlayerDescription}
        </p>
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
        <section className="card studentClassCodeCard">
          <h2>Join Your Math Class</h2>
          <p>
            Ask your teacher for the class code and enter it here. You can save your
            profile without a code, but joining your class unlocks the right games
            and assignments.
          </p>
          <form action={joinClassByCodeAction} className="ctaRow" style={{ marginTop: "0.75rem" }}>
            <input
              className="input"
              name="join_code"
              placeholder="Ask your teacher for this code"
              autoComplete="off"
              spellCheck="false"
              style={{ maxWidth: "20rem", textTransform: "uppercase", letterSpacing: "0.08em" }}
            />
            <button className="btn primary" type="submit">
              Join Class
            </button>
          </form>
        </section>
      ) : null}

      {isTeacher ? (
      <section className="card" id="school-calendar">
        <h2>School Calendar</h2>
        <p>
          Set school-year dates and non-full school days once, then apply to all
          classes.
        </p>

        <details style={{ marginTop: "0.75rem" }}>
          <summary className="btn" style={{ display: "inline-block" }}>
            School Calendar
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
                <span>Out?</span>
                <span>Day Type</span>
                <span>Reason</span>
                <span>Note</span>
              </div>

              <div className="schoolCalendarBody">
                {weekdays.map((date) => {
                  const row = schoolDayByDate.get(date);
                  const dayNum = dateToSchoolDayNumber.get(date);
                  return (
                    <div className="schoolCalendarRow" key={date}>
                      <span>{prettyDate(date)}</span>
                      <span>{dayNum ? `#${dayNum}` : "—"}</span>
                      <span>{abByDate.get(date) || "-"}</span>
                      <input
                        className="schoolCalendarOutCheck"
                        type="checkbox"
                        name={`teacher_out__${date}`}
                        defaultChecked={row?.day_type === "grace_day"}
                      />
                      <select
                        className="input"
                        name={`day_type__${date}`}
                        defaultValue={row?.day_type || "instructional"}
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
                <button className="btn primary" type="submit">
                  Apply Calendar Changes
                </button>
                {schoolCalendarUpdated ? (
                  <span className="statusNote">School Calendar Updated!</span>
                ) : null}
                {schoolCalendarErrorMessage ? (
                  <span className="statusNote">{schoolCalendarErrorMessage}</span>
                ) : null}
              </div>
          </form>

          <div className="list" style={{ marginTop: "1.1rem" }}>
            <div>
              <h3>Marking Periods</h3>
              <p>
                Set marking periods by school day number. Current date ranges recalculate when the school
                calendar changes.
              </p>
              <p style={{ marginTop: "0.25rem" }}>
                Current school days in calendar: {schoolDayCount}
              </p>
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
                  <button className="btn" type="submit">
                    Use 4 Standard Quarters
                  </button>
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
                    <button className="btn primary" type="submit">
                      Add / Update Rule
                    </button>
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
                        <button className="btn" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="list" id="announcement-assignments" style={{ marginTop: "1.1rem" }}>
            <div>
              <h3>Announcement Assignments</h3>
              <p>
                Pick generated assignment dates for assessments, notebook checks, and choice boards.
                Checked rows feed the <code>{"{assignments}"}</code> announcement placeholder.
              </p>
            </div>

            {announcementAssignmentsMigrationNeeded || assignmentError === "missing-table" ? (
              <p>
                Announcement assignments are unavailable until the announcement assignments
                migration is applied.
              </p>
            ) : null}

            {!announcementAssignmentsMigrationNeeded ? (
              <form action={saveTeacherAnnouncementAssignmentsAction} className="list">
                <input type="hidden" name="school_year_start" value={schoolYearStart} />
                <input type="hidden" name="school_year_end" value={schoolYearEnd} />

                {assignmentCandidates.length > 0 ? (
                  <div className="list">
                    {(teacherCourses || []).map((course) => {
                      const courseCandidates = assignmentCandidates.filter(
                        (candidate) => candidate.course_id === course.id
                      );
                      if (courseCandidates.length === 0) return null;
                      return (
                        <div className="card" key={course.id} style={{ background: "#fff", padding: "0.7rem 0.9rem" }}>
                          <h4>{courseLabel(course)}</h4>
                          <div className="list" style={{ marginTop: "0.45rem" }}>
                            {courseCandidates.map((candidate) => (
                              <label
                                key={assignmentCandidateKey(candidate)}
                                style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "0.55rem", alignItems: "start" }}
                              >
                                <input
                                  type="checkbox"
                                  name="assignment_pick"
                                  value={assignmentCandidateValue(candidate)}
                                  defaultChecked={existingAssignmentKeys.has(assignmentCandidateKey(candidate))}
                                />
                                <span>
                                  <strong>{candidate.label}</strong>{" "}
                                  <span>
                                    {formatAssignmentDate(candidate.assignment_date)}
                                    {candidate.due_date ? ` · Due ${formatAssignmentDate(candidate.due_date)}` : ""}
                                  </span>
                                  <br />
                                  <span style={{ fontSize: "0.88rem", opacity: 0.75 }}>
                                    {candidate.source}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p>
                    No assignment candidates yet. Build class calendars and marking period rules first.
                  </p>
                )}

                {selectedOnlyAssignments.length > 0 ? (
                  <div className="card" style={{ background: "#fff", padding: "0.7rem 0.9rem" }}>
                    <h4>Saved Custom Rows</h4>
                    <div className="list" style={{ marginTop: "0.45rem" }}>
                      {selectedOnlyAssignments.map((assignment) => (
                        <label
                          key={assignmentCandidateKey(assignment)}
                          style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "0.55rem", alignItems: "start" }}
                        >
                          <input
                            type="checkbox"
                            name="assignment_pick"
                            value={assignmentCandidateValue(assignment)}
                            defaultChecked
                          />
                          <span>
                            <strong>{assignment.label}</strong>{" "}
                            <span>
                              {formatAssignmentDate(assignment.assignment_date)}
                              {assignment.due_date ? ` · Due ${formatAssignmentDate(assignment.due_date)}` : ""}
                            </span>
                            <br />
                            <span style={{ fontSize: "0.88rem", opacity: 0.75 }}>
                              {assignmentCourseScopeText(teacherCourseById.get(assignment.course_id))}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="ctaRow">
                  <button className="btn primary" type="submit">
                    Save Announcement Assignments
                  </button>
                  {assignmentsUpdated ? (
                    <span className="statusNote">Announcement Assignments Updated!</span>
                  ) : null}
                  {assignmentError && assignmentError !== "missing-table" ? (
                    <span className="statusNote">Could not save announcement assignments.</span>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        </details>
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
            <button className="btn primary" type="submit">
              Save Template
            </button>
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
