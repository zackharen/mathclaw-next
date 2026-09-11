import assert from "node:assert/strict";
import test from "node:test";
import { addDaysIso, buildAllClassesGrid, gridSchoolDates, gridWeekStart } from "../lib/planning/all-classes-grid.js";

test("the grid opens on the Monday of the current week, weekends included", () => {
  assert.equal(gridWeekStart("2026-09-11"), "2026-09-07");
  assert.equal(gridWeekStart("2026-09-12"), "2026-09-07");
  assert.equal(gridWeekStart("2026-09-13"), "2026-09-07");
  assert.equal(gridWeekStart("2026-09-14"), "2026-09-14");
  assert.equal(addDaysIso("2026-09-07", -7), "2026-08-31");
});

test("two weeks means ten weekdays, skipping the weekend between them", () => {
  assert.deepEqual(gridSchoolDates("2026-09-07"), [
    "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
    "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
  ]);
});

const lesson = (courseId, date, id, status = "planned") => ({
  course_id: courseId,
  class_date: date,
  status,
  curriculum_lessons: { id, source_lesson_code: id, title: `Lesson ${id}` },
});

test("cells distinguish lessons, off-letter days, days off, and empty days", () => {
  const courses = [
    { id: "alg", schedule_model: "every_day" },
    { id: "calcB", schedule_model: "ab", ab_meeting_day: "B" },
  ];
  const calendarDays = [
    { course_id: "alg", class_date: "2026-09-14", day_type: "instructional", ab_day: "B" },
    { course_id: "calcB", class_date: "2026-09-14", day_type: "instructional", ab_day: "B" },
    { course_id: "alg", class_date: "2026-09-15", day_type: "half", ab_day: "A" },
    { course_id: "calcB", class_date: "2026-09-15", day_type: "instructional", ab_day: "A" },
    { course_id: "alg", class_date: "2026-09-16", day_type: "instructional", ab_day: "B", is_grace_day: true },
    { course_id: "calcB", class_date: "2026-09-16", day_type: "off", ab_day: null },
  ];
  const planRows = [
    lesson("alg", "2026-09-14", "2.06", "completed"),
    lesson("calcB", "2026-09-14", "1.03"),
    lesson("calcB", "2026-09-14", "1.04", "completed"),
    lesson("alg", "2026-09-15", "2.07"),
    { course_id: "alg", class_date: "2026-09-15", status: "planned", curriculum_lessons: null },
  ];
  const { rows } = buildAllClassesGrid({
    courses,
    dates: ["2026-09-14", "2026-09-15", "2026-09-16"],
    calendarDays,
    planRows,
  });
  const [mon, tue, wed] = rows;
  assert.equal(mon.cells[0].kind, "lessons");
  assert.equal(mon.cells[0].complete, true);
  assert.equal(mon.cells[1].lessons.length, 2);
  assert.equal(mon.cells[1].complete, false, "partly completed is not complete");
  assert.equal(tue.cells[0].dayType, "half");
  assert.equal(tue.cells[0].lessons.length, 1, "rows without a lesson are dropped");
  assert.equal(tue.cells[1].kind, "no-meeting", "a B-day class shows nothing on an A day");
  assert.deepEqual(wed.cells[0], { kind: "empty", grace: true });
  assert.equal(wed.cells[1].kind, "off");
  assert.equal(wed.schoolClosed, false);
});

test("a date every class has off becomes a single school-closed row", () => {
  const { rows } = buildAllClassesGrid({
    courses: [{ id: "a", schedule_model: "every_day" }, { id: "b", schedule_model: "every_day" }],
    dates: ["2026-09-21"],
    calendarDays: [
      { course_id: "a", class_date: "2026-09-21", day_type: "off" },
      { course_id: "b", class_date: "2026-09-21", day_type: "off" },
    ],
    planRows: [],
  });
  assert.equal(rows[0].schoolClosed, true);
});

test("a grace day is recognised by either flag, matching isGraceDay", () => {
  const { rows } = buildAllClassesGrid({
    courses: [{ id: "a", schedule_model: "every_day" }],
    dates: ["2026-09-17"],
    calendarDays: [{ course_id: "a", class_date: "2026-09-17", day_type: "grace_day" }],
    planRows: [],
  });
  assert.deepEqual(rows[0].cells[0], { kind: "empty", grace: true });
});
