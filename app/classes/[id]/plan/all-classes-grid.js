import { Fragment, cloneElement } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";
import { buildGridLessonCourseOptions } from "@/lib/lesson-resources/constants";
import { loadLessonResourcePlanningData } from "@/lib/lesson-resources/server";
import {
  addDaysIso,
  buildAllClassesGrid,
  gridSchoolDates,
  gridWeekStart,
} from "@/lib/planning/all-classes-grid";
import GridCompletionButton from "./grid-completion-button";
import BulkGridResources from "./bulk-grid-resources";
import GridCellResources from "./grid-cell-resources";
import GridCellVocabulary from "./grid-cell-vocabulary";
import GridCellAnnouncements from "./grid-cell-announcements";
import GridDaySchedule from "./grid-day-schedule";
import VocabularyCsvImport from "./vocabulary-csv-import";
import ManageClassVocabulary from "./manage-class-vocabulary";
import ManageGridResources from "./manage-grid-resources";
import LessonCountToggle from "./lesson-count-toggle";
import SkippedLessonsPanel from "./skipped-lessons-panel";
import LessonSwapBar from "./lesson-swap-bar";
import { GridCellCustomLessons } from "./custom-lesson-form";
import { isPastSkippedLesson, loadSkippedLessonIds, loadSkippedLessonLog } from "@/lib/planning/skipped-lessons";
import { coverageByWeek } from "@/lib/announcements/assessment-coverage";
import { formatClockTime, isFixedDatesCourse } from "@/lib/planning/fixed-dates";
import { loadAssessmentCoverage } from "@/lib/assessment-resources/server";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayParts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    short: `${month}/${day}`,
  };
}

// Server-formatted so the page and the browser agree; teachers are on Eastern time.
function skipDay(iso) {
  if (!iso) return null;
  const { weekday, short } = dayParts(iso);
  return `${weekday} ${short}`;
}

function skipWhen(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
    : null;
}

