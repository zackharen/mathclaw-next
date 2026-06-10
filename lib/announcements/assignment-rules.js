function parseDateAtUTC(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function monthKey(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function weekdayIndex(isoDate) {
  return parseDateAtUTC(isoDate).getUTCDay();
}

function weeksBetween(startIso, endIso) {
  const start = parseDateAtUTC(startIso);
  const end = parseDateAtUTC(endIso);
  return Math.floor((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function buildSchoolDayNumberByDate(calendarDays) {
  const map = new Map();
  let dayNumber = 0;

  for (const day of calendarDays || []) {
    if (day.day_type === "off") continue;
    dayNumber += 1;
    map.set(day.class_date, String(dayNumber));
  }

  return map;
}

// School-wide day numbers: walk every weekday in the school year and skip only
// days marked off in school_calendar_days, so the count matches the Profile and
// Class Plan pages instead of any one course's calendar.
export function buildSchoolWideDayNumberByDate({ schoolYearStart, schoolYearEnd, schoolDays }) {
  const map = new Map();
  if (!schoolYearStart || !schoolYearEnd) return map;

  const schoolDayByDate = new Map((schoolDays || []).map((day) => [day.class_date, day]));
  const cursor = parseDateAtUTC(schoolYearStart);
  const end = parseDateAtUTC(schoolYearEnd);
  let dayNumber = 0;

  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const iso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
      if (schoolDayByDate.get(iso)?.day_type !== "off") {
        dayNumber += 1;
        map.set(iso, String(dayNumber));
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return map;
}

export function isCourseMeetingDay(course, day) {
  if (!day || day.day_type === "off") return false;
  if (course?.schedule_model !== "ab") return true;
  if (course.ab_meeting_day === "A") return day.ab_day === "A";
  if (course.ab_meeting_day === "B") return day.ab_day === "B";
  return day.ab_day === "A" || day.ab_day === "B";
}

function normalizeNumberArray(value, fallback = []) {
  return Array.isArray(value)
    ? value.map((item) => Number.parseInt(String(item), 10)).filter(Number.isInteger)
    : fallback;
}

function pickEvenly(items, count) {
  if (items.length <= count) return items;
  if (count <= 1) return [items[Math.floor((items.length - 1) / 2)]];
  const picked = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    if (!seen.has(index)) {
      picked.push(items[index]);
      seen.add(index);
    }
  }
  return picked;
}

function findMonthlyMeetingDay({ meetingDaysByDate, meetingDates, year, month, dayOfMonth, shift }) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const targetDate = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
  if (meetingDaysByDate.has(targetDate)) return targetDate;

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthMeetingDates = meetingDates.filter((date) => date.startsWith(monthPrefix));
  if (shift === "before") {
    return [...monthMeetingDates].reverse().find((date) => date < targetDate) || "";
  }
  return monthMeetingDates.find((date) => date > targetDate) || "";
}

function overrideKey(ruleId, courseId, originalDate) {
  return `${ruleId || ""}|${courseId || ""}|${originalDate || ""}`;
}

function buildOverrideMap(overrides) {
  const map = new Map();
  for (const override of overrides || []) {
    map.set(overrideKey(override.rule_id, override.course_id, override.original_date), override);
  }
  return map;
}

function periodForDate(date, markingPeriodRules, schoolDayNumberByDate) {
  const dayNumber = Number(schoolDayNumberByDate?.get(date));
  if (!dayNumber) return null;
  return (markingPeriodRules || []).find(
    (period) => dayNumber >= period.start_day_number && dayNumber <= period.end_day_number
  ) || null;
}

export function buildRuleAssignmentOccurrences({
  rules,
  course,
  calendarDays,
  markingPeriodRules,
  schoolDayNumberByDate,
  overrides,
  includeSkipped = false,
}) {
  const allSchoolDays = (calendarDays || []).filter((day) => day.day_type !== "off");
  const allSchoolDates = allSchoolDays.map((day) => day.class_date);
  const allSchoolDaysByDate = new Map(allSchoolDays.map((day) => [day.class_date, day]));
  const meetingDays = (calendarDays || []).filter((day) => isCourseMeetingDay(course, day));
  const meetingDates = meetingDays.map((day) => day.class_date);
  const meetingDaysByDate = new Map(meetingDays.map((day) => [day.class_date, day]));
  const overrideMap = buildOverrideMap(overrides);
  const occurrences = [];
  const seen = new Set();
  const firstDate = calendarDays?.[0]?.class_date || course?.school_year_start || "";

  function shiftToMeetingDay(date, shift) {
    if (shift === "same_day") return allSchoolDaysByDate.has(date) ? date : null;
    if (!shift || shift === "skip") return meetingDaysByDate.has(date) ? date : null;
    if (meetingDaysByDate.has(date)) return date;
    if (shift === "before") {
      for (let i = allSchoolDates.indexOf(date) - 1; i >= 0; i--) {
        if (meetingDaysByDate.has(allSchoolDates[i])) return allSchoolDates[i];
      }
      return null;
    }
    // after
    const idx = allSchoolDates.indexOf(date);
    for (let i = idx + 1; i < allSchoolDates.length; i++) {
      if (meetingDaysByDate.has(allSchoolDates[i])) return allSchoolDates[i];
    }
    return null;
  }

  function schoolDayAfter(date, count) {
    const index = allSchoolDates.indexOf(date);
    if (index === -1) return null;
    const target = index + count;
    return target < allSchoolDates.length ? allSchoolDates[target] : null;
  }

  function addOccurrence(originalDate, rule) {
    const allowsAnySchoolDay = (rule.settings?.no_meeting_shift || "before") === "same_day";
    const dayLookup = allowsAnySchoolDay ? allSchoolDaysByDate : meetingDaysByDate;
    if (!originalDate || !dayLookup.has(originalDate)) return;
    const ruleStartDate = typeof rule.settings?.start_date === "string" ? rule.settings.start_date : "";
    if (ruleStartDate && originalDate < ruleStartDate) return;
    const occurrenceKey = overrideKey(rule.id || rule.label, course.id, originalDate);
    if (seen.has(occurrenceKey)) return;
    seen.add(occurrenceKey);

    const override = overrideMap.get(overrideKey(rule.id, course.id, originalDate));
    if (override?.is_skipped && !includeSkipped) return;
    const period = periodForDate(originalDate, markingPeriodRules, schoolDayNumberByDate);
    const assignmentDate = override?.assignment_date || originalDate;
    const dueSchoolDays = Number.parseInt(String(rule.settings?.due_school_days || ""), 10);
    occurrences.push({
      rule_id: rule.id,
      course_id: course.id,
      original_date: originalDate,
      assignment_date: assignmentDate,
      due_date:
        Number.isInteger(dueSchoolDays) && dueSchoolDays > 0
          ? schoolDayAfter(assignmentDate, dueSchoolDays)
          : null,
      label: rule.label,
      marking_period: period?.name || "",
      is_override: Boolean(override),
      is_skipped: Boolean(override?.is_skipped),
    });
  }

  for (const rule of rules || []) {
    if (rule.course_id && rule.course_id !== course.id) continue;
    const settings = rule.settings || {};
    const count = Math.max(1, Math.min(20, Number.parseInt(String(rule.count_per_period || 1), 10)));
    const noMeetingShift = settings.no_meeting_shift || "before";
    const ruleStartDate = typeof settings.start_date === "string" ? settings.start_date : "";

    if (rule.cadence === "weekly" || rule.cadence === "biweekly") {
      const weekdays = normalizeNumberArray(settings.weekdays, [5]);
      const weekInterval = rule.cadence === "biweekly"
        ? 2
        : Math.max(1, Number.parseInt(String(settings.week_interval || 1), 10));
      const anchorDate = ruleStartDate || firstDate;
      for (const day of allSchoolDays) {
        if (ruleStartDate && day.class_date < ruleStartDate) continue;
        if (!weekdays.includes(weekdayIndex(day.class_date))) continue;
        if (anchorDate && weeksBetween(anchorDate, day.class_date) % weekInterval !== 0) continue;
        const resolvedDate = shiftToMeetingDay(day.class_date, noMeetingShift);
        if (resolvedDate) addOccurrence(resolvedDate, rule);
      }
    }

    if (rule.cadence === "monthly") {
      const monthDays = normalizeNumberArray(settings.month_days, [1]).slice(0, 1);
      const shift = settings.monthly_shift === "before" ? "before" : "after";
      const months = [...new Set(meetingDates.map(monthKey))];
      for (const key of months) {
        const [year, month] = key.split("-").map(Number);
        for (const dayOfMonth of monthDays) {
          const date = findMonthlyMeetingDay({
            meetingDaysByDate,
            meetingDates,
            year,
            month,
            dayOfMonth,
            shift,
          });
          addOccurrence(date, rule);
        }
      }
    }

    if (rule.cadence === "marking_period") {
      const weekdays = normalizeNumberArray(settings.weekdays, []);
      for (const period of markingPeriodRules || []) {
        // Candidate dates: all school days in the period matching weekday filter, then shift to meeting day.
        // Filter by start date here so the per-period count redistributes across the remaining days.
        const candidateDates = allSchoolDates.filter((date) => {
          if (ruleStartDate && date < ruleStartDate) return false;
          const dayNumber = Number(schoolDayNumberByDate.get(date));
          if (!dayNumber || dayNumber < period.start_day_number || dayNumber > period.end_day_number) {
            return false;
          }
          return weekdays.length === 0 || weekdays.includes(weekdayIndex(date));
        });
        const resolvedDates = [...new Set(
          candidateDates
            .map((date) => shiftToMeetingDay(date, noMeetingShift))
            .filter(Boolean)
        )];
        for (const date of pickEvenly(resolvedDates, count)) {
          addOccurrence(date, rule);
        }
      }
    }
  }

  return occurrences.sort((a, b) => {
    if (a.assignment_date !== b.assignment_date) return a.assignment_date.localeCompare(b.assignment_date);
    if (a.original_date !== b.original_date) return a.original_date.localeCompare(b.original_date);
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

export function buildRuleAssignmentsByDate(options) {
  const assignmentsByDate = new Map();
  for (const occurrence of buildRuleAssignmentOccurrences(options)) {
    const arr = assignmentsByDate.get(occurrence.assignment_date) || [];
    if (!arr.some((assignment) => assignment.label === occurrence.label)) {
      arr.push({
        assignment_date: occurrence.assignment_date,
        original_date: occurrence.original_date,
        label: occurrence.label,
        due_date: occurrence.due_date || null,
      });
      assignmentsByDate.set(occurrence.assignment_date, arr);
    }
  }
  return assignmentsByDate;
}
