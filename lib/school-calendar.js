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
