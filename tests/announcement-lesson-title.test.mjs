import assert from "node:assert/strict";
import test from "node:test";
import { formatAnnouncementLessonTitle } from "../lib/announcements/lesson-title.js";

const lessonById = new Map([
  ["pizza", {
    source_lesson_code: "2.01",
    title: "Planning a Pizza Party",
  }],
  ["expressions", {
    source_lesson_code: "2.02",
    title: "Equivalent Expressions",
  }],
]);

test("single-lesson announcements include the curriculum lesson number", () => {
  assert.equal(
    formatAnnouncementLessonTitle({
      rowsForDate: [{ lesson_id: "pizza" }],
      lessonById,
      fallback: "No lesson scheduled",
    }),
    "2.01: Planning a Pizza Party"
  );
});

test("two-lesson announcements include both curriculum lesson numbers", () => {
  assert.equal(
    formatAnnouncementLessonTitle({
      rowsForDate: [
        { lesson_id: "pizza" },
        { lesson_id: "expressions" },
      ],
      lessonById,
      fallback: "No lesson scheduled",
    }),
    "Lesson 1: 2.01: Planning a Pizza Party\nLesson 2: 2.02: Equivalent Expressions"
  );
});

test("announcement lesson labels do not duplicate codes already in titles", () => {
  assert.equal(
    formatAnnouncementLessonTitle({
      rowsForDate: [{ lesson_id: "review" }],
      lessonById: new Map([["review", {
        source_lesson_code: "Review 2.03-2.04",
        title: "Review 2.03-2.04",
      }]]),
      fallback: "No lesson scheduled",
    }),
    "Review 2.03-2.04"
  );
});
