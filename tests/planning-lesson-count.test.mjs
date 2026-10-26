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

test("a date-specific override wins over the pacing mode and weekday rules", () => {
  assert.equal(
    lessonsForPlanningDay({
      day: { ...instructionalTuesday, lesson_count_override: 0 },
      pacingMode: "two_lessons_per_day",
      weekdayModifiers: { 2: "one_less" },
      oneLessonAssignmentDates: new Set(["2026-09-08"]),
    }),
    0
  );
  assert.equal(
    lessonsForPlanningDay({
      day: { ...instructionalTuesday, lesson_count_override: 2 },
      pacingMode: "one_lesson_per_day",
      weekdayModifiers: {},
      oneLessonAssignmentDates: new Set(),
    }),
    2
  );
});

test("activity days pace like half days", () => {
  const day = (day_type) => ({ class_date: "2026-09-08", day_type });
  const count = (day_type, pacingMode) =>
    lessonsForPlanningDay({ day: day(day_type), pacingMode, weekdayModifiers: {}, oneLessonAssignmentDates: new Set() });
  for (const mode of ["one_lesson_per_day", "one_lesson_no_half_days", "two_lessons_per_day", "manual_complete"]) {
    assert.equal(count("modified", mode), count("half", mode), mode);
  }
  assert.equal(count("modified", "one_lesson_no_half_days"), 0);
  assert.equal(count("modified", "two_lessons_per_day"), 1);
});
