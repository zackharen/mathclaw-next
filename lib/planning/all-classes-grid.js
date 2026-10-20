import { courseShowsCalendarDay } from "./meeting-days.js";
import { isFixedDatesCourse } from "./fixed-dates.js";

export const GRID_WEEKS = 2;

function parseIso(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function weekendLabel(iso) {
  const [, month, day] = String(iso).split("-").map(Number);
  return `${parseIso(iso).getUTCDay() === 6 ? "Sat" : "Sun"} ${month}/${day}`;
}

export function addDaysIso(iso, days) {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Monday of the week containing isoDate; a weekend rolls back to that week's Monday.
export function gridWeekStart(isoDate) {
  const weekday = parseIso(isoDate).getUTCDay();
  return addDaysIso(isoDate, weekday === 0 ? -6 : 1 - weekday);
}

export function gridSchoolDates(weekStartIso, weeks = GRID_WEEKS) {
  const dates = [];
  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < 5; day += 1) dates.push(addDaysIso(weekStartIso, week * 7 + day));
  }
  return dates;
}

// One row per school date, one cell per class, in the order the classes are
// given. A cell is "no-meeting" when an A/B class is off its letter day (or the
// date is outside its calendar), "off" on a day off, "empty" when the class meets
// with no lesson, and otherwise "lessons". A row where every class is off is a
// whole-school closure and renders as a single "No School" row, unless some
// class still has work due that day.
//
// Fixed-date (syllabus) classes are marked `fixed`: an empty day there means no
// new release rather than a free lesson slot.
//
// Any class's cell lists the assignments due that day (`due`), so a deadline
// shows even without a lesson. The grid has no weekend rows, so work due on a
// Saturday or Sunday is listed on the Friday before with its real day.
export function buildAllClassesGrid({ courses, dates, calendarDays, planRows, dueAssignments = [] }) {
  const calendarByKey = new Map(calendarDays.map((day) => [`${day.course_id}|${day.class_date}`, day]));
  const lessonRowsByKey = new Map();
  for (const row of planRows) {
    const key = `${row.course_id}|${row.class_date}`;
    const list = lessonRowsByKey.get(key) || [];
    list.push(row);
    lessonRowsByKey.set(key, list);
  }

  const dueByKey = new Map();
  for (const assignment of dueAssignments) {
    if (!assignment?.due_date) continue;
    const weekday = parseIso(assignment.due_date).getUTCDay();
    const shownOn = weekday === 6 ? addDaysIso(assignment.due_date, -1) : weekday === 0 ? addDaysIso(assignment.due_date, -2) : assignment.due_date;
    const entry = shownOn === assignment.due_date ? assignment : { ...assignment, due_day: weekendLabel(assignment.due_date) };
    const key = `${assignment.course_id}|${shownOn}`;
    dueByKey.set(key, [...(dueByKey.get(key) || []), entry]);
  }

  const rows = dates.map((date) => {
    const cells = courses.map((course) => {
      const fixed = isFixedDatesCourse(course);
      const due = (dueByKey.get(`${course.id}|${date}`) || [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
        .map((assignment) => ({
          id: assignment.id,
          label: assignment.label,
          due_time: assignment.due_time || null,
          ...(assignment.due_day ? { due_day: assignment.due_day } : {}),
        }));
      const cell = buildCell(course, date, fixed);
      // Regular-class cells keep their original shape.
      return { ...cell, ...(fixed ? { fixed } : {}), ...(due.length ? { due } : {}) };
    });
    return {
      date,
      cells,
      schoolClosed: cells.length > 0 && cells.every((cell) => cell.kind === "off" && !cell.due),
    };
  });

  function buildCell(course, date, fixed) {
    const day = calendarByKey.get(`${course.id}|${date}`);
    if (!day || !courseShowsCalendarDay(course, day)) return { kind: "no-meeting" };
    if (day.day_type === "off") return { kind: "off" };
    const lessons = (lessonRowsByKey.get(`${course.id}|${date}`) || [])
      .filter((row) => row.curriculum_lessons?.id)
      .map((row) => ({
        id: row.curriculum_lessons.id,
        code: row.curriculum_lessons.source_lesson_code,
        title: row.curriculum_lessons.title,
        status: row.status,
      }));
    // Same test as isGraceDay in lib/school-calendar.js.
    if (lessons.length === 0) {
      return {
        kind: "empty",
        grace: !fixed && Boolean(day.is_grace_day || day.day_type === "grace_day"),
        dayType: day.day_type,
        lessonCountOverride: day.lesson_count_override,
      };
    }
    return {
      kind: "lessons",
      dayType: day.day_type,
      lessons,
      complete: lessons.every((lesson) => lesson.status === "completed"),
      hasCompleted: lessons.some((lesson) => lesson.status === "completed"),
      lessonCountOverride: day.lesson_count_override,
    };
  }

  return { rows };
}
