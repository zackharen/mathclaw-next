import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  markLessonCompleteAction,
  markLessonPlannedAction,
  updateABMeetingDaysAction,
  updateCourseDateRangeAction,
  updatePacingModeAction,
} from "./actions";
import {
  applyCalendarBulkAction,
  copyCalendarToOtherClassesAction,
  generateCalendarAction,
  updateCalendarDayAction,
} from "../calendar/actions";
import { generateAnnouncementsAction } from "../announcements/actions";
import CopyButton from "../announcements/copy-button";
import AutoRegenerateToggle from "./auto-regenerate-toggle";
import ABScheduleForm from "./ab-schedule-form";
import ApplyCalendarSubmit from "./apply-calendar-submit";
import ArcadeSuggestionsToggle from "./arcade-suggestions-toggle";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";
const LESSON_SKILL_RULES = [
  {
    slug: "integer_practice",
    match: ["integer", "negative", "positive", "add integers", "subtract integers", "absolute value"],
    why: "Build fluency with signed-number operations and number-line thinking.",
  },
  {
    slug: "number_compare",
    match: ["compare", "greater than", "less than", "order numbers", "decimal", "fraction", "place value"],
    why: "Give students quick comparison reps across tricky number forms.",
  },
  {
    slug: "money_counting",
    match: ["money", "coin", "bill", "dollar", "cent", "value of coins", "making change"],
    why: "Reinforce coin and bill value with fast amount-building practice.",
  },
  {
    slug: "telling_time",
    match: ["time", "clock", "hour", "minute", "elapsed time", "analog"],
    why: "Support clock reading and time-setting with visual repetition.",
  },
  {
    slug: "slope_intercept",
    match: ["slope", "y-intercept", "linear", "graph", "coordinate plane", "rate of change"],
    why: "Give students graph-reading reps with lines and intercepts.",
  },
  {
    slug: "spiral_review",
    match: ["review", "mixed practice", "spiral", "warm-up", "do now", "check for understanding"],
    why: "Mix prior skills together when the lesson needs cumulative review.",
  },
  {
    slug: "question_kind_review",
    match: ["question type", "word problem", "problem type", "recognize", "classify", "identify the kind"],
    why: "Help students notice what a problem is asking before they solve it.",
  },
  {
    slug: "sudoku",
    match: ["logic", "patterns", "perseverance", "reasoning", "grid"],
    why: "Add a structured logic challenge when the lesson leans on reasoning habits.",
  },
  {
    slug: "comet_typing",
    match: ["typing", "keyboard", "fluency", "speed", "accuracy"],
    why: "Build keyboard fluency and accuracy during tech-heavy routines.",
  },
];

const GAME_LABELS = {
  "2048": "2048",
  connect4: "Connect4",
  integer_practice: "Adding & Subtracting Integers",
  money_counting: "Money Counting",
  minesweeper: "Minesweeper",
  number_compare: "Which Number Is Bigger?",
  spiral_review: "Spiral Review",
  question_kind_review: "What Kind Of Question Is This?",
  telling_time: "Telling Time",
  slope_intercept: "Slope & Y-Intercept",
  sudoku: "Sudoku",
  comet_typing: "Comet Typing",
};
const WEEKDAY_MODIFIER_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

function hasCurriculum(course) {
  return Boolean(course?.selected_library_id);
}

function normalizePacingMode(value) {
  if (value === "two_lessons_unless_modified") return "two_lessons_per_day";
  return value || "one_lesson_per_day";
}

function normalizeWeekdayModifiers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const modifiers = {};
  for (const [weekday, modifier] of Object.entries(raw)) {
    if (!["1", "2", "3", "4", "5"].includes(String(weekday))) continue;
    if (modifier === "no_lesson" || modifier === "one_less") {
      modifiers[String(weekday)] = modifier;
    }
  }
  return modifiers;
}

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
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

function isWeekendISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function formatLessonLabel(sourceLessonCode, title) {
  const safeTitle = title || "Untitled Lesson";
  if (!sourceLessonCode) return safeTitle;

  const normalizedCode = String(sourceLessonCode).trim();
  const normalizedTitle = String(safeTitle).trim();

  if (
    normalizedTitle
      .toLowerCase()
      .startsWith(`${normalizedCode.toLowerCase()}:`)
  ) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}

function gameHref(slug, courseId) {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  if (slug === "integer_practice") return `/play/integer-practice${query}`;
  if (slug === "money_counting") return `/play/money-counting${query}`;
  if (slug === "number_compare") return `/play/number-compare${query}`;
  if (slug === "spiral_review") return `/play/spiral-review${query}`;
  if (slug === "question_kind_review") return `/play/question-kind-review${query}`;
  if (slug === "telling_time") return `/play/telling-time${query}`;
  if (slug === "slope_intercept") return `/play/slope-intercept${query}`;
  if (slug === "comet_typing") return `/play/comet-typing${query}`;
  return `/play/${slug}${query}`;
}

function findSuggestedSkills({ lesson, enabledGames }) {
  if (!lesson) return [];

  const haystack = `${lesson.source_lesson_code || ""} ${lesson.title || ""} ${lesson.objective || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  return LESSON_SKILL_RULES.filter((rule) => enabledGames.has(rule.slug)).filter((rule) =>
    rule.match.some((needle) => haystack.includes(needle))
  ).slice(0, 3);
}

export default async function ClassPlanPage({ params, searchParams }) {
  const pageStart = process.hrtime.bigint();
  const { id } = await params;
  const qs = (await searchParams) || {};
  const calendarUpdated = qs.calendar_updated === "1";
  const calendarCopied = qs.calendar_copied === "1";
  const abUpdated = qs.ab_updated === "1";
  const progressUpdated = qs.progress_updated === "1";
  const announcementsUpdated = qs.announcements_updated === "1";
  const pacingUpdated = qs.pacing_updated === "1";
  const dateRangeUpdated = qs.date_range_updated === "1";
  const imported = qs.imported === "1";
  const completedActionMessages = [
    dateRangeUpdated ? "Class Dates Updated!" : null,
    pacingUpdated ? "Pacing Mode Updated!" : null,
    calendarUpdated ? "Calendar Updated!" : null,
    abUpdated ? "AB Schedule Updated!" : null,
    progressUpdated ? "Progress Updated!" : null,
    imported ? "Calendar Imported!" : null,
    calendarCopied ? "Calendar copied to other classes." : null,
    announcementsUpdated ? "Announcements Updated!" : null,
  ].filter(Boolean);

  const cookieStore = await cookies();
  const hideSuggestions = cookieStore.get("hide_arcade_suggestions")?.value === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/plan`);
  }
  const accountType = await getAccountTypeForUser(supabase, user);

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    id,
    "id, title, class_name, selected_library_id, schedule_model, ab_meeting_day, school_year_start, school_year_end, pacing_mode, pacing_weekday_modifiers, owner_id"
  );
  const course = access?.course;

  if (!course) {
    redirect("/classes");
  }
  const courseDataClient = getCourseWriteClient(access, supabase);
  const curriculumEnabled = hasCurriculum(course);

  const dataFetchStart = process.hrtime.bigint();
  const [
    lessonsCountRes,
    calendarDaysRes,
    reasonsRes,
    planRes,
    announcementsRes,
    gamesRes,
  ] = await Promise.all([
    curriculumEnabled
      ? supabase
          .from("curriculum_lessons")
          .select("id", { count: "exact", head: true })
          .eq("library_id", course.selected_library_id)
      : Promise.resolve({ count: 0 }),
    courseDataClient
      .from("course_calendar_days")
      .select("class_date, day_type, ab_day, reason_id, note")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    supabase
      .from("day_off_reasons")
      .select("id, label")
      .or(`owner_id.is.null,owner_id.eq.${user.id}`)
      .order("label", { ascending: true }),
    courseDataClient
      .from("course_lesson_plan")
      .select(
        "class_date, lesson_slot, status, curriculum_lessons(sequence_index, source_lesson_code, title, objective)"
      )
      .eq("course_id", course.id)
      .order("class_date", { ascending: true })
      .order("lesson_slot", { ascending: true }),
    courseDataClient
      .from("course_announcements")
      .select("class_date, content")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    listGamesWithCourseSettings(supabase, course.id, { viewerAccountType: accountType || "teacher" }),
  ]);

  const totalLessonsCount = lessonsCountRes.count || 0;
  const calendarDays = calendarDaysRes.data || [];
  const reasons = reasonsRes.data || [];
  const planRows = planRes.data || [];
  const planError = planRes.error;
  const announcements = announcementsRes.data || [];
  const enabledGames = new Set((gamesRes || []).filter((game) => game.enabled).map((game) => game.slug));

  if (PERF_ENABLED) {
    console.info(
      `[perf] ClassPlanPage course=${course.id} fetchMs=${Number((process.hrtime.bigint() - dataFetchStart) / 1000000n)} totalMs=${Number((process.hrtime.bigint() - pageStart) / 1000000n)} calendarDays=${calendarDays.length} planRows=${planRows.length} announcements=${announcements.length}`
    );
  }

  const announcementByDate = new Map(
    announcements.map((a) => [a.class_date, a.content])
  );
  const calendarByDate = new Map(calendarDays.map((d) => [d.class_date, d]));
  const planRowsByDate = new Map();
  for (const row of planRows) {
    const rows = planRowsByDate.get(row.class_date) || [];
    rows.push(row);
    planRowsByDate.set(row.class_date, rows);
  }
  const reasonById = new Map(reasons.map((reason) => [reason.id, reason.label]));
  const pacingMode = normalizePacingMode(course.pacing_mode);
  const weekdayModifiers = normalizeWeekdayModifiers(course.pacing_weekday_modifiers);

  const meetsA = course.ab_meeting_day !== "B";
  const meetsB = course.ab_meeting_day !== "A";

  const visibleCalendarDays = calendarDays.filter((day) => {
    if (course.schedule_model !== "ab") return !isWeekendISODate(day.class_date);
    if (day.day_type === "off") return !isWeekendISODate(day.class_date);
    if (day.ab_day !== "A" && day.ab_day !== "B") return false;
    if (course.ab_meeting_day === "A") return day.ab_day === "A";
    if (course.ab_meeting_day === "B") return day.ab_day === "B";
    return true;
  });

  const instructionalDaysCount = visibleCalendarDays.filter(
    (d) => d.day_type === "instructional"
  ).length;
  const plannedCount = planRows?.length || 0;
  const announcementCount = announcements?.length || 0;
  const lastPlanRow = planRows[planRows.length - 1] || null;
  const projectedEnd = curriculumEnabled
    ? (lastPlanRow?.class_date || course.school_year_end)
    : null;

  return (
    <div className="stack">
      <section className="card">
        <div className="classPlanTitleRow">
          <div>
            <h1>{course.title}: Plan</h1>
            <p>
              {course.class_name} |{" "}
              {course.schedule_model === "ab"
                ? `AB (${course.ab_meeting_day || "Both"})`
                : "Every Day"}{" "}
              | {shortDate(course.school_year_start)} to {shortDate(course.school_year_end)}
            </p>
          </div>
          <ArcadeSuggestionsToggle initialHidden={hideSuggestions} />
        </div>
      </section>

      <section className="card">
        <div className="kv">
          <div>
            <strong>Class Days</strong>
            <span>{visibleCalendarDays.length || 0}</span>
          </div>
          <div>
            <strong>Full Days</strong>
            <span>{instructionalDaysCount || 0}</span>
          </div>
          <div>
            <strong>Library Lessons</strong>
            <span>{totalLessonsCount || 0}</span>
          </div>
          <div>
            <strong>Planned Lessons</strong>
            <span>{plannedCount}</span>
          </div>
          <div>
            <strong>Generated Announcements</strong>
            <span>{announcementCount}</span>
          </div>
          {projectedEnd ? (
            <div>
              <strong>Projected Final Lesson Date</strong>
              <span>{shortDate(projectedEnd)}</span>
            </div>
          ) : null}
        </div>
      </section>

      {!curriculumEnabled ? (
        <section className="card">
          <h2>No-Curriculum Class</h2>
          <p>
            This class is using calendar and arcade tools without a curriculum lesson track. You can still manage the
            calendar, join students, use awards, and run games, but lesson-by-day pacing is intentionally turned off.
          </p>
        </section>
      ) : null}

      <section className="card" id="modify-calendar">
        <h2>Modify Calendar</h2>

        <div className="classPlanControlStack">
          <form action={updateCourseDateRangeAction} className="inlineControlForm classPlanDateForm">
            <input type="hidden" name="course_id" value={course.id} />
            <input
              className="input"
              type="text"
              name="school_year_start"
              defaultValue={shortDate(course.school_year_start)}
              placeholder="M/D/YYYY"
              aria-label="Class start date"
              style={{ width: 110 }}
            />
            <input
              className="input"
              type="text"
              name="school_year_end"
              defaultValue={shortDate(course.school_year_end)}
              placeholder="M/D/YYYY"
              aria-label="Class end date"
              style={{ width: 110 }}
            />
            <button className="btn" type="submit">Update Dates</button>
          </form>

          <div className="classPlanControlRow classPlanControlRowSchedule">
            <form id="class-plan-pacing-form" action={updatePacingModeAction} className="inlineControlForm classPlanPacingForm">
              <input type="hidden" name="course_id" value={course.id} />
              <select
                className="input"
                name="pacing_mode"
                defaultValue={pacingMode}
                style={{ minWidth: 240 }}
              >
                <option value="one_lesson_per_day">Pacing: 1 Lesson Per Day</option>
                <option value="one_lesson_no_half_days">Pacing: 1 Lesson Per Day (No Half Days)</option>
                <option value="two_lessons_per_day">Pacing: 2 Lessons Per Day</option>
                <option value="manual_complete">Pacing: Manual (Move On When Complete)</option>
              </select>
              <details className="inlineDetails pacingModifierDetails">
                <summary className="btn">Modified Day Rules</summary>
                <div className="controlExpandedPanel pacingModifierPanel">
                  <div className="pacingModifierHeader">
                    <span>Day</span>
                    <span>No Lesson</span>
                    <span>One Less Lesson</span>
                  </div>
                  {WEEKDAY_MODIFIER_OPTIONS.map((day) => (
                    <div className="pacingModifierRow" key={day.value}>
                      <strong>{day.label}</strong>
                      <label className="calendarSelectCell">
                        <input
                          type="checkbox"
                          name={`pacing_weekday_no_lesson__${day.value}`}
                          defaultChecked={weekdayModifiers[day.value] === "no_lesson"}
                        />
                        <span>No Lesson</span>
                      </label>
                      <label className="calendarSelectCell">
                        <input
                          type="checkbox"
                          name={`pacing_weekday_one_less__${day.value}`}
                          defaultChecked={weekdayModifiers[day.value] === "one_less"}
                        />
                        <span>One Less</span>
                      </label>
                    </div>
                  ))}
                </div>
              </details>
            </form>

            {calendarDays.length > 0 && course.schedule_model === "ab" ? (
              <details className="inlineDetails">
                <summary className="btn">AB Schedule?</summary>
                <div className="controlExpandedPanel">
                  <ABScheduleForm
                    courseId={course.id}
                    initialA={meetsA}
                    initialB={meetsB}
                    action={updateABMeetingDaysAction}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </div>

        {calendarDays.length === 0 ? (
          <div className="classPlanControlRow classPlanControlRowApply">
            <button className="btn" type="submit" form="class-plan-pacing-form">Apply Pacing Mode</button>
            <form action={generateCalendarAction}>
              <input type="hidden" name="course_id" value={course.id} />
              <button className="btn primary" type="submit">
                Generate Calendar
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="classPlanControlRow classPlanControlRowApply">
              <button className="btn" type="submit" form="class-plan-pacing-form">Apply Pacing Mode</button>
              <form
                id="class-plan-calendar-form"
                action={applyCalendarBulkAction}
                className="inlineControlForm classPlanCalendarApplyForm"
                data-auto-regenerate-target="1"
              >
                <input type="hidden" name="course_id" value={course.id} />
                <AutoRegenerateToggle />
                <label className="calendarSelectCell">
                  <input type="checkbox" name="copy_to_all" value="1" />
                  <span>Apply to all my classes</span>
                </label>
                <ApplyCalendarSubmit formId="class-plan-calendar-form" />
              </form>
            </div>

            <div className="classPlanControlRow classPlanControlRowTools">
              <details className="inlineDetails">
                <summary className="btn editorSummary">
                  <span className="showLabel">Show Full Calendar Editor</span>
                  <span className="hideLabel">Hide Full Calendar Editor</span>
                </summary>
                <div className="controlExpandedPanel controlExpandedPanelWide">
                    <div className="calendarBulkTools">
                      <strong>Selected Days</strong>
                      <select className="input" name="selected_bulk_scope" defaultValue="checked" form="class-plan-calendar-form">
                        <option value="checked">Apply To: Checked Days</option>
                        <option value="all_visible">Apply To: All Visible Days</option>
                      </select>
                      <select className="input" name="selected_day_type" defaultValue="" form="class-plan-calendar-form">
                        <option value="">Choose Day Type</option>
                        <option value="instructional">Full</option>
                        <option value="off">Off</option>
                        <option value="half">Half Day</option>
                        <option value="modified">Modified</option>
                        <option value="grace_day">Grace Day</option>
                      </select>
                      <select className="input" name="selected_reason_id" defaultValue="" form="class-plan-calendar-form">
                        <option value="">Keep Row Reason</option>
                        <option value="__clear__">Clear Reason</option>
                        {reasons.map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="calendarGridHeaderNoAction">
                      <span>Select</span>
                      <span>Date</span>
                      <span>AB</span>
                      <span>Day Type</span>
                      <span>Reason</span>
                      <span>Note</span>
                    </div>
                    <div className="calendarGridBody">
                      {visibleCalendarDays.map((day) => (
                        <div className="calendarRowNoAction" key={day.class_date}>
                          <label className="calendarSelectCell">
                            <input type="checkbox" name="selected_class_date" value={day.class_date} form="class-plan-calendar-form" />
                            <span>Select</span>
                          </label>
                          <span>{prettyDate(day.class_date)}</span>
                          <span>{day.ab_day || "-"}</span>
                          <select
                            className="input"
                            name={`day_type__${day.class_date}`}
                            defaultValue={day.day_type}
                            form="class-plan-calendar-form"
                          >
                            <option value="instructional">Full</option>
                            <option value="off">Off</option>
                            <option value="half">Half Day</option>
                            <option value="modified">Modified</option>
                            <option value="grace_day">Grace Day</option>
                          </select>
                          <select
                            className="input"
                            name={`reason_id__${day.class_date}`}
                            defaultValue={day.reason_id || ""}
                            form="class-plan-calendar-form"
                          >
                            <option value="">None</option>
                            {reasons.map((reason) => (
                              <option key={reason.id} value={reason.id}>
                                {reason.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input"
                            name={`note__${day.class_date}`}
                            defaultValue={day.note || ""}
                            placeholder="Optional"
                            form="class-plan-calendar-form"
                          />
                        </div>
                      ))}
                    </div>
                </div>
              </details>
              <form action={generateAnnouncementsAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <button className="btn" type="submit">Generate / Update Announcements</button>
              </form>
              <form action={copyCalendarToOtherClassesAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <button className="btn" type="submit">Copy Calendar to Other Classes</button>
              </form>
            </div>

          </>
        )}
        {calendarDays.length > 0 || completedActionMessages.length > 0 ? (
          <div className="classPlanCompletedActionSpace" aria-live="polite">
            {calendarDays.length > 0 ? (
              <span>
                AB Days: {meetsA ? "A" : ""}
                {meetsA && meetsB ? " + " : ""}
                {meetsB ? "B" : ""}
              </span>
            ) : null}
            {completedActionMessages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Lesson by Day</h2>
        {!curriculumEnabled ? (
          <p>This class does not have a curriculum track attached, so there are no lesson assignments to pace here.</p>
        ) : null}
        {planError ? <p>Could not load pacing plan: {planError.message}</p> : null}

        {!planError && curriculumEnabled && visibleCalendarDays.length === 0 ? (
          <p>No class days in calendar yet.</p>
        ) : null}

        {!planError && curriculumEnabled && visibleCalendarDays.length > 0 ? (
          <div className="list">
            {visibleCalendarDays.map((day) => {
              const dayPlanRows = planRowsByDate.get(day.class_date) || [];
              const firstLesson = dayPlanRows[0]?.curriculum_lessons;
              const suggestedSkills = findSuggestedSkills({ lesson: firstLesson, enabledGames });
              const announcementText = announcementByDate.get(day.class_date) || "";
              const reasonLabel = day.reason_id ? reasonById.get(day.reason_id) : null;
              const dayStatus =
                dayPlanRows.length === 0
                  ? "No lesson scheduled"
                  : dayPlanRows.every((row) => row.status === "completed")
                    ? "completed"
                    : dayPlanRows.some((row) => row.status === "completed")
                      ? "partly completed"
                      : "planned";
              const noLessonLabel = day.day_type === "off" ? "No School" : "Grace Day";

              if (dayPlanRows.length === 0) {
                return (
                  <article key={day.class_date} className="card" style={{ background: "#fff" }}>
                    <h3>{prettyDate(day.class_date)}</h3>
                    <p>
                      {noLessonLabel}{reasonLabel ? ` | ${reasonLabel}` : ""}
                    </p>
                    {day.note ? <p>{day.note}</p> : null}
                    <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                      Day Type: {day.day_type}
                    </p>

                    {announcementText ? (
                      <pre className="announcementText">{announcementText}</pre>
                    ) : null}

                    <div className="ctaRow compactDayActions">
                      {announcementText ? <CopyButton text={announcementText} /> : null}
                      <details className="dayModifyDetails">
                        <summary className="btn">Modify This Day</summary>
                        <form
                          className="calendarRow"
                          action={updateCalendarDayAction}
                          style={{ marginTop: "0.6rem" }}
                          data-auto-regenerate-target="1"
                        >
                          <input type="hidden" name="course_id" value={course.id} />
                          <input type="hidden" name="class_date" value={day.class_date} />
                          <span>{prettyDate(day.class_date)}</span>
                          <span>{day.ab_day || "-"}</span>
                          <select className="input" name="day_type" defaultValue={day.day_type}>
                            <option value="instructional">Full</option>
                            <option value="off">Off</option>
                            <option value="half">Half Day</option>
                            <option value="modified">Modified</option>
                            <option value="grace_day">Grace Day</option>
                          </select>
                          <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                            <option value="">None</option>
                            {reasons.map((reason) => (
                              <option key={reason.id} value={reason.id}>
                                {reason.label}
                              </option>
                            ))}
                          </select>
                          <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                          <button className="btn" type="submit">Save</button>
                        </form>
                      </details>
                    </div>
                  </article>
                );
              }

              return (
                <article key={day.class_date} className="card" style={{ background: "#fff" }}>
                  <h3>{prettyDate(day.class_date)}</h3>
                  <div className="lessonPlanList">
                    {dayPlanRows.map((row, index) => {
                      const lesson = row.curriculum_lessons;
                      const lessonLabel = lesson
                        ? formatLessonLabel(lesson?.source_lesson_code, lesson?.title)
                        : "No lesson assigned yet.";
                      const objectiveText = lesson?.objective
                        ? lesson.objective
                        : lesson
                          ? "No objective provided."
                          : "Add full days and click Apply Calendar Changes.";

                      return (
                        <div className="lessonPlanItem" key={`${day.class_date}-${row.lesson_slot || index + 1}`}>
                          <p>
                            <strong>Lesson {index + 1}:</strong> {lessonLabel}
                          </p>
                          <p>{objectiveText}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                    Status: {dayStatus}
                  </p>
                  {!hideSuggestions && suggestedSkills.length > 0 ? (
                    <div className="lessonSkillBlock">
                      <strong>Suggested MathClaw Skills</strong>
                      <div className="lessonSkillGrid">
                        {suggestedSkills.map((skill) => (
                          <div key={`${day.class_date}-${skill.slug}`} className="lessonSkillCard">
                            <div>
                              <p className="lessonSkillTitle">{GAME_LABELS[skill.slug] || skill.slug}</p>
                              <p className="lessonSkillWhy">{skill.why}</p>
                            </div>
                            <Link className="btn" href={gameHref(skill.slug, course.id)}>
                              Open Skill
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {pacingMode === "manual_complete" ? (
                    <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                      Manual pacing mode: this lesson repeats until you click Mark Complete.
                    </p>
                  ) : null}

                  {announcementText ? (
                    <pre className="announcementText">{announcementText}</pre>
                  ) : (
                    <p style={{ marginTop: "0.6rem", opacity: 0.75 }}>
                      No announcement generated for this day yet.
                    </p>
                  )}

                  <div className="ctaRow compactDayActions">
                    {announcementText ? <CopyButton text={announcementText} /> : null}

                    {dayPlanRows.length > 0 ? (
                      dayPlanRows.every((row) => row.status === "completed") ? (
                        <form action={markLessonPlannedAction}>
                          <input type="hidden" name="course_id" value={course.id} />
                          <input type="hidden" name="class_date" value={day.class_date} />
                          <button className="btn primary" type="submit">Completed</button>
                        </form>
                      ) : (
                        <form action={markLessonCompleteAction}>
                          <input type="hidden" name="course_id" value={course.id} />
                          <input type="hidden" name="class_date" value={day.class_date} />
                          <button className="btn" type="submit">Mark Complete</button>
                        </form>
                      )
                    ) : null}

                    <details className="dayModifyDetails">
                      <summary className="btn">Modify This Day</summary>
                      <form
                        className="calendarRow"
                        action={updateCalendarDayAction}
                        style={{ marginTop: "0.6rem" }}
                        data-auto-regenerate-target="1"
                      >
                        <input type="hidden" name="course_id" value={course.id} />
                        <input type="hidden" name="class_date" value={day.class_date} />
                        <span>{prettyDate(day.class_date)}</span>
                        <span>{day.ab_day || "-"}</span>
                        <select className="input" name="day_type" defaultValue={day.day_type}>
                          <option value="instructional">Full</option>
                          <option value="off">Off</option>
                          <option value="half">Half Day</option>
                          <option value="modified">Modified</option>
                        </select>
                        <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                          <option value="">None</option>
                          {reasons.map((reason) => (
                            <option key={reason.id} value={reason.id}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                        <button className="btn" type="submit">Save</button>
                      </form>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
