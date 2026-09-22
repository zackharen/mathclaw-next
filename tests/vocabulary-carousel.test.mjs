import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibleVocabulary,
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
