import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksOverlap,
  findActiveBellScheduleBlock,
  normalizeBellScheduleBlockInput,
  normalizeBellScheduleTypeName,
  parseTimeOfDayToMinutes,
} from "../lib/bell-schedules/constants.js";

test("bell schedule type names are trimmed and collapsed", () => {
  assert.equal(normalizeBellScheduleTypeName("  Full   Day  "), "Full Day");
  assert.equal(normalizeBellScheduleTypeName(""), "");
});

test("times of day parse from a picker value and from a DB time column", () => {
  assert.equal(parseTimeOfDayToMinutes("09:15"), 555);
  assert.equal(parseTimeOfDayToMinutes("09:15:00"), 555);
  assert.equal(parseTimeOfDayToMinutes("23:59"), 1439);
  assert.equal(parseTimeOfDayToMinutes("24:00"), null);
  assert.equal(parseTimeOfDayToMinutes("not a time"), null);
});

test("a bell schedule block requires a class and end after start", () => {
  assert.match(
    normalizeBellScheduleBlockInput({ courseId: "", startTime: "09:00", endTime: "09:45" }).error,
    /Choose a class/
  );
  assert.match(
    normalizeBellScheduleBlockInput({ courseId: "course-1", startTime: "09:45", endTime: "09:00" }).error,
    /End time must be after start time/
  );
  assert.match(
    normalizeBellScheduleBlockInput({ courseId: "course-1", startTime: "09:45", endTime: "09:45" }).error,
    /End time must be after start time/
  );
  assert.deepEqual(
    normalizeBellScheduleBlockInput({ courseId: "course-1", startTime: "09:00", endTime: "09:45", label: "  Period 3  " }),
    { values: { course_id: "course-1", start_time: "09:00", end_time: "09:45", label: "Period 3" } }
  );
});

test("overlapping blocks in the same schedule type are rejected", () => {
  const existing = [
    { id: "a", start_time: "08:00:00", end_time: "08:45:00" },
    { id: "b", start_time: "08:45:00", end_time: "09:30:00" },
  ];
  assert.equal(blocksOverlap(existing, { startTime: "08:20", endTime: "08:50" }), true);
  assert.equal(blocksOverlap(existing, { startTime: "08:45", endTime: "09:30" }), true);
  assert.equal(blocksOverlap(existing, { startTime: "09:30", endTime: "10:00" }), false);
  // Editing block "a" itself to the same range it already has is not a self-conflict.
  assert.equal(blocksOverlap(existing, { id: "a", startTime: "08:00", endTime: "08:45" }), false);
});

test("the active block is whichever one's range contains the current time", () => {
  const blocks = [
    { id: "period-1", start_time: "08:00:00", end_time: "08:45:00" },
    { id: "period-2", start_time: "08:50:00", end_time: "09:35:00" },
  ];
  assert.equal(findActiveBellScheduleBlock(blocks, 8 * 60 + 20)?.id, "period-1");
  assert.equal(findActiveBellScheduleBlock(blocks, 8 * 60 + 47)?.id, undefined);
  assert.equal(findActiveBellScheduleBlock(blocks, 8 * 60 + 50)?.id, "period-2");
  assert.equal(findActiveBellScheduleBlock(blocks, 8 * 60 + 45)?.id, undefined); // end is exclusive
});
