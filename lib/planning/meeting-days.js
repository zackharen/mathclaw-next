function isWeekendIso(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

// Whether a class's plan shows this calendar day. Every-day classes show every
// weekday; A/B classes show only their own letter day, plus weekday days off so
// "No School" still appears. Shared by the single-class plan and the all-classes
// grid so the two views can never disagree about which class meets when.
export function courseShowsCalendarDay(course, day) {
  if (course.schedule_model !== "ab") return !isWeekendIso(day.class_date);
  if (day.day_type === "off") return !isWeekendIso(day.class_date);
  if (day.ab_day !== "A" && day.ab_day !== "B") return false;
  if (course.ab_meeting_day === "A") return day.ab_day === "A";
  if (course.ab_meeting_day === "B") return day.ab_day === "B";
  return true;
}
