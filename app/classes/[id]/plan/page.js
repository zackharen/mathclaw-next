import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePacingAction } from "./actions";
import { generateAnnouncementsAction } from "../announcements/actions";
import { generateCalendarAction, updateCalendarDayAction } from "../calendar/actions";
import CopyButton from "../announcements/copy-button";

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

  if (normalizedTitle.toLowerCase().startsWith(`${normalizedCode.toLowerCase()}:`)) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}

export default async function ClassPlanPage({ params }) {
  const { id } = await params;
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

  const { count: totalLessonsCount } = await supabase
    .from("curriculum_lessons")
    .select("id", { count: "exact", head: true })
    .eq("library_id", course.selected_library_id);

  const { data: calendarDays } = await supabase
    .from("course_calendar_days")
    .select("class_date, day_type, ab_day, reason_id, note")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  const { data: reasons } = await supabase
    .from("day_off_reasons")
    .select("id, label")
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("label", { ascending: true });

  const { data: planRows, error: planError } = await supabase
    .from("course_lesson_plan")
    .select("class_date, status, curriculum_lessons(sequence_index, source_lesson_code, title, objective)")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  const { data: announcements } = await supabase
    .from("course_announcements")
    .select("class_date, content")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  const announcementByDate = new Map((announcements || []).map((a) => [a.class_date, a.content]));
  const calendarByDate = new Map((calendarDays || []).map((d) => [d.class_date, d]));

  const instructionalDaysCount = (calendarDays || []).filter((d) => d.day_type === "instructional").length;
  const plannedCount = planRows?.length || 0;
  const announcementCount = announcements?.length || 0;

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Plan</h1>
        <p>
          {course.class_name} | {course.schedule_model === "ab" ? `AB (${course.ab_meeting_day || "A/B"})` : "Every Day"} | {course.school_year_start} to {course.school_year_end}
        </p>
        <div className="ctaRow">
          <Link className="btn" href="/classes">
            Back to Classes
          </Link>
          <a className="btn" href="#modify-calendar">
            Modify Calendar
          </a>
          <form action={generatePacingAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <button className="btn primary" type="submit">
              Generate Pacing
            </button>
          </form>
          <form action={generateAnnouncementsAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <button className="btn" type="submit">
              Generate Announcements
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="kv">
          <div><strong>Instructional Days</strong><span>{instructionalDaysCount || 0}</span></div>
          <div><strong>Library Lessons</strong><span>{totalLessonsCount || 0}</span></div>
          <div><strong>Planned Lessons</strong><span>{plannedCount}</span></div>
          <div><strong>Generated Announcements</strong><span>{announcementCount}</span></div>
        </div>
      </section>

      <section className="card" id="modify-calendar">
        <h2>Modify Calendar</h2>
        {(calendarDays || []).length === 0 ? (
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
            <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
              <form action={generateCalendarAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <input type="hidden" name="force" value="1" />
                <button className="btn" type="submit">
                  Regenerate Calendar
                </button>
              </form>
            </div>
            <details style={{ marginTop: "0.75rem" }}>
              <summary className="btn" style={{ display: "inline-block" }}>Show Full Calendar Editor</summary>
              <div className="calendarGridHeader" style={{ marginTop: "0.75rem" }}>
                <span>Date</span>
                <span>AB</span>
                <span>Day Type</span>
                <span>Reason</span>
                <span>Note</span>
                <span>Action</span>
              </div>
              <div className="calendarGridBody">
                {(calendarDays || []).map((day) => (
                  <form className="calendarRow" key={day.class_date} action={updateCalendarDayAction}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="class_date" value={day.class_date} />
                    <span>{prettyDate(day.class_date)}</span>
                    <span>{day.ab_day || "-"}</span>
                    <select className="input" name="day_type" defaultValue={day.day_type}>
                      <option value="instructional">Instructional</option>
                      <option value="off">Off</option>
                      <option value="half">Half Day</option>
                      <option value="modified">Modified</option>
                    </select>
                    <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                      <option value="">None</option>
                      {(reasons || []).map((reason) => (
                        <option key={reason.id} value={reason.id}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                    <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                    <button className="btn" type="submit">Save</button>
                  </form>
                ))}
              </div>
            </details>
          </>
        )}
      </section>

      <section className="card">
        <h2>Lesson by Day</h2>
        {planError ? <p>Could not load pacing plan: {planError.message}</p> : null}

        {!planError && plannedCount === 0 ? (
          <p>No pacing rows yet. Click Generate Pacing.</p>
        ) : null}

        {!planError && plannedCount > 0 ? (
          <div className="list">
            {planRows.map((row) => {
              const lesson = row.curriculum_lessons;
              const announcementText = announcementByDate.get(row.class_date) || "";
              const day = calendarByDate.get(row.class_date);

              return (
                <article key={row.class_date} className="card" style={{ background: "#fff" }}>
                  <h3>{prettyDate(row.class_date)}</h3>
                  <p>{formatLessonLabel(lesson?.source_lesson_code, lesson?.title)}</p>
                  <p>{lesson?.objective || "No objective provided."}</p>
                  <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>Status: {row.status}</p>

                  {announcementText ? (
                    <>
                      <pre className="announcementText">{announcementText}</pre>
                      <div className="ctaRow">
                        <CopyButton text={announcementText} />
                      </div>
                    </>
                  ) : (
                    <p style={{ marginTop: "0.6rem", opacity: 0.75 }}>
                      No announcement generated for this day yet.
                    </p>
                  )}

                  {day ? (
                    <details style={{ marginTop: "0.8rem" }}>
                      <summary className="btn" style={{ display: "inline-block" }}>Modify This Day</summary>
                      <form className="calendarRow" action={updateCalendarDayAction} style={{ marginTop: "0.6rem" }}>
                        <input type="hidden" name="course_id" value={course.id} />
                        <input type="hidden" name="class_date" value={row.class_date} />
                        <span>{prettyDate(row.class_date)}</span>
                        <span>{day.ab_day || "-"}</span>
                        <select className="input" name="day_type" defaultValue={day.day_type}>
                          <option value="instructional">Instructional</option>
                          <option value="off">Off</option>
                          <option value="half">Half Day</option>
                          <option value="modified">Modified</option>
                        </select>
                        <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                          <option value="">None</option>
                          {(reasons || []).map((reason) => (
                            <option key={reason.id} value={reason.id}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                        <button className="btn" type="submit">Save</button>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
