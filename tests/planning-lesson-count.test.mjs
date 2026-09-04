import assert from "node:assert/strict";
import test from "node:test";
import { lessonsForPlanningDay } from "../lib/planning/lesson-count.js";

const instructionalTuesday = {
  class_date: "2026-09-08",
  day_type: "instructional",
};

test("a selected same-day assessment reduces two lessons to one", () => {
  assert.equal(
    lessonsForPlanningDay({
      day: instructionalTuesday,
      pacingMode: "two_lessons_per_day",
      weekdayModifiers: {},
      oneLessonAssignmentDates: new Set(["2026-09-08"]),
    }),
    1
  );
});

test("ordinary days remain at two lessons", () => {
  assert.equal(
    lessonsForPlanningDay({
      day: instructionalTuesday,
      pacingMode: "two_lessons_per_day",
      weekdayModifiers: {},
      oneLessonAssignmentDates: new Set(),
    }),
    2
  );
});

test("the assessment option does not change one-lesson pacing modes", () => {
  assert.equal(
    lessonsForPlanningDay({
      day: instructionalTuesday,
      pacingMode: "one_lesson_per_day",
      weekdayModifiers: {},
      oneLessonAssignmentDates: new Set(["2026-09-08"]),
    }),
    1
  );
});
