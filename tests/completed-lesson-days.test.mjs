import assert from "node:assert/strict";
import test from "node:test";
import { splitLessonDaysForFold } from "../lib/planning/completed-days.js";

const day = (classDate) => ({ class_date: classDate });
const rows = (...statuses) => statuses.map((status) => ({ status }));
const dates = (list) => list.map((entry) => entry.class_date);

test("completed days and past no-lesson days fold; the first unfinished day leads", () => {
  const result = splitLessonDaysForFold({
    days: [day("2026-09-08"), day("2026-09-09"), day("2026-09-10"), day("2026-09-14")],
    rowsByDate: new Map([
      ["2026-09-08", rows("completed", "completed")],
      ["2026-09-10", rows("planned")],
      ["2026-09-14", rows("planned")],
    ]),
    todayIso: "2026-09-11",
  });
  assert.deepEqual(dates(result.foldedDays), ["2026-09-08", "2026-09-09"]);
  assert.deepEqual(dates(result.openDays), ["2026-09-10", "2026-09-14"]);
  assert.equal(result.nextClassDate, "2026-09-10");
});

test("a partly completed day is still the next class", () => {
  const result = splitLessonDaysForFold({
    days: [day("2026-09-08"), day("2026-09-10")],
    rowsByDate: new Map([
      ["2026-09-08", rows("completed", "planned")],
      ["2026-09-10", rows("planned")],
    ]),
    todayIso: "2026-09-11",
  });
  assert.deepEqual(dates(result.foldedDays), []);
  assert.equal(result.nextClassDate, "2026-09-08");
});

test("a future day off ahead of the next lesson stays visible", () => {
  const result = splitLessonDaysForFold({
    days: [day("2026-09-10"), day("2026-09-14"), day("2026-09-15")],
    rowsByDate: new Map([
      ["2026-09-10", rows("completed")],
      ["2026-09-15", rows("planned")],
    ]),
    todayIso: "2026-09-11",
  });
  assert.deepEqual(dates(result.foldedDays), ["2026-09-10"]);
  assert.deepEqual(dates(result.openDays), ["2026-09-14", "2026-09-15"]);
  assert.equal(result.nextClassDate, "2026-09-15");
});

test("days after the next lesson never fold, even if completed early", () => {
  const result = splitLessonDaysForFold({
    days: [day("2026-09-10"), day("2026-09-14")],
    rowsByDate: new Map([
      ["2026-09-10", rows("planned")],
      ["2026-09-14", rows("completed")],
    ]),
    todayIso: "2026-09-11",
  });
  assert.deepEqual(dates(result.foldedDays), []);
  assert.deepEqual(dates(result.openDays), ["2026-09-10", "2026-09-14"]);
});

test("with nothing left to teach, completed days fold and there is no next class", () => {
  const result = splitLessonDaysForFold({
    days: [day("2026-09-08"), day("2026-09-20")],
    rowsByDate: new Map([["2026-09-08", rows("completed")]]),
    todayIso: "2026-09-11",
  });
  assert.deepEqual(dates(result.foldedDays), ["2026-09-08"]);
  assert.deepEqual(dates(result.openDays), ["2026-09-20"]);
  assert.equal(result.nextClassDate, null);
});
