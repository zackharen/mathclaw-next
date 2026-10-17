import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssessmentCoverage,
  coverageByAnnouncementDate,
  formatAssessmentCoverage,
} from "../lib/announcements/assessment-coverage.js";
import {
  buildRuleAssignmentOccurrences,
  buildSchoolDayNumberByDate,
  numberRuleAssignmentOccurrences,
} from "../lib/announcements/assignment-rules.js";

const assessmentRule = {
  id: "assessment",
  course_id: null,
  label: "Assessment",
  cadence: "weekly",
  count_per_period: 1,
  settings: { weekdays: [5], weekly_assessment: true, no_meeting_shift: "before" },
};

// Mon 10/5 – Fri 10/30, A/B alternating; 10/12 and 10/13 off (3-day week); Fri 10/23 off.
function calendar() {
  const days = [];
  const start = Date.UTC(2026, 9, 5);
  let letter = "A";
  for (let offset = 0; offset < 26; offset += 1) {
    const date = new Date(start + offset * 86400000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const iso = date.toISOString().slice(0, 10);
    const off = ["2026-10-12", "2026-10-13", "2026-10-23"].includes(iso);
    days.push({ class_date: iso, day_type: off ? "off" : "instructional", ab_day: off ? null : letter });
    if (!off) letter = letter === "A" ? "B" : "A";
  }
  return days;
}

function occurrencesFor(course, overrides = []) {
  const calendarDays = calendar();
  return numberRuleAssignmentOccurrences(
    buildRuleAssignmentOccurrences({
      rules: [assessmentRule],
      course,
      calendarDays,
      markingPeriodRules: [],
      schoolDayNumberByDate: buildSchoolDayNumberByDate(calendarDays),
      overrides,
      includeSkipped: true,
    })
  );
}

const everyDay = { id: "daily", schedule_model: "daily" };
const aDay = { id: "a-day", schedule_model: "ab", ab_meeting_day: "A" };

test("a weekly assessment lands on the last day the class meets, skipping 3-day weeks", () => {
  assert.deepEqual(occurrencesFor(everyDay).map((item) => item.assignment_date), [
    "2026-10-09",
    // 10/12–10/16 has only 3 school days: no assessment.
    "2026-10-22", // Friday off, 4 school days: Thursday.
    "2026-10-30",
  ]);
  // A days that week fall on 10/19 and 10/21, so the A class is assessed Wednesday.
  assert.deepEqual(occurrencesFor(aDay).map((item) => item.assignment_date), ["2026-10-09", "2026-10-21", "2026-10-30"]);
});

const planRows = [
  ["2026-10-05", "1.01"], ["2026-10-06", "1.02"], ["2026-10-07", "1.02"], ["2026-10-08", "1.03"],
  ["2026-10-09", "1.04"], ["2026-10-14", "1.05"], ["2026-10-15", "Review 1.01-1.05"], ["2026-10-16", "1.06"],
  ["2026-10-19", "1.07"], ["2026-10-20", "1.08"], ["2026-10-21", "1.09"], ["2026-10-22", "1.10"],
  ["2026-10-26", "2.01"], ["2026-10-29", "2.02"], ["2026-10-30", "2.03"],
].map(([class_date, code]) => ({ class_date, lesson_slot: 1, code }));

test("each assessment covers from the previous assessment day up to, not including, its own day", () => {
  const coverage = buildAssessmentCoverage({ rules: [assessmentRule], occurrences: occurrencesFor(everyDay), planRows });
  assert.deepEqual(
    coverage.map((entry) => [entry.label, entry.date, entry.codes.join(" ")]),
    [
      ["Assessment 1.1", "2026-10-09", "1.01 1.02 1.03"],
      // The 3-day week rolls in; reviews are left out; Friday 10/9's lesson is included.
      ["Assessment 1.2", "2026-10-22", "1.04 1.05 1.06 1.07 1.08 1.09"],
      ["Assessment 1.3", "2026-10-30", "1.10 2.01 2.02"],
    ]
  );
  assert.equal(formatAssessmentCoverage(coverage[2]), "Assessment 1.3 (Fri 10/30) covers: 1.10, 2.01, 2.02");
});

test("a skipped assessment rolls its lessons into the next one", () => {
  const coverage = buildAssessmentCoverage({
    rules: [assessmentRule],
    occurrences: occurrencesFor(everyDay, [
      { rule_id: "assessment", course_id: "daily", original_date: "2026-10-22", assignment_date: "2026-10-22", is_skipped: true },
    ]),
    planRows,
  });
  assert.deepEqual(coverage.map((entry) => entry.date), ["2026-10-09", "2026-10-30"]);
  assert.equal(coverage[1].codes.join(" "), "1.04 1.05 1.06 1.07 1.08 1.09 1.10 2.01 2.02");
});

test("rules not marked as the weekly assessment produce no coverage", () => {
  assert.deepEqual(
    buildAssessmentCoverage({
      rules: [{ ...assessmentRule, settings: { weekdays: [5] } }],
      occurrences: occurrencesFor(everyDay),
      planRows,
    }),
    []
  );
});

test("announcements show coverage on the class meeting before the assessment and the assessment day", () => {
  const entry = { date: "2026-10-22", label: "Assessment 1.2", codes: [] };
  const byDate = coverageByAnnouncementDate([entry], ["2026-10-16", "2026-10-20", "2026-10-22", "2026-10-26"]);
  assert.deepEqual([...byDate.keys()], ["2026-10-20", "2026-10-22"]);
});
