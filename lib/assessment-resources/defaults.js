export function assessmentDefaultLessonCount(course) {
  const oneLesson = !String(course?.pacing_mode || "one_lesson_per_day").startsWith("two_lessons");
  return oneLesson && course?.schedule_model === "ab" ? 3 : 5;
}

export function nextAssessmentLessonIds({ lessons, latestLessonIds, count }) {
  const ordered = [...(lessons || [])].sort(
    (a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0)
  );
  const selected = new Set(latestLessonIds || []);
  let start = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    if (selected.has(ordered[index].id)) start = index + 1;
  }
  return ordered.slice(start, start + count).map((lesson) => lesson.id);
}
