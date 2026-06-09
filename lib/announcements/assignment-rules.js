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
}) {
  const meetingDays = (calendarDays || []).filter((day) => isCourseMeetingDay(course, day));
  const meetingDates = meetingDays.map((day) => day.class_date);
  const meetingDaysByDate = new Map(meetingDays.map((day) => [day.class_date, day]));
  const overrideMap = buildOverrideMap(overrides);
  const occurrences = [];
  const seen = new Set();
  const firstDate = calendarDays?.[0]?.class_date || course?.school_year_start || "";

  function addOccurrence(originalDate, rule) {
    if (!originalDate || !meetingDaysByDate.has(originalDate)) return;
    const occurrenceKey = overrideKey(rule.id || rule.label, course.id, originalDate);
    if (seen.has(occurrenceKey)) return;
    seen.add(occurrenceKey);

    const override = overrideMap.get(overrideKey(rule.id, course.id, originalDate));
    const period = periodForDate(originalDate, markingPeriodRules, schoolDayNumberByDate);
    occurrences.push({
      rule_id: rule.id,
      course_id: course.id,
      original_date: originalDate,
      assignment_date: override?.assignment_date || originalDate,
      label: rule.label,
      marking_period: period?.name || "",
      is_override: Boolean(override),
    });
  }

  for (const rule of rules || []) {
    if (rule.course_id && rule.course_id !== course.id) continue;
    const settings = rule.settings || {};
    const count = Math.max(1, Math.min(20, Number.parseInt(String(rule.count_per_period || 1), 10)));

    if (rule.cadence === "weekly" || rule.cadence === "biweekly") {
      const weekdays = normalizeNumberArray(settings.weekdays, [5]);
      const weekInterval = rule.cadence === "biweekly"
        ? 2
        : Math.max(1, Number.parseInt(String(settings.week_interval || 1), 10));
      for (const day of meetingDays) {
        if (!weekdays.includes(weekdayIndex(day.class_date))) continue;
        if (firstDate && weeksBetween(firstDate, day.class_date) % weekInterval !== 0) continue;
        addOccurrence(day.class_date, rule);
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
        const periodDates = meetingDates.filter((date) => {
          const dayNumber = Number(schoolDayNumberByDate.get(date));
          if (!dayNumber || dayNumber < period.start_day_number || dayNumber > period.end_day_number) {
            return false;
          }
          return weekdays.length === 0 || weekdays.includes(weekdayIndex(date));
        });
        for (const date of pickEvenly(periodDates, count)) {
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
        due_date: null,
      });
      assignmentsByDate.set(occurrence.assignment_date, arr);
    }
  }
  return assignmentsByDate;
}
