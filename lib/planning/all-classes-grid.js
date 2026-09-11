import { courseShowsCalendarDay } from "./meeting-days.js";

export const GRID_WEEKS = 2;

function parseIso(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
// whole-school closure and renders as a single "No School" row.
export function buildAllClassesGrid({ courses, dates, calendarDays, planRows }) {
  const calendarByKey = new Map(calendarDays.map((day) => [`${day.course_id}|${day.class_date}`, day]));
  const lessonRowsByKey = new Map();
  for (const row of planRows) {
    const key = `${row.course_id}|${row.class_date}`;
    const list = lessonRowsByKey.get(key) || [];
    list.push(row);
    lessonRowsByKey.set(key, list);
  }

  const rows = dates.map((date) => {
    const cells = courses.map((course) => {
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
        return { kind: "empty", grace: Boolean(day.is_grace_day || day.day_type === "grace_day") };
      }
      return {
        kind: "lessons",
        dayType: day.day_type,
        lessons,
        complete: lessons.every((lesson) => lesson.status === "completed"),
      };
    });
    return { date, cells, schoolClosed: cells.length > 0 && cells.every((cell) => cell.kind === "off") };
  });

  return { rows };
}
