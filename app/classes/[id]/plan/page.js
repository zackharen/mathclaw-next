import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  markLessonCompleteAction,
  markLessonPlannedAction,
  updateABMeetingDaysAction,
  updatePacingModeAction,
} from "./actions";
import {
  applyCalendarBulkAction,
  generateCalendarAction,
  updateCalendarDayAction,
} from "../calendar/actions";
import CopyButton from "../announcements/copy-button";
import AutoRegenerateToggle from "./auto-regenerate-toggle";
import ABScheduleForm from "./ab-schedule-form";
import ApplyCalendarSubmit from "./apply-calendar-submit";

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
  sudoku: "Sudoku",
  comet_typing: "Comet Typing",
};

function hasCurriculum(course) {
  return Boolean(course?.selected_library_id);
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
  const abUpdated = qs.ab_updated === "1";
  const progressUpdated = qs.progress_updated === "1";
  const announcementsUpdated = qs.announcements_updated === "1";
  const pacingUpdated = qs.pacing_updated === "1";
  const imported = qs.imported === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/plan`);
  }

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    id,
    "id, title, class_name, selected_library_id, schedule_model, ab_meeting_day, school_year_start, school_year_end, pacing_mode, owner_id"
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
        "class_date, status, curriculum_lessons(sequence_index, source_lesson_code, title, objective)"
      )
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    courseDataClient
      .from("course_announcements")
      .select("class_date, content")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    listGamesWithCourseSettings(supabase, course.id),
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
  const planByDate = new Map(planRows.map((row) => [row.class_date, row]));
  const reasonById = new Map(reasons.map((reason) => [reason.id, reason.label]));

  const meetsA = course.ab_meeting_day !== "B";
  const meetsB = course.ab_meeting_day !== "A";

  const visibleCalendarDays = calendarDays.filter((day) => {
    if (course.schedule_model !== "ab") return true;
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

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Plan</h1>
        <p>
          {course.class_name} |{" "}
          {course.schedule_model === "ab"
            ? `AB (${course.ab_meeting_day || "Both"})`
            : "Every Day"}{" "}
          | {course.school_year_start} to {course.school_year_end}
        </p>
        <div className="ctaRow">
          <Link className="btn" href="/classes">
            Back to Classes
          </Link>
          <form action={updatePacingModeAction} className="inlineControlForm">
            <input type="hidden" name="course_id" value={course.id} />
            <select
              className="input"
              name="pacing_mode"
              defaultValue={course.pacing_mode || "one_lesson_per_day"}
              style={{ minWidth: 240 }}
            >
              <option value="one_lesson_per_day">Pacing: One Lesson Per Full Day</option>
              <option value="two_lessons_per_day">Pacing: 2 Lessons Per Day</option>
              <option value="two_lessons_unless_modified">
                Pacing: 2 Lessons Per Day Unless There Is a Modified Schedule
              </option>
              <option value="manual_complete">Pacing: Manual (Move On When Complete)</option>
            </select>
            <button className="btn" type="submit">Apply Pacing Mode</button>
          </form>
        </div>
        {pacingUpdated ? (
          <div className="controlStatusLineStatic">
            <span>Pacing Mode Updated!</span>
          </div>
        ) : null}
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

        {calendarDays.length === 0 ? (
          <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
            <form action={generateCalendarAction}>
              <input type="hidden" name="course_id" value={course.id} />
              <button className="btn primary" type="submit">
                Generate Calendar
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="controlBar" style={{ marginTop: "0.75rem" }}>
              {course.schedule_model === "ab" ? (
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

              <form action={applyCalendarBulkAction} className="inlineControlForm" data-auto-regenerate-target="1">
                <input type="hidden" name="course_id" value={course.id} />
                <AutoRegenerateToggle />
                <ApplyCalendarSubmit calendarUpdated={calendarUpdated} />

                <details className="inlineDetails">
                  <summary className="btn editorSummary">
                    <span className="showLabel">Show Full Calendar Editor</span>
                    <span className="hideLabel">Hide Full Calendar Editor</span>
                  </summary>
                  <div className="controlExpandedPanel controlExpandedPanelWide">
                    <div className="calendarGridHeaderNoAction">
                      <span>Date</span>
                      <span>AB</span>
                      <span>Day Type</span>
                      <span>Reason</span>
                      <span>Note</span>
                    </div>
                    <div className="calendarGridBody">
                      {visibleCalendarDays.map((day) => (
                        <div className="calendarRowNoAction" key={day.class_date}>
                          <span>{prettyDate(day.class_date)}</span>
                          <span>{day.ab_day || "-"}</span>
                          <select
                            className="input"
                            name={`day_type__${day.class_date}`}
                            defaultValue={day.day_type}
                          >
                            <option value="instructional">Full</option>
                            <option value="off">Off</option>
                            <option value="half">Half Day</option>
                            <option value="modified">Modified</option>
                          </select>
                          <select
                            className="input"
                            name={`reason_id__${day.class_date}`}
                            defaultValue={day.reason_id || ""}
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
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </form>
            </div>

            <div className="controlStatusLineStatic">
              <span>
                AB Days: {meetsA ? "A" : ""}
                {meetsA && meetsB ? " + " : ""}
                {meetsB ? "B" : ""}
              </span>
              {abUpdated ? <span>AB Schedule Updated!</span> : null}
              {progressUpdated ? <span>Progress Updated!</span> : null}
              {announcementsUpdated ? <span>Announcements Updated!</span> : null}
              {imported ? <span>Calendar Imported!</span> : null}
            </div>
          </>
        )}
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
              const row = planByDate.get(day.class_date);
              const lesson = row?.curriculum_lessons;
              const lessonLabel = lesson
                ? formatLessonLabel(lesson?.source_lesson_code, lesson?.title)
                : "No lesson assigned yet.";
              const objectiveText = lesson?.objective
                ? lesson.objective
                : lesson
                  ? "No objective provided."
                  : "Add full days and click Apply Calendar Changes.";
              const suggestedSkills = findSuggestedSkills({ lesson, enabledGames });
              const announcementText = announcementByDate.get(day.class_date) || "";
              const reasonLabel = day.reason_id ? reasonById.get(day.reason_id) : null;

              if (day.day_type !== "instructional") {
                return (
                  <article key={day.class_date} className="card" style={{ background: "#fff" }}>
                    <h3>{prettyDate(day.class_date)}</h3>
                    <p>
                      Off Day{reasonLabel ? ` | ${reasonLabel}` : ""}
                    </p>
                    {day.note ? <p>{day.note}</p> : null}
                    <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                      Day Type: {day.day_type}
                    </p>

                    <div className="ctaRow compactDayActions">
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
              }

              return (
                <article key={day.class_date} className="card" style={{ background: "#fff" }}>
                  <h3>{prettyDate(day.class_date)}</h3>
                  <p>{lessonLabel}</p>
                  <p>{objectiveText}</p>
                  <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                    Status: {row?.status || "planned"}
                  </p>
                  {suggestedSkills.length > 0 ? (
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
                  {course.pacing_mode === "manual_complete" ? (
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

                    {row ? (
                      row.status === "completed" ? (
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
