import test from "node:test";
import assert from "node:assert/strict";

import {
  buildABMap,
  buildMarkingPeriodWeekLabels,
  formatCalendarScheduleType,
  isCalendarWeekStart,
  isGraceDay,
  normalizeCalendarDayType,
} from "../lib/school-calendar.js";

function weekdaysBetween(start, end) {
  const dates = [];
  for (let date = new Date(`${start}T00:00:00Z`); date <= new Date(`${end}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  return dates;
}

function schoolDayNumbers(dates, offDates = []) {
  const off = new Set(offDates);
  const numbers = new Map();
  let dayNumber = 0;
  for (const date of dates) {
    if (off.has(date)) continue;
    dayNumber += 1;
    numbers.set(date, dayNumber);
  }
  return numbers;
}

test("calendar week dividers identify Mondays without timezone ambiguity", () => {
  assert.equal(isCalendarWeekStart("2026-11-02"), true);
  assert.equal(isCalendarWeekStart("2026-10-30"), false);
  assert.equal(isCalendarWeekStart("2026-02-30"), false);
  assert.equal(isCalendarWeekStart("not-a-date"), false);
});

test("marking period weeks count only blocks with at least four school days", () => {
  const dates = weekdaysBetween("2026-09-02", "2026-09-18");
  const offDates = ["2026-09-07"];
  const schoolDayByDate = new Map(offDates.map((date) => [date, { day_type: "off" }]));
  const labels = buildMarkingPeriodWeekLabels({
    dates,
    schoolDayByDate,
    markingPeriods: [{ id: "q1", name: "Quarter 1", start_day_number: 1, end_day_number: 45 }],
    schoolDayNumberByDate: schoolDayNumbers(dates, offDates),
  });

  assert.deepEqual(Array.from(labels), [
    ["2026-09-07", { label: "Week 1", markingPeriod: "Quarter 1" }],
    ["2026-09-14", { label: "Week 2", markingPeriod: "Quarter 1" }],
  ]);
});

test("marking period week numbers restart when a new period begins on Tuesday", () => {
  const dates = weekdaysBetween("2026-10-12", "2026-10-30");
  const numbers = schoolDayNumbers(dates);
  const labels = buildMarkingPeriodWeekLabels({
    dates,
    schoolDayByDate: new Map(),
    markingPeriods: [
      { id: "q1", name: "Quarter 1", start_day_number: 1, end_day_number: 6 },
      { id: "q2", name: "Quarter 2", start_day_number: 7, end_day_number: 45 },
    ],
    schoolDayNumberByDate: numbers,
  });

  assert.deepEqual(Array.from(labels), [
    ["2026-10-12", { label: "Week 1", markingPeriod: "Quarter 1" }],
    ["2026-10-19", { label: "Week 1", markingPeriod: "Quarter 2" }],
    ["2026-10-26", { label: "Week 2", markingPeriod: "Quarter 2" }],
  ]);
});

test("off days have no A/B label and do not advance the rotation", () => {
  const dates = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const schoolDayByDate = new Map([
    ["2026-09-07", { day_type: "off" }],
  ]);

  assert.deepEqual(
    Array.from(buildABMap(dates, "2026-09-04", schoolDayByDate)),
    [
      ["2026-09-04", "A"],
      ["2026-09-07", "-"],
      ["2026-09-08", "B"],
      ["2026-09-09", "A"],
    ]
  );
});

test("dates before the configured A/B start remain unlabeled", () => {
  const dates = ["2026-09-02", "2026-09-03", "2026-09-04"];

  assert.deepEqual(
    Array.from(buildABMap(dates, "2026-09-03", new Map())),
    [
      ["2026-09-02", "-"],
      ["2026-09-03", "A"],
      ["2026-09-04", "B"],
    ]
  );
});

test("grace day is independent from the selected schedule type", () => {
  const halfGraceDay = { day_type: "half", is_grace_day: true };

  assert.equal(isGraceDay(halfGraceDay), true);
  assert.equal(formatCalendarScheduleType(halfGraceDay), "Half Day Schedule · Grace Day");
});

test("legacy grace-day rows normalize to full-day grace days", () => {
  const legacyDay = { day_type: "grace_day" };

  assert.equal(normalizeCalendarDayType(legacyDay.day_type), "instructional");
  assert.equal(isGraceDay(legacyDay), true);
  assert.equal(formatCalendarScheduleType(legacyDay), "Full Day Schedule · Grace Day");
});
