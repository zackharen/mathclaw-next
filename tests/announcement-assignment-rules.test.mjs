import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOneLessonAssignmentDates,
  buildSchoolDayNumberByDate,
} from "../lib/announcements/assignment-rules.js";

const calendarDays = [
  { class_date: "2026-09-08", day_type: "instructional", ab_day: "A" },
  { class_date: "2026-09-09", day_type: "instructional", ab_day: "B" },
  { class_date: "2026-09-10", day_type: "instructional", ab_day: "A" },
];

const course = { id: "course-1", schedule_model: "daily", ab_meeting_day: null };

function datesForRule(settings, overrides = []) {
  return buildOneLessonAssignmentDates({
    rules: [{
      id: "rule-1",
      course_id: null,
      label: "Assessment",
      cadence: "weekly",
      count_per_period: 1,
      settings: { weekdays: [2], week_interval: 1, ...settings },
    }],
    course,
    calendarDays,
    markingPeriodRules: [],
    schoolDayNumberByDate: buildSchoolDayNumberByDate(calendarDays),
    overrides,
  });
}

test("same-day assessment rules reduce the matching day to one lesson", () => {
  assert.deepEqual(
    [...datesForRule({ one_lesson_on_assignment_day: true })],
    ["2026-09-08"]
  );
});

test("assignments due later cannot reduce the assignment day to one lesson", () => {
  assert.deepEqual(
    [...datesForRule({ one_lesson_on_assignment_day: true, due_school_days: 1 })],
    []
  );
});

test("moving an assessment moves its one-lesson date", () => {
  assert.deepEqual(
    [...datesForRule(
      { one_lesson_on_assignment_day: true },
      [{
        rule_id: "rule-1",
        course_id: "course-1",
        original_date: "2026-09-08",
        assignment_date: "2026-09-09",
        is_skipped: false,
      }]
    )],
    ["2026-09-09"]
  );
});
