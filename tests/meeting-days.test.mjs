import assert from "node:assert/strict";
import test from "node:test";
import { courseShowsCalendarDay } from "../lib/planning/meeting-days.js";

const everyDay = { schedule_model: "every_day" };
const aClass = { schedule_model: "ab", ab_meeting_day: "A" };
const bClass = { schedule_model: "ab", ab_meeting_day: "B" };
const bothDays = { schedule_model: "ab", ab_meeting_day: null };

test("every-day classes show weekdays and never weekends", () => {
  assert.equal(courseShowsCalendarDay(everyDay, { class_date: "2026-09-11", day_type: "instructional" }), true);
  assert.equal(courseShowsCalendarDay(everyDay, { class_date: "2026-09-12", day_type: "off" }), false);
});

test("A/B classes show only their own letter day", () => {
  const aDay = { class_date: "2026-09-15", day_type: "instructional", ab_day: "A" };
  const bDay = { class_date: "2026-09-14", day_type: "instructional", ab_day: "B" };
  assert.equal(courseShowsCalendarDay(aClass, aDay), true);
  assert.equal(courseShowsCalendarDay(aClass, bDay), false);
  assert.equal(courseShowsCalendarDay(bClass, bDay), true);
  assert.equal(courseShowsCalendarDay(bothDays, aDay), true);
  assert.equal(courseShowsCalendarDay(bothDays, bDay), true);
  assert.equal(courseShowsCalendarDay(aClass, { class_date: "2026-09-16", day_type: "instructional", ab_day: null }), false);
});

test("A/B classes still show weekday days off, but not weekends", () => {
  assert.equal(courseShowsCalendarDay(bClass, { class_date: "2026-09-21", day_type: "off", ab_day: null }), true);
  assert.equal(courseShowsCalendarDay(bClass, { class_date: "2026-09-13", day_type: "off", ab_day: null }), false);
});
