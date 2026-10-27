// Lessons a teacher switched for one class. Each entry is a [lessonIdA,
// lessonIdB] pair applied in order to the library sequence. They live on the
// course (courses.lesson_swaps) because every pacing rebuild deletes and
// recreates course_lesson_plan.

// Production may run this code before the column's migration is applied.
export function isMissingLessonSwapsColumn(error) {
  return Boolean(error) && (error.code === "42703" || /lesson_swaps/.test(error.message || ""));
}

// { available: false } when the column does not exist yet, so callers can hide
// switching instead of failing the page.
export async function loadLessonSwaps(client, courseIds) {
  const byCourse = new Map(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return { available: true, byCourse };
  const { data, error } = await client.from("courses").select("id, lesson_swaps").in("id", courseIds);
  if (isMissingLessonSwapsColumn(error)) return { available: false, byCourse };
  if (error) throw new Error(error.message);
  for (const row of data || []) byCourse.set(row.id, Array.isArray(row.lesson_swaps) ? row.lesson_swaps : []);
  return { available: true, byCourse };
}

// The library sequence with this class's switches applied.
export function applyLessonSwaps(lessons, swaps) {
  const ordered = [...(lessons || [])];
  if (!Array.isArray(swaps) || swaps.length === 0) return ordered;
  const indexById = new Map(ordered.map((lesson, index) => [lesson.id, index]));
  for (const pair of swaps) {
    if (!Array.isArray(pair)) continue;
    const a = indexById.get(pair[0]);
    const b = indexById.get(pair[1]);
    if (a === undefined || b === undefined || a === b) continue;
    [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
    indexById.set(ordered[a].id, a);
    indexById.set(ordered[b].id, b);
  }
  return ordered;
}

// Switching the same two lessons back cancels the last switch instead of
// growing the list.
export function addLessonSwap(swaps, lessonIdA, lessonIdB) {
  const list = Array.isArray(swaps) ? [...swaps] : [];
  const last = list[list.length - 1];
  if (
    Array.isArray(last) &&
    ((last[0] === lessonIdA && last[1] === lessonIdB) || (last[0] === lessonIdB && last[1] === lessonIdA))
  ) {
    list.pop();
    return list;
  }
  list.push([lessonIdA, lessonIdB]);
  return list;
}
