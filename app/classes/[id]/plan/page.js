import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateABMeetingDaysAction } from "./actions";
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

export default async function ClassPlanPage({ params, searchParams }) {
  const pageStart = process.hrtime.bigint();
  const { id } = await params;
  const qs = (await searchParams) || {};
  const calendarUpdated = qs.calendar_updated === "1";
  const abUpdated = qs.ab_updated === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/plan`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select(
      "id, title, class_name, selected_library_id, schedule_model, ab_meeting_day, school_year_start, school_year_end"
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!course) {
    redirect("/classes");
  }

  const dataFetchStart = process.hrtime.bigint();
  const [
    lessonsCountRes,
    calendarDaysRes,
    reasonsRes,
    planRes,
    announcementsRes,
  ] = await Promise.all([
    supabase
      .from("curriculum_lessons")
      .select("id", { count: "exact", head: true })
      .eq("library_id", course.selected_library_id),
    supabase
      .from("course_calendar_days")
      .select("class_date, day_type, ab_day, reason_id, note")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    supabase
      .from("day_off_reasons")
      .select("id, label")
      .or(`owner_id.is.null,owner_id.eq.${user.id}`)
      .order("label", { ascending: true }),
    supabase
      .from("course_lesson_plan")
      .select(
        "class_date, status, curriculum_lessons(sequence_index, source_lesson_code, title, objective)"
      )
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    supabase
      .from("course_announcements")
      .select("class_date, content")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
  ]);

  const totalLessonsCount = lessonsCountRes.count || 0;
  const calendarDays = calendarDaysRes.data || [];
  const reasons = reasonsRes.data || [];
  const planRows = planRes.data || [];
  const planError = planRes.error;
  const announcements = announcementsRes.data || [];

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
        </div>
      </section>

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

              <form
                action={applyCalendarBulkAction}
                className="inlineControlForm"
                data-auto-regenerate-target="1"
              >
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
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Lesson by Day</h2>
        {planError ? <p>Could not load pacing plan: {planError.message}</p> : null}

        {!planError && visibleCalendarDays.length === 0 ? (
          <p>No class days in calendar yet.</p>
        ) : null}

        {!planError && visibleCalendarDays.length > 0 ? (
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

                  {announcementText ? (
                    <pre className="announcementText">{announcementText}</pre>
                  ) : (
                    <p style={{ marginTop: "0.6rem", opacity: 0.75 }}>
                      No announcement generated for this day yet.
                    </p>
                  )}

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
