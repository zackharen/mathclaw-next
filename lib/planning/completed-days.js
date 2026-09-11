// Splits a class plan's visible days into the ones folded under "Completed
// Lessons" and the ones left open, so the first open card is the next class the
// teacher still has to teach.
//
// Everything before the first day with an unfinished lesson folds away if it is
// fully completed or a no-lesson day already in the past. A future no-lesson day
// ahead of the next lesson (say, Monday off) stays visible because it is still
// news, and anything after the next lesson stays in place even if it was
// completed early, so the calendar never reorders.
export function splitLessonDaysForFold({ days, rowsByDate, todayIso }) {
  const rowsFor = (day) => rowsByDate.get(day.class_date) || [];
  const isComplete = (rows) => rows.length > 0 && rows.every((row) => row.status === "completed");
  const nextIndex = days.findIndex((day) => {
    const rows = rowsFor(day);
    return rows.length > 0 && !isComplete(rows);
  });

  const foldedDays = [];
  const openDays = [];
  days.forEach((day, index) => {
    const rows = rowsFor(day);
    const beforeNext = nextIndex === -1 || index < nextIndex;
    const foldable = isComplete(rows) || (rows.length === 0 && day.class_date < todayIso);
    (beforeNext && foldable ? foldedDays : openDays).push(day);
  });

  return {
    foldedDays,
    openDays,
    nextClassDate: nextIndex === -1 ? null : days[nextIndex].class_date,
  };
}
