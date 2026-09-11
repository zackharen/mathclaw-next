import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";
import { loadLessonResourcePlanningData } from "@/lib/lesson-resources/server";
import {
  addDaysIso,
  buildAllClassesGrid,
  gridSchoolDates,
  gridWeekStart,
} from "@/lib/planning/all-classes-grid";
import { markLessonCompleteAction, markLessonPlannedAction } from "./actions";
import SubmitButton from "../../../components/SubmitButton";
import GridCellResources from "./grid-cell-resources";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayParts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    short: `${month}/${day}`,
  };
}

function rowsOrThrow(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

export default async function AllClassesGrid({ currentCourseId, userId, gridStartParam }) {
  const supabase = await createClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const focusDate = /^\d{4}-\d{2}-\d{2}$/.test(String(gridStartParam || "")) ? gridStartParam : todayIso;
  const weekStart = gridWeekStart(focusDate);
  const dates = gridSchoolDates(weekStart);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const courses = await listEditableCoursesForUser(supabase, userId);
  const courseIds = courses.map((course) => course.id);

  const [lessonCounts, calendarDays, planRows] = courseIds.length
    ? await Promise.all([
        // One existence check per class rather than one big select: a single
        // query is capped at 1000 rows and would silently drop whole classes.
        Promise.all(
          courseIds.map((courseId) =>
            supabase
              .from("course_lesson_plan")
              .select("course_id", { count: "exact", head: true })
              .eq("course_id", courseId)
              .then((result) => {
                if (result.error) throw new Error(result.error.message);
                return [courseId, result.count || 0];
              })
          )
        ),
        supabase
          .from("course_calendar_days")
          .select("course_id, class_date, day_type, ab_day, is_grace_day")
          .in("course_id", courseIds)
          .gte("class_date", firstDate)
          .lte("class_date", lastDate)
          .then(rowsOrThrow),
        supabase
          .from("course_lesson_plan")
          .select("course_id, class_date, lesson_slot, status, curriculum_lessons(id, source_lesson_code, title)")
          .in("course_id", courseIds)
          .gte("class_date", firstDate)
          .lte("class_date", lastDate)
          .order("class_date", { ascending: true })
          .order("lesson_slot", { ascending: true })
          .then(rowsOrThrow),
      ])
    : [[], [], []];

  const lessonCountByCourse = new Map(lessonCounts);
  const columns = courses
    .filter((course) => lessonCountByCourse.get(course.id) > 0)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const grid = buildAllClassesGrid({ courses: columns, dates, calendarDays, planRows });

  const lessonIds = [...new Set(planRows.map((row) => row.curriculum_lessons?.id).filter(Boolean))];
  const resourceData = await loadLessonResourcePlanningData({ userId, lessonIds });
  const resourcesFor = (ids) =>
    resourceData.ownResources
      .filter((resource) => resource.lessonIds.some((id) => ids.includes(id)))
      .map((resource) => ({ id: resource.id, title: resource.title }));

  const basePath = `/classes/${currentCourseId}/plan`;
  const weekHref = (start) => `${basePath}?grid_start=${start}`;

  return (
    <div className="stack">
      <section className="card allClassesGridCard">
        <div className="allClassesGridHeader">
          <div>
            <h2>
              {dayParts(firstDate).short} – {dayParts(lastDate).short}
            </h2>
            <p>Mark lessons complete and add files without leaving the grid.</p>
          </div>
          <div className="ctaRow allClassesGridNav">
            <Link className="btn" href={weekHref(addDaysIso(weekStart, -7))}>
              ← Previous Week
            </Link>
            <Link className="btn" href={basePath}>
              This Week
            </Link>
            <Link className="btn" href={weekHref(addDaysIso(weekStart, 7))}>
              Next Week →
            </Link>
          </div>
        </div>

        {columns.length === 0 ? (
          <p>None of your classes have scheduled lessons yet.</p>
        ) : (
          <div className="allClassesGridScroll">
            <table className="allClassesGrid" style={{ minWidth: `${7 + columns.length * 11}rem` }}>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  {columns.map((course) => (
                    <th scope="col" key={course.id}>
                      {course.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, rowIndex) => {
                  const { weekday, short } = dayParts(row.date);
                  const rowId = `grid-day-${row.date}`;
                  const returnTo = `${weekHref(weekStart)}#${rowId}`;
                  const rowClass =
                    [
                      row.date === todayIso ? "isToday" : "",
                      rowIndex === 5 ? "isWeekBreak" : "",
                      row.schoolClosed ? "isClosed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined;
                  const dayHeader = (
                    <th scope="row">
                      {weekday}
                      <br />
                      {short}
                    </th>
                  );

                  if (row.schoolClosed) {
                    return (
                      <tr key={row.date} id={rowId} className={rowClass}>
                        {dayHeader}
                        <td colSpan={columns.length} className="allClassesGridMuted">
                          No School
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.date} id={rowId} className={rowClass}>
                      {dayHeader}
                      {row.cells.map((cell, index) => {
                        const course = columns[index];
                        if (cell.kind === "no-meeting") {
                          return (
                            <td key={course.id} className="allClassesGridMuted" aria-label="Class does not meet">
                              ·
                            </td>
                          );
                        }
                        if (cell.kind === "off") {
                          return (
                            <td key={course.id} className="allClassesGridMuted">
                              No School
                            </td>
                          );
                        }
                        if (cell.kind === "empty") {
                          return (
                            <td key={course.id} className="allClassesGridMuted">
                              {cell.grace ? "Grace Day" : "No lesson"}
                            </td>
                          );
                        }

                        const labels = cell.lessons.map((lesson) => formatLessonLabel(lesson.code, lesson.title));
                        return (
                          <td key={course.id} className={cell.complete ? "isComplete" : undefined}>
                            {cell.dayType === "half" ? <span className="allClassesGridTag">Half Day</span> : null}
                            {cell.lessons.map((lesson, lessonIndex) => (
                              <span key={lesson.id} className="allClassesGridLesson" title={labels[lessonIndex]}>
                                {labels[lessonIndex]}
                              </span>
                            ))}
                            <div className="allClassesGridCellActions">
                              <form action={cell.complete ? markLessonPlannedAction : markLessonCompleteAction}>
                                <input type="hidden" name="course_id" value={course.id} />
                                <input type="hidden" name="class_date" value={row.date} />
                                <input type="hidden" name="return_to" value={returnTo} />
                                <SubmitButton
                                  className={`btn allClassesGridComplete${cell.complete ? " isComplete" : ""}`}
                                  pendingLabel="Saving…"
                                >
                                  {cell.complete ? "✓ Completed" : "Mark Complete"}
                                </SubmitButton>
                              </form>
                              {resourceData.available ? (
                                <GridCellResources
                                  ownerId={userId}
                                  courseId={course.id}
                                  classDate={row.date}
                                  lessons={cell.lessons.map((lesson, lessonIndex) => ({
                                    id: lesson.id,
                                    label: labels[lessonIndex],
                                  }))}
                                  resources={resourcesFor(cell.lessons.map((lesson) => lesson.id))}
                                  siteNames={resourceData.siteNames}
                                />
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
