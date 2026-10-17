import assert from "node:assert/strict";
import test from "node:test";
import { isMissingSkippedLessonsColumn, withoutSkippedLessons } from "../lib/planning/skipped-lessons.js";

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
