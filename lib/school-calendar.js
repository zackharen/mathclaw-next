export function buildABMap(dates, abPatternStartIso, schoolDayByDate) {
  const map = new Map();
  if (!abPatternStartIso) {
    dates.forEach((date) => map.set(date, "-"));
    return map;
  }

  let current = "A";

  for (const date of dates) {
    if (date < abPatternStartIso || schoolDayByDate.get(date)?.day_type === "off") {
      map.set(date, "-");
      continue;
    }

    map.set(date, current);
    current = current === "A" ? "B" : "A";
  }

  return map;
}

export function normalizeCalendarDayType(dayType) {
  return dayType === "grace_day" ? "instructional" : dayType;
}

export function isGraceDay(day) {
  return Boolean(day?.is_grace_day || day?.day_type === "grace_day");
}

export function isCalendarWeekStart(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCDay() === 1
  );
}

function calendarWeekStartDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return "";
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function buildMarkingPeriodWeekLabels({
  dates,
  schoolDayByDate,
  markingPeriods,
  schoolDayNumberByDate,
}) {
  const weeks = new Map();

  for (const date of dates || []) {
    const weekStart = calendarWeekStartDate(date);
    if (!weekStart) continue;
    const weekDates = weeks.get(weekStart) || [];
    weekDates.push(date);
    weeks.set(weekStart, weekDates);
  }

  const labels = new Map();
  const periodWeekCounts = new Map();

  for (const weekDates of weeks.values()) {
    const periodDays = new Map();

    for (const date of weekDates) {
      if (schoolDayByDate.get(date)?.day_type === "off") continue;
      const dayNumber = schoolDayNumberByDate.get(date);
      const period = (markingPeriods || []).find(
        (candidate) =>
          dayNumber >= candidate.start_day_number &&
          dayNumber <= candidate.end_day_number
      );
      if (!period) continue;

      const periodKey = period.id || `${period.start_day_number}-${period.end_day_number}`;
      const entry = periodDays.get(periodKey) || { count: 0, period };
      entry.count += 1;
      periodDays.set(periodKey, entry);
    }

    const fullPeriodWeek = Array.from(periodDays.entries()).find(
      ([, entry]) => entry.count >= 4
    );
    if (!fullPeriodWeek) continue;

    const [periodKey, entry] = fullPeriodWeek;
    const weekNumber = (periodWeekCounts.get(periodKey) || 0) + 1;
    periodWeekCounts.set(periodKey, weekNumber);
    labels.set(weekDates[0], {
      label: `Week ${weekNumber}`,
      markingPeriod: entry.period.name,
    });
  }

  return labels;
}

export function formatCalendarScheduleType(day) {
  const dayType = normalizeCalendarDayType(day?.day_type || "instructional");
  let label = "Full Day Schedule";
  if (dayType === "half") label = "Half Day Schedule";
  if (dayType === "modified") label = "Modified Day Schedule";
  if (dayType === "off") label = "No School";
  return isGraceDay(day) && dayType !== "off" ? `${label} · Grace Day` : label;
}
