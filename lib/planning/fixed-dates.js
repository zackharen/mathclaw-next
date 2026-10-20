// Fixed-date courses (e.g. ECC half-year syllabi) release each lesson on an
// explicit date. Their course_lesson_plan rows are the schedule: calendar edits,
// A/B changes, and pacing rebuilds never move them. Dated assignments live in
// teacher_announcement_assignments. All dates are local calendar dates and all
// times are local wall-clock times in the course timezone, so nothing here
// converts through UTC and daylight saving time cannot shift a date.

export const FIXED_DATES_PACING_MODE = "fixed_dates";

export function isFixedDatesCourse(course) {
  return course?.pacing_mode === FIXED_DATES_PACING_MODE;
}

export const ASSIGNMENT_CATEGORIES = [
  { value: "assessments", label: "Assessments" },
  { value: "participation", label: "Participation" },
  { value: "performance_tasks", label: "Performance Tasks" },
  { value: "portfolio", label: "Portfolio" },
];

export function assignmentCategoryLabel(value) {
  return ASSIGNMENT_CATEGORIES.find((category) => category.value === value)?.label || "";
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  const match = ISO_DATE.exec(String(value || ""));
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// "HH:MM" or "HH:MM:SS" (Postgres time) → "HH:MM", else "".
export function normalizeClockTime(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// "23:59" → "11:59 PM". Pure string math: a wall-clock time stays the same on
// either side of a daylight saving change.
export function formatClockTime(value) {
  const time = normalizeClockTime(value);
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// A Google Docs date chip stores midnight-or-noon UTC for the calendar day it
// shows. Reading it in UTC gives that day; reading it in Eastern time would
// turn a midnight chip into the previous evening.
export function calendarDateFromChipTimestamp(ms) {
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// Dated rows in the shape the announcement assignment helpers use. Each row
// keeps its own identity, so several assignments released the same day (or
// sharing a label pattern) stay separate.
export function datedAssignmentsForAnnouncements(rows) {
  return (rows || [])
    .filter((row) => row?.id && isIsoDate(row.assignment_date) && String(row.label || "").trim())
    .map((row) => ({
      rule_id: `dated:${row.id}`,
      dated_id: row.id,
      assignment_date: row.assignment_date,
      original_date: row.assignment_date,
      label: String(row.label).trim(),
      base_label: String(row.label).trim(),
      due_date: isIsoDate(row.due_date) ? row.due_date : null,
      due_time: normalizeClockTime(row.due_time) || null,
      release_time: normalizeClockTime(row.release_time) || null,
      url: row.url || null,
      category: row.category || null,
      is_draft: Boolean(row.is_draft),
      sort_order: Number(row.sort_order) || 0,
    }));
}

export function addAssignmentsByDate(assignmentsByDate, assignments) {
  for (const assignment of assignments || []) {
    const list = assignmentsByDate.get(assignment.assignment_date) || [];
    list.push(assignment);
    assignmentsByDate.set(assignment.assignment_date, list);
  }
  return assignmentsByDate;
}

function bySortThenLabel(a, b) {
  return (a.sort_order || 0) - (b.sort_order || 0) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
}

function dueText(assignment) {
  if (!assignment.due_date) return "No due date set";
  const [year, month, day] = assignment.due_date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const time = formatClockTime(assignment.due_time);
  return `Due ${weekday} ${month}/${day}${time ? ` ${time}` : ""}`;
}

function assignmentLine(assignment, { withDue = true } = {}) {
  const parts = [assignment.label];
  if (withDue) parts.push(dueText(assignment));
  if (assignment.url) parts.push(assignment.url);
  return parts.join(" | ");
}

// Dates a fixed-date course has something to announce: a release or a due date.
export function fixedDatesAnnouncementDates({ releaseDates, assignments }) {
  const dates = new Set(releaseDates || []);
  for (const assignment of assignments || []) {
    dates.add(assignment.assignment_date);
    if (assignment.due_date) dates.add(assignment.due_date);
  }
  return [...dates].filter(isIsoDate).sort();
}

// The announcement for one day of an asynchronous fixed-date course. It never
// mentions A/B days or a bell schedule, and office hours are not releases.
export function buildFixedDatesAnnouncement({
  classDate,
  courseTitle,
  dateLabel,
  dayNumber = "",
  releasedLessons = [],
  assignments = [],
}) {
  const releasedToday = assignments.filter((a) => a.assignment_date === classDate).sort(bySortThenLabel);
  const dueToday = assignments
    .filter((a) => a.due_date === classDate && a.assignment_date !== classDate)
    .sort(bySortThenLabel);
  const stillOpen = assignments
    .filter((a) => a.assignment_date < classDate && a.due_date && a.due_date > classDate)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || bySortThenLabel(a, b));
  const releaseTime = formatClockTime(releasedToday.find((a) => a.release_time)?.release_time);

  const lines = [`${courseTitle} | ${dateLabel}${dayNumber ? ` | School Day #${dayNumber}` : ""}`];

  if (releasedLessons.length) {
    lines.push("", releaseTime ? `Posted today at ${releaseTime}:` : "Posted today:");
    lines.push(...releasedLessons);
  } else {
    lines.push("", "No new lessons posted today.");
  }

  if (releasedToday.length) {
    lines.push("", "New assignments:");
    lines.push(...releasedToday.map((a) => assignmentLine(a)));
  }

  if (dueToday.length) {
    const time = formatClockTime(dueToday[0].due_time);
    const sameTime = dueToday.every((a) => normalizeClockTime(a.due_time) === normalizeClockTime(dueToday[0].due_time));
    lines.push("", sameTime && time ? `Due today by ${time}:` : "Due today:");
    lines.push(...dueToday.map((a) => assignmentLine(a, { withDue: !(sameTime && time) })));
  }

  if (stillOpen.length) {
    lines.push("", "Still open:");
    lines.push(...stillOpen.map((a) => assignmentLine(a)));
  }

  return lines.join("\n").trim();
}
