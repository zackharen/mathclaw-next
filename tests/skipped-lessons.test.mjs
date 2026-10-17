import assert from "node:assert/strict";
import test from "node:test";
import {
  isMissingSkippedLessonsColumn,
  isPastSkippedLesson,
  logSkip,
  logUndo,
  withoutSkippedLessons,
} from "../lib/planning/skipped-lessons.js";

test("skipped lessons leave the sequence in order", () => {
  const lessons = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(withoutSkippedLessons(lessons, ["b"]).map((lesson) => lesson.id), ["a", "c"]);
  assert.equal(withoutSkippedLessons(lessons, []), lessons);
  assert.deepEqual(withoutSkippedLessons(null, ["b"]), []);
});

test("a missing skipped_lesson_ids column is recognized", () => {
  assert.equal(isMissingSkippedLessonsColumn({ code: "42703", message: "column does not exist" }), true);
  assert.equal(isMissingSkippedLessonsColumn({ message: "column courses.skipped_lesson_ids does not exist" }), true);
  assert.equal(isMissingSkippedLessonsColumn({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingSkippedLessonsColumn(null), false);
});

test("undo closes only the latest open skip of that lesson", () => {
  let log = logSkip([], { lessonId: "a", skippedFrom: "2026-10-01", skippedAt: "t1", userId: "u" });
  log = logUndo(log, { lessonId: "a", undoneAt: "t2", userId: "u" });
  log = logSkip(log, { lessonId: "a", skippedFrom: "2026-10-08", skippedAt: "t3", userId: "u" });
  log = logUndo(log, { lessonId: "a", undoneAt: "t4", userId: "u" });
  assert.deepEqual(log.map((entry) => entry.undone_at), ["t2", "t4"]);
  assert.deepEqual(logUndo(log, { lessonId: "missing", undoneAt: "t5" }), log);
});

test("a skip is past once the class completed a later lesson", () => {
  assert.equal(isPastSkippedLesson(5, 10), true);
  assert.equal(isPastSkippedLesson(12, 10), false);
  assert.equal(isPastSkippedLesson(5, null), false);
  assert.equal(isPastSkippedLesson(undefined, 10), false);
});
