// Lessons a teacher chose to skip for one class. They live on the course
// (courses.skipped_lesson_ids) rather than as plan rows, because every pacing
// rebuild deletes and recreates course_lesson_plan.

// Production may run this code before the column's migration is applied.
export function isMissingSkippedLessonsColumn(error) {
  return Boolean(error) && (error.code === "42703" || /skipped_lesson_(ids|log)/.test(error.message || ""));
}

// { available: false } when the column does not exist yet, so callers can hide
// skipping instead of failing the page.
export async function loadSkippedLessonIds(client, courseIds) {
  const byCourse = new Map(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return { available: true, byCourse };
  const { data, error } = await client.from("courses").select("id, skipped_lesson_ids").in("id", courseIds);
  if (isMissingSkippedLessonsColumn(error)) return { available: false, byCourse };
  if (error) throw new Error(error.message);
  for (const row of data || []) byCourse.set(row.id, row.skipped_lesson_ids || []);
  return { available: true, byCourse };
}

// The curriculum sequence the class actually teaches, in order.
export function withoutSkippedLessons(lessons, skippedLessonIds) {
  const skipped = new Set(skippedLessonIds || []);
  return skipped.size ? (lessons || []).filter((lesson) => !skipped.has(lesson.id)) : lessons || [];
}

// courses.skipped_lesson_log keeps when and from which day each lesson was
// skipped, and when a skip was undone. skipped_lesson_ids stays the source of
// truth for pacing; the log only describes it. { available: false } until the
// log column's migration runs.
export async function loadSkippedLessonLog(client, courseIds) {
  const byCourse = new Map(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return { available: true, byCourse };
  const { data, error } = await client.from("courses").select("id, skipped_lesson_log").in("id", courseIds);
  if (isMissingSkippedLessonsColumn(error)) return { available: false, byCourse };
  if (error) throw new Error(error.message);
  for (const row of data || []) byCourse.set(row.id, Array.isArray(row.skipped_lesson_log) ? row.skipped_lesson_log : []);
  return { available: true, byCourse };
}

export function logSkip(log, { lessonId, skippedFrom, skippedAt, userId }) {
  return [...(log || []), { lesson_id: lessonId, skipped_from: skippedFrom, skipped_at: skippedAt, skipped_by: userId }];
}

// Marks the most recent open skip of this lesson as undone.
export function logUndo(log, { lessonId, undoneAt, userId }) {
  const entries = [...(log || [])];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.lesson_id === lessonId && !entry.undone_at) {
      entries[index] = { ...entry, undone_at: undoneAt, undone_by: userId };
      break;
    }
  }
  return entries;
}

// Completion is carried by position, so a skipped lesson that sits before the
// last completed lesson can't come back without taking over a completed slot.
export function isPastSkippedLesson(lessonSequenceIndex, lastCompletedSequenceIndex) {
  return (
    Number.isFinite(lastCompletedSequenceIndex) &&
    Number.isFinite(lessonSequenceIndex) &&
    lessonSequenceIndex < lastCompletedSequenceIndex
  );
}
