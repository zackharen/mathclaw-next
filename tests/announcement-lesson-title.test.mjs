import assert from "node:assert/strict";
import test from "node:test";
import { buildAnnouncementCurriculum } from "../lib/announcements/lesson-title.js";

const template = `Header
{lesson_title}
{objective}
{standards}
Footer`;

const lessonById = new Map([
  ["limits", {
    source_lesson_code: "1.02",
    title: "Defining Limits (Part 2)",
    objective: "Let's find limits from graphs and tables.",
  }],
  ["behavior", {
    source_lesson_code: "1.03",
    title: "Analyzing Function Behavior using Limits",
    objective: "Let's describe asymptotes using limit notation.",
  }],
]);

const standardsByLesson = new Map([
  ["limits", ["TOPIC1.3", "F-IF.C.7"]],
  ["behavior", ["TOPIC1.4", "F-IF.C.9"]],
]);

function renderCurriculum(rowsForDate, customTemplate = template) {
  const result = buildAnnouncementCurriculum({
    template: customTemplate,
    rowsForDate,
    lessonById,
    standardsByLesson,
    fallback: "No lesson scheduled",
  });
  let output = result.template;
  for (const [key, value] of Object.entries(result.values)) {
    output = output.replaceAll(`{${key}}`, value);
  }
  return output;
}

test("single-lesson announcements include the number, objective, and standards", () => {
  assert.equal(
    renderCurriculum([{ lesson_id: "limits" }]),
    `Header
1.02: Defining Limits (Part 2)
Let's find limits from graphs and tables.
TOPIC1.3, F-IF.C.7
Footer`
  );
});

test("two-lesson announcements repeat complete curriculum blocks without slot labels", () => {
  assert.equal(
    renderCurriculum([
      { lesson_id: "limits" },
      { lesson_id: "behavior" },
    ]),
    `Header
1.02: Defining Limits (Part 2)
Let's find limits from graphs and tables.
TOPIC1.3, F-IF.C.7
1.03: Analyzing Function Behavior using Limits
Let's describe asymptotes using limit notation.
TOPIC1.4, F-IF.C.9
Footer`
  );
});

test("labeled custom templates repeat their curriculum labels for each lesson", () => {
  assert.equal(
    renderCurriculum(
      [{ lesson_id: "limits" }, { lesson_id: "behavior" }],
      `Header
Lesson: {lesson_title}
Objective: {objective}
Standards: {standards}
Footer`
    ),
    `Header
Lesson: 1.02: Defining Limits (Part 2)
Objective: Let's find limits from graphs and tables.
Standards: TOPIC1.3, F-IF.C.7
Lesson: 1.03: Analyzing Function Behavior using Limits
Objective: Let's describe asymptotes using limit notation.
Standards: TOPIC1.4, F-IF.C.9
Footer`
  );
});

test("announcement lesson labels do not duplicate codes already in titles", () => {
  const result = buildAnnouncementCurriculum({
    template,
    rowsForDate: [{ lesson_id: "review" }],
    lessonById: new Map([["review", {
      source_lesson_code: "Review 2.03-2.04",
      title: "Review 2.03-2.04",
      objective: "Review the unit.",
    }]]),
    standardsByLesson: new Map([["review", []]]),
    fallback: "No lesson scheduled",
  });
  assert.equal(result.values.lesson_title, "Review 2.03-2.04");
});
