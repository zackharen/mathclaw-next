import assert from "node:assert/strict";
import test from "node:test";
import {
  carouselShowsObjectives,
  eligibleVocabulary,
  nextLessonDay,
  resolveScheduledStartIso,
  shuffledVocabulary,
  vocabularyCarouselIndex,
} from "../lib/projector/vocabulary-carousel.mjs";

test("completed lesson filter keeps a word associated with any completed lesson", () => {
  const resources = [{ id: "word-a" }, { id: "word-b" }, { id: "word-c" }];
  const associations = [
    { resource_id: "word-a", lesson_id: "lesson-1" },
    { resource_id: "word-a", lesson_id: "lesson-2" },
    { resource_id: "word-b", lesson_id: "lesson-3" },
  ];
  assert.deepEqual(eligibleVocabulary(resources, associations, ["lesson-2"], true), [resources[0]]);
  assert.deepEqual(eligibleVocabulary(resources, associations, [], false), resources.slice(0, 2));
});

test("each screen can receive a shuffled order and late joins pick the current slide", () => {
  const entries = ["A", "B", "C"];
  assert.deepEqual(shuffledVocabulary(entries, () => 0), ["B", "C", "A"]);
  assert.deepEqual(entries, ["A", "B", "C"]);
  assert.equal(vocabularyCarouselIndex("2026-01-01T00:00:00.000Z", 30, Date.parse("2026-01-01T00:01:05.000Z"), 3), 2);
  assert.equal(vocabularyCarouselIndex("2026-01-01T00:00:00.000Z", 30, Date.parse("2026-01-01T00:01:35.000Z"), 3), 0);
});

test("a carousel scheduled in the future stays on the first slide until it starts", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(vocabularyCarouselIndex("2026-01-01T00:05:00.000Z", 30, now, 3), 0);
});

test("a schedule time resolves to today's matching ISO timestamp", () => {
  const reference = new Date("2026-01-01T15:00:00");
  const resolved = resolveScheduledStartIso("16:30", reference);
  assert.equal(resolved.iso, new Date("2026-01-01T16:30:00").toISOString());
});

test("a schedule time rejects the past, now, and malformed input", () => {
  const reference = new Date("2026-01-01T15:00:00");
  assert.match(resolveScheduledStartIso("14:59", reference).error, /later today/);
  assert.match(resolveScheduledStartIso("15:00", reference).error, /later today/);
  assert.match(resolveScheduledStartIso("not a time", reference).error, /Choose a start time/);
  assert.match(resolveScheduledStartIso("", reference).error, /Choose a start time/);
});

test("the next lesson day is the earliest planned day on or after today, in slot order", () => {
  const rows = [
    { class_date: "2026-10-21", lesson_slot: 1, lesson_id: "old", status: "planned" },
    { class_date: "2026-10-22", lesson_slot: 1, lesson_id: "done", status: "completed" },
    { class_date: "2026-10-23", lesson_slot: 2, lesson_id: "b", status: "planned" },
    { class_date: "2026-10-23", lesson_slot: 1, lesson_id: "a", status: "planned" },
    { class_date: "2026-10-24", lesson_slot: 1, lesson_id: "later", status: "planned" },
    { class_date: "2026-10-22", lesson_slot: 2, lesson_id: "skip", status: "skipped" },
  ];
  const day = nextLessonDay(rows, "2026-10-22");
  assert.equal(day.date, "2026-10-23");
  assert.deepEqual(day.rows.map((row) => row.lesson_id), ["a", "b"]);
  assert.equal(nextLessonDay(rows, "2026-10-25"), null);
});

test("the objectives card sits on exactly one screen per tick and moves each tick", () => {
  const base = { startedAt: "2026-01-01T00:00:00.000Z", intervalSeconds: 30, objectives: { lessons: [{ objective: "x" }] } };
  const screens = [0, 1, 2].map((slot) => ({ ...base, objectivesSlot: slot, objectivesScreenCount: 3 }));
  for (let tick = 0; tick < 6; tick += 1) {
    const now = Date.parse(base.startedAt) + tick * 30000 + 1000;
    const showing = screens.map((screen) => carouselShowsObjectives(screen, now));
    assert.deepEqual(showing.map((value, slot) => (value ? slot : -1)).filter((slot) => slot >= 0), [tick % 3]);
  }
  const single = { ...base, objectivesSlot: 0, objectivesScreenCount: 1 };
  assert.equal(carouselShowsObjectives(single, Date.parse(base.startedAt) + 95000), true);
  assert.equal(carouselShowsObjectives({ ...base, objectives: null }, Date.now()), false);
});
