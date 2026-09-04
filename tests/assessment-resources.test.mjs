import assert from "node:assert/strict";
import test from "node:test";
import {
  assessmentDefaultLessonCount,
  nextAssessmentLessonIds,
} from "../lib/assessment-resources/defaults.js";

test("one-lesson A/B classes suggest three lessons", () => {
  assert.equal(assessmentDefaultLessonCount({ pacing_mode: "one_lesson_per_day", schedule_model: "ab" }), 3);
});

test("daily and two-lesson classes suggest five lessons", () => {
  assert.equal(assessmentDefaultLessonCount({ pacing_mode: "one_lesson_per_day", schedule_model: "daily" }), 5);
  assert.equal(assessmentDefaultLessonCount({ pacing_mode: "two_lessons_per_day", schedule_model: "ab" }), 5);
});

test("new assessments start after the most recently associated lesson", () => {
  const lessons = Array.from({ length: 9 }, (_, index) => ({ id: `lesson-${index + 1}`, sequence_index: index + 1 }));
  assert.deepEqual(
    nextAssessmentLessonIds({ lessons, latestLessonIds: ["lesson-2", "lesson-3"], count: 5 }),
    ["lesson-4", "lesson-5", "lesson-6", "lesson-7", "lesson-8"]
  );
});
