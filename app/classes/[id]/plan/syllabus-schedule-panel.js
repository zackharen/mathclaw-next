import SubmitButton from "@/app/components/SubmitButton";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";
import {
  ASSIGNMENT_CATEGORIES,
  assignmentCategoryLabel,
  formatClockTime,
  normalizeClockTime,
} from "@/lib/planning/fixed-dates";
import { deleteDatedAssignmentAction, moveLessonReleaseAction, saveDatedAssignmentAction } from "./syllabus-actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${month}/${day}/${year}`;
}

function dueLabel(assignment) {
  if (!assignment.due_date) return "No due date";
  const time = formatClockTime(assignment.due_time);
  return `Due ${dayLabel(assignment.due_date)}${time ? ` ${time}` : ""}`;
}

function AssignmentFields({ courseId, assignment, lessons, defaultDate, courseStart, courseEnd }) {
  return (
    <>
      <input type="hidden" name="course_id" value={courseId} />
      {assignment?.id ? <input type="hidden" name="assignment_id" value={assignment.id} /> : null}
      <div className="syllabusFormGrid">
        <label className="syllabusFormWide">
          Assignment
          <input className="input" name="label" defaultValue={assignment?.label || ""} required maxLength={200} />
        </label>
        <label>
          Released
          <input
            className="input"
            type="date"
            name="assignment_date"
            defaultValue={assignment?.assignment_date || defaultDate || ""}
            min={courseStart}
            max={courseEnd}
            required
          />
        </label>
        <label>
          Release time
          <input className="input" type="time" name="release_time" defaultValue={normalizeClockTime(assignment?.release_time)} />
        </label>
        <label>
          Due
          <input className="input" type="date" name="due_date" defaultValue={assignment?.due_date || ""} min={courseStart} max={courseEnd} />
        </label>
        <label>
          Due time
          <input className="input" type="time" name="due_time" defaultValue={normalizeClockTime(assignment?.due_time)} />
        </label>
        <label>
          Category
          <select className="input" name="category" defaultValue={assignment?.category || ""}>
            <option value="">Not set</option>
            {ASSIGNMENT_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Platform
          <input className="input" name="provider" defaultValue={assignment?.provider || ""} maxLength={80} placeholder="e.g. Edpuzzle" />
        </label>
        <label>
          Lesson
          <select className="input" name="lesson_id" defaultValue={assignment?.lesson_id || ""}>
            <option value="">None</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </select>
        </label>
        <label className="syllabusFormWide">
          Link
          <input className="input" type="url" name="url" defaultValue={assignment?.url || ""} placeholder="https://" />
        </label>
        <label className="syllabusFormWide">
          Notes
          <textarea className="input" name="notes" defaultValue={assignment?.notes || ""} rows={2} maxLength={2000} />
        </label>
        <label className="calendarSelectCell">
          <input type="checkbox" name="is_draft" defaultChecked={assignment ? Boolean(assignment.is_draft) : true} />
          <span>Draft (link or details still missing)</span>
        </label>
      </div>
    </>
  );
}

// Syllabus classes: every release date and dated assignment, editable in place.
// Saving regenerates this class's announcements.
export default function SyllabusSchedulePanel({ courseId, courseStart, courseEnd, planRows, assignments, message = null }) {
  const lessons = [];
  const releasesByDate = new Map();
  for (const row of planRows || []) {
    const lesson = row.curriculum_lessons;
    if (!lesson?.id) continue;
    const label = formatLessonLabel(lesson.source_lesson_code, lesson.title);
    if (!lessons.some((item) => item.id === lesson.id)) lessons.push({ id: lesson.id, label });
    releasesByDate.set(row.class_date, [...(releasesByDate.get(row.class_date) || []), { id: lesson.id, label }]);
  }
  const assignmentsByDate = new Map();
  for (const assignment of assignments || []) {
    assignmentsByDate.set(assignment.assignment_date, [...(assignmentsByDate.get(assignment.assignment_date) || []), assignment]);
  }
  const dates = [...new Set([...releasesByDate.keys(), ...assignmentsByDate.keys()])].sort();
  const draftCount = (assignments || []).filter((assignment) => assignment.is_draft).length;

  return (
    <section className="card" id="syllabus-schedule">
      <h2>Syllabus Schedule</h2>
      {message ? (
        <p className={message.kind === "error" ? "syllabusMessage isError" : "syllabusMessage"} role="status">
          {message.text}
        </p>
      ) : null}
      <p>
        Each lesson releases on its syllabus date, and each assignment keeps its own due date. Calendar, A/B, and pacing
        changes never move them. Edit them here.
      </p>
      <div className="kv">
        <div>
          <strong>Release Days</strong>
          <span>{dates.length}</span>
        </div>
        <div>
          <strong>Assignments</strong>
          <span>{(assignments || []).length}</span>
        </div>
        <div>
          <strong>Drafts</strong>
          <span>{draftCount}</span>
        </div>
      </div>

      <div className="list syllabusDays">
        {dates.map((date) => {
          const releases = releasesByDate.get(date) || [];
          const dayAssignments = (assignmentsByDate.get(date) || [])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { numeric: true }));
          const drafts = dayAssignments.filter((assignment) => assignment.is_draft).length;
          return (
            <details key={date} className="syllabusDay" id={`syllabus-${date}`}>
              <summary>
                <strong>{dayLabel(date)}</strong>
                <span>{releases.length ? releases.map((release) => release.label).join(" · ") : "No lesson release"}</span>
                <span className="syllabusDayCount">
                  {dayAssignments.length} assignment{dayAssignments.length === 1 ? "" : "s"}
                  {drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
                </span>
              </summary>

              {releases.map((release) => (
                <form key={release.id} action={moveLessonReleaseAction} className="syllabusMoveForm">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="lesson_id" value={release.id} />
                  <input type="hidden" name="from_date" value={date} />
                  <span>{release.label}</span>
                  <label>
                    Release date
                    <input className="input" type="date" name="to_date" defaultValue={date} min={courseStart} max={courseEnd} required />
                  </label>
                  <label className="calendarSelectCell">
                    <input type="checkbox" name="move_assignments" defaultChecked />
                    <span>Move its assignments released this day too</span>
                  </label>
                  <SubmitButton className="btn" pendingLabel="Moving…">Move Release</SubmitButton>
                </form>
              ))}

              <div className="list syllabusAssignments">
                {dayAssignments.map((assignment) => (
                  <details key={assignment.id} className="syllabusAssignment">
                    <summary>
                      <strong>{assignment.label}</strong>
                      <span>{dueLabel(assignment)}</span>
                      {assignment.category ? <span className="allClassesGridTag">{assignmentCategoryLabel(assignment.category)}</span> : null}
                      {assignment.is_draft ? <span className="allClassesGridTag syllabusDraftTag">Draft</span> : null}
                    </summary>
                    {assignment.notes ? <p className="syllabusNotes">{assignment.notes}</p> : null}
                    <form action={saveDatedAssignmentAction} className="syllabusAssignmentForm">
                      <AssignmentFields
                        courseId={courseId}
                        assignment={assignment}
                        lessons={lessons}
                        courseStart={courseStart}
                        courseEnd={courseEnd}
                      />
                      <SubmitButton className="btn primary" pendingLabel="Saving…">Save Assignment</SubmitButton>
                    </form>
                    <form action={deleteDatedAssignmentAction}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="assignment_id" value={assignment.id} />
                      <input type="hidden" name="anchor_date" value={date} />
                      <SubmitButton className="btn" pendingLabel="Removing…">Remove Assignment</SubmitButton>
                    </form>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <details className="inlineDetails" style={{ marginTop: "0.75rem" }}>
        <summary className="btn">Add Assignment</summary>
        <div className="controlExpandedPanel controlExpandedPanelWide">
          <form action={saveDatedAssignmentAction} className="syllabusAssignmentForm">
            <AssignmentFields
              courseId={courseId}
              assignment={null}
              lessons={lessons}
              defaultDate={courseStart}
              courseStart={courseStart}
              courseEnd={courseEnd}
            />
            <SubmitButton className="btn primary" pendingLabel="Adding…">Add Assignment</SubmitButton>
          </form>
        </div>
      </details>
    </section>
  );
}
