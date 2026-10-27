import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  buildFixedDatesAnnouncement,
  calendarDateFromChipTimestamp,
  datedAssignmentsForAnnouncements,
  fixedDatesAnnouncementDates,
  formatClockTime,
  isFixedDatesCourse,
} from "../lib/planning/fixed-dates.js";
import {
  ECC_STATISTICS_COURSE,
  ECC_STATISTICS_SCHEDULE,
  buildEccStatisticsSetup,
} from "../lib/planning/syllabi/ecc-statistics.js";
import { buildSetupSql } from "../lib/planning/syllabi/setup-sql.js";
import { buildAllClassesGrid } from "../lib/planning/all-classes-grid.js";
import { buildRuleAssignmentOccurrences, ruleAppliesToCourse } from "../lib/announcements/assignment-rules.js";

// The snapshot Zack supplied, which the live syllabus matched row for row on 2026-10-20.
const SNAPSHOT = `
2026-09-29|2026-10-06
2026-10-01|2026-10-08
2026-10-06|2026-10-13
2026-10-08|2026-10-15
2026-10-13|2026-10-20
2026-10-15|2026-10-22
2026-10-20|2026-10-27
2026-10-22|2026-10-29
2026-10-27|2026-11-03
2026-10-29|2026-11-10
2026-11-03|2026-11-10
2026-11-10|2026-11-17
2026-11-12|2026-11-19
2026-11-17|2026-11-24
2026-11-19|2026-12-01
2026-11-24|2026-12-01
2026-12-01|2026-12-08
2026-12-03|2026-12-10
2026-12-08|2026-12-15
2026-12-10|2026-12-17
2026-12-15|2026-12-22
2026-12-17|2027-01-05
2027-01-05|2027-01-12
2027-01-07|2027-01-14
2027-01-12|2027-01-19
2027-01-14|2027-01-21
2027-01-19|2027-01-26`
  .trim()
  .split("\n")
  .map((line) => line.split("|"));

const setup = buildEccStatisticsSetup();
const rowByCode = (code) => ECC_STATISTICS_SCHEDULE.find((row) => row.code === code);
const assignments = datedAssignmentsForAnnouncements(
  setup.assignments.map((item, index) => ({ ...item, id: `a${index}` }))
);

test("syllabus keeps every release and due date exactly as published", () => {
  assert.deepEqual(
    ECC_STATISTICS_SCHEDULE.map((row) => [row.release, row.due]),
    SNAPSHOT
  );
  assert.equal(ECC_STATISTICS_SCHEDULE[0].release, ECC_STATISTICS_COURSE.start);
  assert.equal(ECC_STATISTICS_SCHEDULE.at(-1).due, ECC_STATISTICS_COURSE.end);
});

test("holiday exceptions are explicit, not a seven-day offset", () => {
  assert.equal(rowByCode("2.03").due, "2026-11-10");
  assert.equal(rowByCode("3.01").due, "2026-12-01");
  assert.equal(rowByCode("4.03").due, "2027-01-05");
  const due = (code, key) => setup.assignments.find((item) => item.source_key === `ecc-stats:${code}:${key}`).due_date;
  assert.equal(due("2.03", "snorkl-5"), "2026-11-10");
  assert.equal(due("3.01", "snorkl-7"), "2026-12-01");
  assert.equal(due("4.03", "snorkl-10"), "2027-01-05");
});

test("a syllabus row becomes separate, identifiable assignments", () => {
  const keys = setup.assignments.map((item) => item.source_key);
  assert.equal(new Set(keys).size, keys.length, "source keys are unique");
  const oct1 = setup.assignments.filter((item) => item.assignment_date === "2026-10-01");
  assert.deepEqual(
    oct1.filter((item) => item.lessonCode === "1.02").map((item) => item.label),
    ["1.02 Lesson Video", "1.02 Practice", "1.02 Notes", "Weekly Snorkl 1"]
  );
  const finalReviews = setup.assignments.filter((item) => item.lessonCode === "Final Exam Reviews 1 & 2");
  assert.deepEqual(finalReviews.map((item) => item.label), ["Final Exam Review 1", "Final Exam Review 2"]);
});