// What a syllabus class has due on a grid day, shown whether or not anything
// new is released that day.
function DueList({ due }) {
  if (!due?.length) return null;
  return (
    <ul className="allClassesGridDue" aria-label="Due this day">
      {due.map((item) => (
        <li key={item.id}>
          <strong>
            Due{item.due_day ? ` ${item.due_day}` : ""}
            {item.due_time ? ` ${formatClockTime(item.due_time)}` : ""}:
          </strong>{" "}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function rowsOrThrow(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

export default async function AllClassesGrid({ currentCourseId, userId, gridStartParam, planMessage = null, planMessageKey = "" }) {
  const supabase = await createClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const focusDate = /^\d{4}-\d{2}-\d{2}$/.test(String(gridStartParam || "")) ? gridStartParam : todayIso;
  const weekStart = gridWeekStart(focusDate);
  const dates = gridSchoolDates(weekStart);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const courses = await listEditableCoursesForUser(supabase, userId);
  const courseIds = courses.map((course) => course.id);

  const [lessonCounts, calendarDays, planRows, announcementRows, skipped, skipLog, pacingRows, dueAssignments] = courseIds.length
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
          .select("course_id, class_date, day_type, ab_day, is_grace_day, lesson_count_override")
          .in("course_id", courseIds)
          .gte("class_date", firstDate)
          .lte("class_date", lastDate)
          .then(rowsOrThrow),
        supabase
          .from("course_lesson_plan")
          .select("course_id, class_date, lesson_slot, status, curriculum_lessons(id, source_lesson_code, title, course_id)")
          .in("course_id", courseIds)
          .gte("class_date", firstDate)
          .lte("class_date", lastDate)
          .order("class_date", { ascending: true })
          .order("lesson_slot", { ascending: true })
          .then(rowsOrThrow),
        supabase
          .from("course_announcements")
          .select("course_id, class_date, content")
          .in("course_id", courseIds)
          .gte("class_date", firstDate)
          .lte("class_date", lastDate)
          .then(rowsOrThrow),
        loadSkippedLessonIds(supabase, courseIds),
        loadSkippedLessonLog(supabase, courseIds),
        supabase.from("courses").select("id, pacing_mode").in("id", courseIds).then(rowsOrThrow),
        // Dated syllabus assignments due in these two weeks. A failure (e.g. an
        // older schema) hides due lines rather than the grid.
        supabase
          .from("teacher_announcement_assignments")
          .select("id, course_id, label, due_date, due_time, sort_order")
          .in("course_id", courseIds)
          .gte("due_date", firstDate)
          .lte("due_date", addDaysIso(lastDate, 2))
          .then((result) => (result.error ? [] : result.data || [])),
      ])
    : [[], [], [], [], { available: true, byCourse: new Map() }, { available: true, byCourse: new Map() }, [], []];

  const lessonCountByCourse = new Map(lessonCounts);
  const pacingByCourse = new Map(pacingRows.map((row) => [row.id, row.pacing_mode]));
  const columns = courses
    .filter((course) => lessonCountByCourse.get(course.id) > 0)
    .map((course) => ({ ...course, pacing_mode: pacingByCourse.get(course.id) || course.pacing_mode }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  const loggedIds = columns.flatMap((course) => skipLog.byCourse.get(course.id) || []).map((entry) => entry.lesson_id);
  const skippedIds = [...new Set([...columns.flatMap((course) => skipped.byCourse.get(course.id) || []), ...loggedIds])];
  const coursesWithSkips = columns.filter((course) => (skipped.byCourse.get(course.id) || []).length > 0);
  const lessonIds = [...new Set(planRows.map((row) => row.curriculum_lessons?.id).filter(Boolean))];
  const [coverageRows, resourceData, skippedLessonRows, lastCompletedRows] = await Promise.all([
    // A coverage failure hides the Assessment rows rather than the grid.
    Promise.all(
      columns.map((course) =>
        // Syllabus classes schedule their own exams; no weekly coverage row.
        // A failure also hides that class's rule deadlines, not the grid.
        isFixedDatesCourse(course)
          ? Promise.resolve([course.id, null, []])
          : loadAssessmentCoverage({ course })
          .then((coverage) => [
            course.id,
            coverage.hasWeeklyAssessment ? coverageByWeek(coverage.entries) : null,
            coverage.dueAssignments.filter((item) => item.due_date >= firstDate && item.due_date <= addDaysIso(lastDate, 2)),
          ])
          .catch(() => [course.id, null, []])
      )
    ),
    loadLessonResourcePlanningData({ userId, lessonIds }),
    skippedIds.length
      ? supabase
          .from("curriculum_lessons")
          .select("id, source_lesson_code, title, sequence_index")
          .in("id", skippedIds)
          .then(rowsOrThrow)
      : [],
    // Plan rows run in teaching order, so the latest completed row holds the
    // furthest lesson the class has finished.
    Promise.all(
      coursesWithSkips.map((course) =>
        supabase
          .from("course_lesson_plan")
          .select("curriculum_lessons(sequence_index)")
          .eq("course_id", course.id)
          .eq("status", "completed")
          .order("class_date", { ascending: false })
          .order("lesson_slot", { ascending: false })
          .limit(1)
          .then(rowsOrThrow)
          .then((rows) => [course.id, rows[0]?.curriculum_lessons?.sequence_index ?? null])
      )
    ),
  ]);
  const coverageByCourse = new Map(coverageRows.map(([courseId, byWeek]) => [courseId, byWeek]));
  const grid = buildAllClassesGrid({
    courses: columns,
    dates,
    calendarDays,
    planRows,
    dueAssignments: [...dueAssignments, ...coverageRows.flatMap(([, , due]) => due)],
  });
  const showAssessmentRows = coverageRows.some(([, byWeek]) => byWeek);
  const skippedLessonById = new Map(skippedLessonRows.map((lesson) => [lesson.id, lesson]));
  const lastCompletedByCourse = new Map(lastCompletedRows);
  const lessonLabel = (lesson) => formatLessonLabel(lesson.source_lesson_code, lesson.title);
  const skippedClasses = columns.map((course) => {
    const log = skipLog.byCourse.get(course.id) || [];
    const openEntry = (lessonId) => [...log].reverse().find((entry) => entry.lesson_id === lessonId && !entry.undone_at);
    return {
      id: course.id,
      title: course.title,
      lessons: (skipped.byCourse.get(course.id) || [])
        .map((id) => skippedLessonById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.sequence_index - b.sequence_index)
        .map((lesson) => ({
          id: lesson.id,
          label: lessonLabel(lesson),
          skippedFrom: skipDay(openEntry(lesson.id)?.skipped_from),
          skippedAt: skipWhen(openEntry(lesson.id)?.skipped_at),
          past: isPastSkippedLesson(lesson.sequence_index, lastCompletedByCourse.get(course.id)),
        })),
      undone: log
        .filter((entry) => entry.undone_at && skippedLessonById.has(entry.lesson_id))
        .sort((a, b) => b.undone_at.localeCompare(a.undone_at))
        .slice(0, 10)
        .map((entry) => ({
          key: `${entry.lesson_id}-${entry.undone_at}`,
          label: lessonLabel(skippedLessonById.get(entry.lesson_id)),
          skippedFrom: skipDay(entry.skipped_from),
          skippedAt: skipWhen(entry.skipped_at),
          undoneAt: skipWhen(entry.undone_at),
        })),
    };
  });

  const bulkResourceCourses = buildGridLessonCourseOptions(columns, planRows);
  const resourcesFor = (ids) =>
    resourceData.ownResources
      .filter(
        (resource) =>
          resource.item_kind !== "vocabulary" &&
          resource.lessonIds.some((id) => ids.includes(id))
      )
      .map((resource) => ({ id: resource.id, title: resource.title }));
  const vocabularyFor = (ids) =>
    resourceData.ownResources
      .filter(
        (resource) =>
          resource.item_kind === "vocabulary" &&
          resource.lessonIds.some((id) => ids.includes(id))
      )
      .map((resource) => ({
        id: resource.id,
        title: resource.title,
        definition: resource.definition,
        resource_type: resource.resource_type,
      }));

  const announcementByCell = new Map(
    announcementRows.map((row) => [`${row.course_id}|${row.class_date}`, row.content])
  );

  // After each week's Friday: what that week's assessment covers, per class.
  const withWeekAssessment = (row, rowIndex, dayRow) => {
    if (!showAssessmentRows || rowIndex % 5 !== 4) return dayRow;
    const week = gridWeekStart(row.date);
    return (
      <Fragment key={`assessment-${week}`}>
        {dayRow}
        <tr className="allClassesGridAssessmentRow">
          <th scope="row">Assessment</th>
          {columns.map((course) => {
            const byWeek = coverageByCourse.get(course.id);
            if (!byWeek) {
              return (
                <td key={course.id} className="allClassesGridMuted">
                  ·
                </td>
              );
            }
            const entries = byWeek.get(week) || [];
            return (
              <td key={course.id}>
                {entries.length ? (
                  entries.map((entry) => (
                    <span key={`${entry.rule_id}-${entry.date}`} className="allClassesGridAssessment">
                      <strong>
                        {entry.label} · {skipDay(entry.date)}
                      </strong>
                      <span>{entry.codes.length ? `Covers ${entry.codes.join(", ")}` : "No new lessons"}</span>
                    </span>
                  ))
                ) : (
                  <span className="allClassesGridMuted">No assessment this week</span>
                )}
              </td>
            );
          })}
        </tr>
      </Fragment>
    );
  };

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
            <p>Mark lessons complete, add files or vocabulary, and check announcements without leaving the grid.</p>
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

        {(resourceData.vocabularyAvailable && columns.length > 0) || resourceData.available || (skipped.available && columns.length > 0) ? (
          <details className="allClassesGridOptions">
            <summary>Options</summary>
            <div className="allClassesGridOptionsBody">
              {resourceData.vocabularyAvailable && columns.length > 0 ? (
                <>
                  <ManageClassVocabulary
                    ownerId={userId}
                    courses={columns.map((course) => ({ id: course.id, title: course.title }))}
                  />
                  <VocabularyCsvImport courses={columns.map((course) => ({ id: course.id, title: course.title }))} />
                </>
              ) : null}

              {resourceData.available && bulkResourceCourses.length > 0 ? (
                <BulkGridResources
                  ownerId={userId}
                  courses={bulkResourceCourses}
                  siteNames={resourceData.siteNames}
                />
              ) : null}

              {resourceData.available ? <ManageGridResources /> : null}

              {skipped.available && columns.length > 0 ? <SkippedLessonsPanel classes={skippedClasses} /> : null}
            </div>
          </details>
        ) : null}

        {columns.length > 0 ? <LessonSwapBar key={planMessageKey} message={planMessage} /> : null}

        {columns.length === 0 ? (
          <p>None of your classes have scheduled lessons yet.</p>
        ) : (
          <div className="allClassesGridScroll">
            <table className="allClassesGrid" style={{ minWidth: `${7 + columns.length * 15}rem` }}>
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
                {grid.rows.map((row, rowIndex) => withWeekAssessment(row, rowIndex, (() => {
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
                      {row.scheduleType && !row.schoolClosed ? (
                        <GridDaySchedule classDate={row.date} scheduleType={row.scheduleType} returnTo={returnTo} />
                      ) : null}
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

                  // Lesson cells span two table rows: lesson info on top, actions
                  // below. The table sizes the top row to its tallest cell, so the
                  // 2x2 action blocks line up across the day however titles wrap.
                  const cells = row.cells.map((cell, index) => {
                    const course = columns[index];
                    if (cell.kind === "no-meeting") {
                      return {
                        course,
                        whole: (
                          <td key={course.id} className="allClassesGridMuted" aria-label="Class does not meet">
                            ·
                            <DueList due={cell.due} />
                          </td>
                        ),
                      };
                    }
                    if (cell.kind === "off") {
                      return {
                        course,
                        whole: (
                          <td key={course.id} className="allClassesGridMuted">
                            No School
                            <DueList due={cell.due} />
                          </td>
                        ),
                      };
                    }
                    if (cell.kind === "empty" && cell.fixed) {
                      // Syllabus class with nothing released today: say so, and
                      // never offer to add a lesson (that would re-pace the syllabus).
                      return {
                        course,
                        whole: (
                          <td key={course.id}>
                            <span className="allClassesGridEmptyLabel">No new release</span>
                            <DueList due={cell.due} />
                          </td>
                        ),
                      };
                    }
                    if (cell.kind === "empty") {
                      return {
                        course,
                        whole: (
                          <td key={course.id} className={cell.grace ? "allClassesGridMuted" : undefined}>
                            <span className={cell.grace ? undefined : "allClassesGridEmptyLabel"}>
                              {cell.grace ? "Grace Day" : "No lesson"}
                            </span>
                            <DueList due={cell.due} />
                            {!cell.grace ? (
                              <LessonCountToggle
                            inPlace
                                courseId={course.id}
                                classDate={row.date}
                                currentCount={cell.lessonCountOverride ?? 0}
                                returnTo={returnTo}
                              />
                            ) : null}
                          </td>
                        ),
                      };
                    }

                    const labels = cell.lessons.map((lesson) => formatLessonLabel(lesson.code, lesson.title));
                    const cellLessons = cell.lessons.map((lesson, lessonIndex) => ({
                      id: lesson.id,
                      label: labels[lessonIndex],
                    }));
                    const completeClass = cell.complete ? " isComplete" : "";
                    return {
                      course,
                      head: (
                        <td key={course.id} className={`allClassesGridCellHead${completeClass}`}>
                          {cell.dayType === "half" && !cell.fixed ? <span className="allClassesGridTag">Half Day</span> : null}
                          {cell.dayType === "modified" && !cell.fixed ? <span className="allClassesGridTag">Activity Day</span> : null}
                          {cell.fixed ? (
                            <span className="allClassesGridTag">Released</span>
                          ) : (
                            <LessonCountToggle
                              inPlace
                              courseId={course.id}
                              classDate={row.date}
                              currentCount={cell.lessonCountOverride ?? cell.lessons.length}
                              returnTo={returnTo}
                              disabled={cell.hasCompleted}
                              skipLessons={skipped.available ? cellLessons : null}
                            />
                          )}
                          {cell.lessons.map((lesson, lessonIndex) => (
                            <span key={lesson.id} className="allClassesGridLesson">
                              {labels[lessonIndex]}
                              {lesson.custom ? <span className="customLessonBadge">Custom</span> : null}
                              {!cell.fixed && lesson.status !== "completed" ? (
                                <label className="lessonSwapPick allClassesGridSwapPick" title="Check two lessons in this class to switch them">
                                  <input
                                    type="checkbox"
                                    name="swap_lesson"
                                    form="lesson-swap-form"
                                    value={`${row.date}|${lesson.slot}`}
                                    data-course={course.id}
                                    data-return={returnTo}
                                    aria-label={`Switch ${labels[lessonIndex]} (${course.title})`}
                                  />
                                  <span>Switch</span>
                                </label>
                              ) : null}
                            </span>
                          ))}
                          <DueList due={cell.due} />
                        </td>
                      ),
                      actions: (
                        <td key={course.id} className={`allClassesGridCellFoot${completeClass}`}>
                          <div className="allClassesGridCellActions">
                            <GridCompletionButton courseId={course.id} classDate={row.date}
                              complete={cell.complete} returnTo={returnTo} />
                            {resourceData.available ? (
                              <GridCellResources
                                ownerId={userId}
                                courseId={course.id}
                                classDate={row.date}
                                lessons={cellLessons}
                                resources={resourcesFor(cell.lessons.map((lesson) => lesson.id))}
                                siteNames={resourceData.siteNames}
                              />
                            ) : null}
                            {resourceData.vocabularyAvailable ? (
                              <GridCellVocabulary
                                ownerId={userId}
                                courseId={course.id}
                                classDate={row.date}
                                lessons={cellLessons}
                                vocabulary={vocabularyFor(cell.lessons.map((lesson) => lesson.id))}
                              />
                            ) : null}
                            <GridCellAnnouncements
                              lessons={cellLessons}
                              announcement={announcementByCell.get(`${course.id}|${row.date}`) || null}
                            />
                            {!cell.fixed && cell.lessons.some((lesson) => lesson.status !== "completed") ? (
                              <GridCellCustomLessons
                                courseId={course.id}
                                classDate={row.date}
                                returnTo={returnTo}
                                customLessons={cell.lessons
                                  .map((lesson, lessonIndex) => ({ ...lesson, label: labels[lessonIndex] }))
                                  .filter((lesson) => lesson.custom)
                                  .map((lesson) => ({ id: lesson.id, label: lesson.label, planned: lesson.status !== "completed" }))}
                              />
                            ) : null}
                          </div>
                        </td>
                      ),
                    };
                  });

                  const lessonCells = cells.filter((cell) => !cell.whole);
                  if (lessonCells.length === 0) {
                    return (
                      <tr key={row.date} id={rowId} className={rowClass}>
                        {dayHeader}
                        {cells.map((cell) => cell.whole)}
                      </tr>
                    );
                  }
                  return (
                    <Fragment key={row.date}>
                      <tr id={rowId} className={rowClass}>
                        {cloneElement(dayHeader, { rowSpan: 2 })}
                        {cells.map((cell) => (cell.whole ? cloneElement(cell.whole, { rowSpan: 2 }) : cell.head))}
                      </tr>
                      <tr className="allClassesGridActionsRow">{lessonCells.map((cell) => cell.actions)}</tr>
                    </Fragment>
                  );
                })()))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
