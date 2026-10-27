// Changes a teacher made to one class's lesson order, saved in
// courses.lesson_swaps and applied in order to the library sequence:
// - [lessonIdA, lessonIdB]: switch those two lessons.
// - { insert: customLessonId, before: lessonId | null }: put a custom lesson
//   in front of that lesson (or at the end).
// They live on the course because every pacing rebuild deletes and recreates
// course_lesson_plan.

// Custom lessons sit in this hidden library so real libraries keep their
// numbering and other classes never pick them up.
export const CUSTOM_LESSON_LIBRARY_CODE = "mathclaw_custom_lessons";

// Production may run this code before the column's migration is applied.
export function isMissingLessonSwapsColumn(error) {
  return Boolean(error) && (error.code === "42703" || /lesson_swaps/.test(error.message || ""));
}

export function isMissingCustomLessonsColumn(error) {
  return Boolean(error) && (error.code === "42703" || /course_id/.test(error.message || ""));
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

// A class's custom lessons, grouped by course. { available: false } until the
// custom lessons migration runs.
export async function loadCustomLessons(client, courseIds, columns = "id, course_id, sequence_index") {
  const byCourse = new Map(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return { available: true, byCourse };
  const { data, error } = await client.from("curriculum_lessons").select(columns).in("course_id", courseIds);
  if (isMissingCustomLessonsColumn(error)) return { available: false, byCourse };
  if (error) throw new Error(error.message);
  for (const row of data || []) byCourse.get(row.course_id)?.push(row);
  return { available: true, byCourse };
}

// The library sequence with this class's switches and custom lessons applied.
export function applyLessonEdits(lessons, edits, customLessons = []) {
  const ordered = [...(lessons || [])];
  if (!Array.isArray(edits) || edits.length === 0) return ordered;
  const customById = new Map((customLessons || []).map((lesson) => [lesson.id, lesson]));
  const indexOf = (id) => ordered.findIndex((lesson) => lesson.id === id);
  for (const edit of edits) {
    if (Array.isArray(edit)) {
      const a = indexOf(edit[0]);
      const b = indexOf(edit[1]);
      if (a < 0 || b < 0 || a === b) continue;
      [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
    } else if (edit && typeof edit === "object" && customById.has(edit.insert) && indexOf(edit.insert) < 0) {
      const before = edit.before ? indexOf(edit.before) : -1;
      ordered.splice(before < 0 ? ordered.length : before, 0, customById.get(edit.insert));
    }
  }
  return ordered;
}

export function applyLessonSwaps(lessons, swaps) {
  return applyLessonEdits(lessons, swaps);
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

export function addCustomLessonInsert(edits, customLessonId, beforeLessonId) {
  return [...(Array.isArray(edits) ? edits : []), { insert: customLessonId, before: beforeLessonId || null }];
}

// Drops a removed custom lesson from the edits. Custom lessons that were put in
// front of it move to where it was, and switches with it are dropped.
export function removeCustomLessonEdits(edits, customLessonId) {
  const list = Array.isArray(edits) ? edits : [];
  const own = list.find((edit) => edit && !Array.isArray(edit) && edit.insert === customLessonId);
  return list
    .filter((edit) =>
      Array.isArray(edit) ? !edit.includes(customLessonId) : edit?.insert !== customLessonId
    )
    .map((edit) =>
      !Array.isArray(edit) && edit?.before === customLessonId ? { ...edit, before: own?.before ?? null } : edit
    );
}
