// Lessons a teacher chose to skip for one class. They live on the course
// (courses.skipped_lesson_ids) rather than as plan rows, because every pacing
// rebuild deletes and recreates course_lesson_plan.

// Production may run this code before the column's migration is applied.
export function isMissingSkippedLessonsColumn(error) {
  return Boolean(error) && (error.code === "42703" || /skipped_lesson_ids/.test(error.message || ""));
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