test("Snorkl runs 1-10 once each and never during final-exam review", () => {
  const snorkls = setup.assignments.filter((item) => item.provider === "Snorkl").map((item) => item.label);
  assert.deepEqual(snorkls, Array.from({ length: 10 }, (_, i) => `Weekly Snorkl ${i + 1}`));
  assert.ok(!setup.assignments.some((item) => item.label.includes("Snorkl 11")));
  assert.ok(setup.assignments.filter((item) => item.provider === "Snorkl").every((item) => item.category === "performance_tasks"));
});

test("categories follow the syllabus and nothing invents a link", () => {
  const by = (label) => setup.assignments.find((item) => item.label === label);
  assert.equal(by("1.01 Lesson Video").category, "participation");
  assert.equal(by("1.01 Practice").category, "participation");
  assert.equal(by("1.01 Notes").category, "portfolio");
  assert.equal(by("Exam 1").category, "assessments");
  assert.equal(by("Exam 1 Review").category, null, "review contents are not assumed");
  assert.ok(setup.assignments.every((item) => !("url" in item) || item.url == null));
  assert.ok(setup.assignments.every((item) => item.is_draft));
  // Reviews get no notes assignment.
  assert.ok(!setup.assignments.some((item) => /Review.*Notes/.test(item.label)));
});

test("setup SQL only inserts, so reruns never duplicate or overwrite", () => {
  const sql = buildSetupSql({
    library: { providerCode: "teacher_syllabus", providerName: "Teacher Syllabus", classCode: "ECC-STATS", className: "ECC Statistics & Probability" },
    setup,
    courseId: "00000000-0000-0000-0000-000000000001",
  });
  assert.ok(!/\bupdate\s+public\./i.test(sql));
  assert.ok(!/\bdelete\s+from/i.test(sql));
  assert.equal((sql.match(/on conflict/gi) || []).length, 4);
  assert.match(sql, /where not exists \(select 1 from public\.course_lesson_plan p where p\.course_id = .* and p\.lesson_id = cl\.id\)/);
  assert.match(sql, /'Final Exam Reviews 1 & 2'/);
  assert.match(sql, /'Weekly Check-in \(week of 9\/28\)'/);
});

test("announcement for a release day lists each new assignment with its own deadline", () => {
  const text = buildFixedDatesAnnouncement({
    classDate: "2026-10-29",
    courseTitle: "ECC | Statistics & Probability",
    dateLabel: "Thursday, 10/29/2026",
    releasedLessons: ["2.03: Additional Topics in Probability & Counting"],
    assignments,
  });
  assert.match(text, /^ECC \| Statistics & Probability \| Thursday, 10\/29\/2026/);
  assert.match(text, /Posted today at 3:00 PM:\n2\.03: Additional Topics/);
  assert.match(text, /2\.03 Lesson Video \| Due Tue 11\/10 11:59 PM/);
  assert.match(text, /Weekly Snorkl 5 \| Due Tue 11\/10 11:59 PM/);
  // 2.01's work is due today; 2.02's is still open.
  assert.match(text, /Due today by 11:59 PM:\n2\.01 Lesson Video/);
  assert.match(text, /Weekly Snorkl 4/);
  assert.match(text, /Still open:\n2\.02 Lesson Video \| Due Tue 11\/3 11:59 PM/);
  assert.doesNotMatch(text, /A Day|B Day|Schedule|office hours|Notebook Check|Choice Board|Spiral/i);
});

test("a day with deadlines but no release says so and still lists what is due", () => {
  const text = buildFixedDatesAnnouncement({
    classDate: "2027-01-26",
    courseTitle: "ECC | Statistics & Probability",
    dateLabel: "Tuesday, 1/26/2027",
    releasedLessons: [],
    assignments,
  });
  assert.match(text, /No new lessons posted today\./);
  assert.match(text, /Due today by 11:59 PM:\nFinal Exam/);
  assert.doesNotMatch(text, /Still open/);
});

