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
import VocabularyCsvImport from "./vocabulary-csv-import";
import ManageClassVocabulary from "./manage-class-vocabulary";
import ManageGridResources from "./manage-grid-resources";
import LessonCountToggle from "./lesson-count-toggle";

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

  const [lessonCounts, calendarDays, planRows, announcementRows] = courseIds.length
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
          .select("course_id, class_date, lesson_slot, status, curriculum_lessons(id, source_lesson_code, title)")
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
      ])
    : [[], [], [], []];

  const lessonCountByCourse = new Map(lessonCounts);
  const columns = courses
    .filter((course) => lessonCountByCourse.get(course.id) > 0)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const grid = buildAllClassesGrid({ courses: columns, dates, calendarDays, planRows });

  const lessonIds = [...new Set(planRows.map((row) => row.curriculum_lessons?.id).filter(Boolean))];
  const resourceData = await loadLessonResourcePlanningData({ userId, lessonIds });
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

        {(resourceData.vocabularyAvailable && columns.length > 0) || resourceData.available ? (
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
            </div>
          </details>
        ) : null}

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
                          {cell.dayType === "half" ? <span className="allClassesGridTag">Half Day</span> : null}
                          <LessonCountToggle
                            inPlace
                            courseId={course.id}
                            classDate={row.date}
                            currentCount={cell.lessonCountOverride ?? cell.lessons.length}
                            returnTo={returnTo}
                            disabled={cell.hasCompleted}
                          />
                          {cell.lessons.map((lesson, lessonIndex) => (
                            <span key={lesson.id} className="allClassesGridLesson">
                              {labels[lessonIndex]}
                            </span>
                          ))}
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
