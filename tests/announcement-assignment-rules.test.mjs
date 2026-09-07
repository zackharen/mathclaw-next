import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOneLessonAssignmentDates,
  buildRuleAssignmentOccurrences,
  buildSchoolDayNumberByDate,
  formatAnnouncementAssignmentDate,
  formatUpcomingRuleAssignments,
  numberRuleAssignmentOccurrences,
  selectUpcomingRuleAssignments,
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

test("assessment numbering resets within each marking period", () => {
  const days = [
    { class_date: "2026-09-08", day_type: "instructional" },
    { class_date: "2026-09-15", day_type: "instructional" },
    { class_date: "2026-11-10", day_type: "instructional" },
  ];
  const schoolDayNumbers = new Map([
    ["2026-09-08", 1],
    ["2026-09-15", 6],
    ["2026-11-10", 46],
  ]);
  const periods = [
    { name: "Quarter 1", start_day_number: 1, end_day_number: 45 },
    { name: "Quarter 2", start_day_number: 46, end_day_number: 90 },
  ];
  const occurrences = buildRuleAssignmentOccurrences({
    rules: [{ id: "rule-1", label: "Assessment", cadence: "weekly", settings: { weekdays: [2] } }],
    course,
    calendarDays: days,
    markingPeriodRules: periods,
    schoolDayNumberByDate: schoolDayNumbers,
    overrides: [],
  });
  assert.deepEqual(
    numberRuleAssignmentOccurrences(occurrences, periods).map((item) => item.assessment_number),
    ["1.1", "1.2", "2.1"]
  );
});

test("skipped occurrences keep their place in stable numbering", () => {
  const occurrences = [
    { rule_id: "rule-1", original_date: "2026-09-08", assignment_date: "2026-09-08", marking_period: "Quarter 1", label: "Assessment", is_skipped: true },
    { rule_id: "rule-1", original_date: "2026-09-15", assignment_date: "2026-09-15", marking_period: "Quarter 1", label: "Assessment", is_skipped: false },
  ];
  assert.deepEqual(
    numberRuleAssignmentOccurrences(occurrences, [{ name: "Quarter 1", start_day_number: 1 }]).map((item) => item.assessment_number),
    ["1.1", "1.2"]
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

test("upcoming assignments include active work and the next five school days", () => {
  const days = [
    { class_date: "2026-09-14", day_type: "instructional" },
    { class_date: "2026-09-15", day_type: "instructional" },
    { class_date: "2026-09-16", day_type: "instructional" },
    { class_date: "2026-09-17", day_type: "instructional" },
    { class_date: "2026-09-18", day_type: "instructional" },
    { class_date: "2026-09-21", day_type: "instructional" },
    { class_date: "2026-09-22", day_type: "instructional" },
    { class_date: "2026-09-23", day_type: "instructional" },
    { class_date: "2026-09-24", day_type: "instructional" },
    { class_date: "2026-09-25", day_type: "instructional" },
  ];
  const assignmentsByDate = new Map([
    ["2026-09-15", [{ rule_id: "ai", label: "AI Word Problem 1.1", assignment_date: "2026-09-15", due_date: "2026-09-22" }]],
    ["2026-09-18", [{ rule_id: "spiral", label: "Spiral Review 1.2", assignment_date: "2026-09-18", due_date: null }]],
    ["2026-09-25", [{ rule_id: "later", label: "Later Work 1.1", assignment_date: "2026-09-25", due_date: null }]],
    ["2026-09-14", [{ rule_id: "expired", label: "Expired Work 1.1", assignment_date: "2026-09-14", due_date: "2026-09-16" }]],
  ]);

  assert.deepEqual(
    selectUpcomingRuleAssignments({ assignmentsByDate, classDate: "2026-09-17", calendarDays: days })
      .map((assignment) => assignment.label),
    ["AI Word Problem 1.1", "Spiral Review 1.2"]
  );
});

test("upcoming assignment lines distinguish active, current, and future work", () => {
  assert.equal(
    formatUpcomingRuleAssignments([
      { label: "AI Word Problem 1.1", assignment_date: "2026-09-15", due_date: "2026-09-22" },
      { label: "Spiral Review 1.2", assignment_date: "2026-09-17", due_date: "2026-09-18" },
      { label: "Assessment 1.2", assignment_date: "2026-09-21", due_date: null },
    ], "2026-09-17"),
    "AI Word Problem 1.1 | Assigned Tue 9/15 | Due Tue 9/22\n" +
      "Spiral Review 1.2 | Due Fri 9/18\n" +
      "Assessment 1.2 | Mon 9/21"
  );
});

test("assignment dates include a timezone-safe abbreviated weekday", () => {
  assert.equal(formatAnnouncementAssignmentDate("2026-09-11"), "Fri 9/11");
});
