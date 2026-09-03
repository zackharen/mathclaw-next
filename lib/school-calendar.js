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

export function formatCalendarScheduleType(day) {
  const dayType = normalizeCalendarDayType(day?.day_type || "instructional");
  let label = "Full Day Schedule";
  if (dayType === "half") label = "Half Day Schedule";
  if (dayType === "modified") label = "Modified Day Schedule";
  if (dayType === "off") label = "No School";
  return isGraceDay(day) && dayType !== "off" ? `${label} · Grace Day` : label;
}
