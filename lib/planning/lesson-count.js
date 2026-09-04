function modifierForWeekday(modifiers, classDate) {
  const weekday = new Date(`${classDate}T00:00:00Z`).getUTCDay();
  return modifiers?.[weekday] || null;
}

export function lessonsForPlanningDay({
  day,
  pacingMode,
  weekdayModifiers,
  oneLessonAssignmentDates,
}) {
  if (pacingMode === "manual_complete") {
    return day.day_type === "instructional" ? 1 : 0;
  }

  let lessonCount = 0;
  if (pacingMode === "two_lessons_per_day") {
    lessonCount = day.day_type === "half" ? 1 : 2;
  } else if (pacingMode === "one_lesson_no_half_days") {
    lessonCount = day.day_type === "half" ? 0 : 1;
  } else {
    lessonCount = 1;
  }

  const modifier = modifierForWeekday(weekdayModifiers, day.class_date);
  if (modifier === "no_lesson") return 0;
  if (modifier === "one_less") return Math.max(0, lessonCount - 1);
  if (
    pacingMode === "two_lessons_per_day" &&
    oneLessonAssignmentDates?.has(day.class_date)
  ) {
    return 1;
  }
  return lessonCount;
}
