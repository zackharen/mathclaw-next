import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentsNotAlreadyListed,
  buildOneLessonAssignmentDates,
  buildRuleAssignmentsByDate,
  formatRuleDueSummary,
  onePerAssignment,
  weekdayDueDate,
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
    ["Spiral Review 1.2", "AI Word Problem 1.1"]
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

test("marking-period assignments are spread inside the period and avoid its final week", () => {
  const fridayDates = [
    "2026-09-04",
    "2026-09-11",
    "2026-09-18",
    "2026-09-25",
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
    "2026-10-30",
  ];
  const fridayDays = fridayDates.map((classDate) => ({
    class_date: classDate,
    day_type: "instructional",
  }));
  const dayNumbers = new Map(fridayDates.map((classDate, index) => [classDate, (index + 1) * 5]));

  const occurrences = buildRuleAssignmentOccurrences({
    rules: [{
      id: "notebook-check",
      label: "Notebook Check",
      cadence: "marking_period",
      count_per_period: 3,
      settings: { weekdays: [5], start_date: "2026-09-04" },
    }],
    course,
    calendarDays: fridayDays,
    markingPeriodRules: [{ name: "Quarter 1", start_day_number: 1, end_day_number: 45 }],
    schoolDayNumberByDate: dayNumbers,
    overrides: [],
  });

  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.assignment_date),
    ["2026-09-11", "2026-10-02", "2026-10-23"]
  );
  assert.equal(occurrences.some((occurrence) => occurrence.assignment_date === "2026-09-04"), false);
  assert.equal(occurrences.some((occurrence) => occurrence.assignment_date === "2026-10-30"), false);
});

test("a marking-period rule start date is an earliest boundary, not its first occurrence", () => {
  const fridayDates = [
    "2026-09-04",
    "2026-09-11",
    "2026-09-18",
    "2026-09-25",
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
    "2026-10-30",
  ];
  const occurrences = buildRuleAssignmentOccurrences({
    rules: [{
      id: "notebook-check",
      label: "Notebook Check",
      cadence: "marking_period",
      count_per_period: 3,
      settings: { weekdays: [5], start_date: "2026-09-11" },
    }],
    course,
    calendarDays: fridayDates.map((classDate) => ({ class_date: classDate, day_type: "instructional" })),
    markingPeriodRules: [{ name: "Quarter 1", start_day_number: 1, end_day_number: 45 }],
    schoolDayNumberByDate: new Map(fridayDates.map((classDate, index) => [classDate, (index + 1) * 5])),
    overrides: [],
  });

  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.assignment_date),
    ["2026-09-18", "2026-10-09", "2026-10-23"]
  );
});

test("later-due marking-period work leaves room for the due date before the final week", () => {
  const fridayDates = [
    "2026-09-04",
    "2026-09-11",
    "2026-09-18",
    "2026-09-25",
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
    "2026-10-30",
  ];
  const occurrences = buildRuleAssignmentOccurrences({
    rules: [{
      id: "choice-board",
      label: "Choice Board",
      cadence: "marking_period",
      count_per_period: 3,
      settings: { weekdays: [5], due_school_days: 5 },
    }],
    course,
    calendarDays: fridayDates.map((classDate) => ({ class_date: classDate, day_type: "instructional" })),
    markingPeriodRules: [{ name: "Quarter 1", start_day_number: 1, end_day_number: 45 }],
    schoolDayNumberByDate: new Map(fridayDates.map((classDate, index) => [classDate, (index + 1) * 5])),
    overrides: [],
  });

  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.assignment_date),
    ["2026-09-11", "2026-10-02", "2026-10-16"]
  );
});

test("only the next-due instance of each assignment is listed, soonest due first, ties alphabetical", () => {
  const listed = onePerAssignment([
    { rule_id: "spiral", label: "Delta Math Spiral Review 1.8", assignment_date: "2026-10-23", due_date: "2026-11-01" },
    { rule_id: "choice", label: "Choice Board 1.3", assignment_date: "2026-10-16", due_date: "2026-10-23" },
    { rule_id: "spiral", label: "Delta Math Spiral Review 1.7", assignment_date: "2026-10-16", due_date: "2026-10-25" },
    { rule_id: "notebook", label: "Notebook Check 1.3", assignment_date: "2026-10-23", due_date: null },
    { rule_id: "assessment", label: "Assessment 1.7", assignment_date: "2026-10-23", due_date: null },
  ]);
  assert.deepEqual(listed.map((assignment) => assignment.label), [
    "Assessment 1.7",
    "Choice Board 1.3",
    "Notebook Check 1.3",
    "Delta Math Spiral Review 1.7",
  ]);
});

test("work assigned today is left out when the upcoming list already shows that assignment", () => {
  const upcoming = [{ rule_id: "spiral", label: "Delta Math Spiral Review 1.7", assignment_date: "2026-10-16", due_date: "2026-10-25" }];
  const today = [
    { rule_id: "spiral", label: "Delta Math Spiral Review 1.8", assignment_date: "2026-10-23", due_date: "2026-11-01" },
    { rule_id: "exit", label: "Exit Ticket 1.1", assignment_date: "2026-10-23", due_date: null },
  ];
  assert.deepEqual(assignmentsNotAlreadyListed(today, upcoming).map((assignment) => assignment.label), ["Exit Ticket 1.1"]);
  assert.equal(assignmentsNotAlreadyListed(today, []).length, 2);
});

test("weekday due dates land on the next matching weekday, plus whole weeks", () => {
  assert.equal(weekdayDueDate("2026-10-23", 0, 0), "2026-10-25");
  assert.equal(weekdayDueDate("2026-10-23", 0, 1), "2026-11-01");
  assert.equal(weekdayDueDate("2026-10-23", 5, 0), "2026-10-30");
  assert.equal(formatRuleDueSummary({ due_weekday: 0, due_weeks_after: 1 }), ", due the following week's Sunday");
  assert.equal(formatRuleDueSummary({ due_school_days: 4 }), ", due 4 school days later");
  assert.equal(formatRuleDueSummary({}), "");
});

test("a Friday rule due the following week's Sunday is due nine days later, even off the school calendar", () => {
  const days = ["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((class_date) => ({
    class_date,
    day_type: "instructional",
  }));
  const byDate = buildRuleAssignmentsByDate({
    rules: [{
      id: "spiral",
      course_id: null,
      label: "Delta Math Spiral Review",
      cadence: "weekly",
      count_per_period: 1,
      settings: { weekdays: [5], week_interval: 1, due_weekday: 0, due_weeks_after: 1, due_school_days: 4, no_meeting_shift: "same_day" },
    }],
    course,
    calendarDays: days,
    markingPeriodRules: [],
    schoolDayNumberByDate: buildSchoolDayNumberByDate(days),
    overrides: [],
  });
  assert.equal(byDate.get("2026-10-16")[0].due_date, "2026-10-25");
  assert.equal(byDate.get("2026-10-23")[0].due_date, "2026-11-01");
  assert.deepEqual(
    selectUpcomingRuleAssignments({ assignmentsByDate: byDate, classDate: "2026-10-23", calendarDays: days })
      .map((assignment) => assignment.label),
    ["Delta Math Spiral Review 1.1"]
  );
});