test("announcement dates are releases plus due-only days, across the year boundary", () => {
  const dates = fixedDatesAnnouncementDates({
    releaseDates: ECC_STATISTICS_SCHEDULE.map((row) => row.release),
    assignments,
  });
  assert.equal(dates[0], "2026-09-29");
  assert.equal(dates.at(-1), "2027-01-26");
  assert.ok(dates.includes("2026-12-22"), "4.02 due date with no release");
  assert.ok(dates.includes("2027-01-05"));
  assert.ok(!dates.includes("2026-12-24"));
  assert.deepEqual([...dates].sort(), dates);
});

test("wall-clock times and chip dates are immune to daylight saving time", () => {
  // DST ends Sun 11/1/2026; deadlines on either side keep 11:59 PM.
  const before = assignments.find((a) => a.label === "1.05 Lesson Video");
  const after = assignments.find((a) => a.label === "2.02 Lesson Video");
  assert.equal(after.due_date, "2026-11-03");
  assert.equal(formatClockTime(before.due_time), "11:59 PM");
  assert.equal(formatClockTime(after.due_time), "11:59 PM");
  assert.equal(formatClockTime("15:00:00"), "3:00 PM");
  assert.equal(formatClockTime("00:05"), "12:05 AM");
  // Noon-UTC and midnight-UTC chips both name the calendar day they show.
  assert.equal(calendarDateFromChipTimestamp(Date.UTC(2026, 10, 3, 12)), "2026-11-03");
  assert.equal(calendarDateFromChipTimestamp(Date.UTC(2026, 10, 1, 0)), "2026-11-01");
  assert.equal(calendarDateFromChipTimestamp(Date.UTC(2027, 0, 26, 12)), "2027-01-26");
});

test("excluded classes get no regular-class rule occurrences", () => {
  const rule = { id: "nb", course_id: null, label: "Notebook Check", cadence: "weekly", settings: { weekdays: [5], excluded_course_ids: ["ecc"] } };
  assert.equal(ruleAppliesToCourse(rule, "ecc"), false);
  assert.equal(ruleAppliesToCourse(rule, "algebra"), true);
  assert.equal(ruleAppliesToCourse({ ...rule, course_id: "algebra" }, "algebra"), true);
  assert.equal(ruleAppliesToCourse({ ...rule, course_id: "algebra" }, "ecc"), false);
  const calendarDays = [{ class_date: "2026-10-30", day_type: "instructional" }];
  const run = (id) => buildRuleAssignmentOccurrences({ rules: [rule], course: { id }, calendarDays, markingPeriodRules: [], schoolDayNumberByDate: new Map(), overrides: [] });
  assert.equal(run("ecc").length, 0);
  assert.equal(run("algebra").length, 1);
});

test("grid shows releases on their dates, truthful quiet days, and deadlines", () => {
  const ecc = { id: "ecc", pacing_mode: "fixed_dates", schedule_model: "every_day" };
  const alg = { id: "alg", schedule_model: "every_day" };
  const day = (course_id, class_date, extra = {}) => ({ course_id, class_date, day_type: "instructional", ...extra });
  const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-11-05", "2026-11-25"];
  const calendarDays = [
    day("alg", "2026-09-28"), day("alg", "2026-09-29"), day("alg", "2026-09-30"),
    day("alg", "2026-11-05", { day_type: "off" }), day("alg", "2026-11-25", { is_grace_day: true }),
    // ECC's calendar starts 9/29.
    day("ecc", "2026-09-29"), day("ecc", "2026-09-30"),
    day("ecc", "2026-11-05", { day_type: "off" }), day("ecc", "2026-11-25", { is_grace_day: true }),
  ];
  const planRows = [
    { course_id: "ecc", class_date: "2026-09-29", lesson_slot: 1, status: "planned", curriculum_lessons: { id: "l1", source_lesson_code: "1.01", title: "Frequency" } },
    { course_id: "alg", class_date: "2026-09-29", lesson_slot: 1, status: "planned", curriculum_lessons: { id: "x", source_lesson_code: "2.01", title: "Alg" } },
  ];
  const dueAssignments = [
    { id: "d1", course_id: "ecc", label: "Weekly Snorkl 9", due_date: "2026-11-05", sort_order: 2 },
    { id: "d2", course_id: "ecc", label: "4.02 Notes", due_date: "2026-09-30", sort_order: 1, due_time: "23:59:00" },
  ];
  const { rows } = buildAllClassesGrid({ courses: [alg, ecc], dates, calendarDays, planRows, dueAssignments });
  const cell = (date, index) => rows.find((row) => row.date === date).cells[index];

  assert.equal(cell("2026-09-28", 1).kind, "no-meeting", "before the course starts");
  assert.equal(cell("2026-09-29", 1).kind, "lessons");
  assert.equal(cell("2026-09-29", 1).fixed, true);
  assert.deepEqual(cell("2026-09-30", 1), { kind: "empty", grace: false, dayType: "instructional", lessonCountOverride: undefined, fixed: true, due: [{ id: "d2", label: "4.02 Notes", due_time: "23:59:00" }] });
  assert.equal(cell("2026-11-25", 1).grace, false, "a grace day is not a lesson day for a syllabus class");
  assert.equal(cell("2026-11-25", 0).grace, true);
  // Everyone is off on 11/5, but ECC still has work due, so the row stays open.
  const closedRow = rows.find((row) => row.date === "2026-11-05");
  assert.equal(closedRow.schoolClosed, false);
  assert.equal(cell("2026-11-05", 1).due[0].label, "Weekly Snorkl 9");
  // The regular class is unchanged.
  assert.deepEqual(cell("2026-09-30", 0), { kind: "empty", grace: false, dayType: "instructional", lessonCountOverride: undefined });
});

// rebuildPlanFromCalendar, loaded with its imports stubbed, as in grid-plan-save.
async function loadRebuild(course) {
  const source = (await readFile(new URL("../lib/planning/rebuild-plan.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replaceAll("export async function", "async function");
  const writes = [];
  const query = (table) => {
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; }, gte() { return q; }, lte() { return q; }, neq() { return q; },
      delete() { writes.push(`delete ${table}`); return q; },
      insert() { writes.push(`insert ${table}`); return q; },
      upsert() { writes.push(`upsert ${table}`); return q; },
      then(resolve) { resolve({ data: [], error: null }); },
    };
    return q;
  };
  const context = vm.createContext({
    console: { info() {} },
    process: { env: { MATHCLAW_TIMING: "0" } },
    Date,
    getCourseAccessForUser: async () => ({ course }),
    isFixedDatesCourse,
    loadSkippedLessonIds: async () => ({ byCourse: new Map() }),
    withoutSkippedLessons: (lessons) => lessons,
    loadLessonSwaps: async () => ({ byCourse: new Map() }),
    applyLessonSwaps: (lessons) => lessons,
    lessonsForPlanningDay: () => 1,
    isGraceDay: () => false,
    buildOneLessonAssignmentDates: () => new Set(),
    buildSchoolDayNumberByDate: () => new Map(),
    ruleAppliesToCourse,
  });
  vm.runInContext(`${source}\nglobalThis.rebuild = rebuildPlanFromCalendar;`, context);
  return { rebuild: context.rebuild, supabase: { from: query }, writes };
}

test("replanning and calendar pushes never touch a syllabus class's releases", async () => {
  const fixed = await loadRebuild({ id: "ecc", selected_library_id: "lib", pacing_mode: "fixed_dates" });
  await fixed.rebuild({ supabase: fixed.supabase, courseId: "ecc", userId: "t" });
  await fixed.rebuild({ supabase: fixed.supabase, courseId: "ecc", userId: "t", startDate: "2026-11-01" });
  assert.deepEqual(fixed.writes, []);

  const regular = await loadRebuild({ id: "alg", selected_library_id: "lib", pacing_mode: "one_lesson_per_day" });
  await regular.rebuild({ supabase: regular.supabase, courseId: "alg", userId: "t" });
  assert.ok(regular.writes.includes("delete course_lesson_plan"), "regular classes still re-pace");
});

test("isFixedDatesCourse only matches the syllabus pacing mode", () => {
  assert.equal(isFixedDatesCourse({ pacing_mode: "fixed_dates" }), true);
  assert.equal(isFixedDatesCourse({ pacing_mode: "manual_complete" }), false);
  assert.equal(isFixedDatesCourse(null), false);
});
