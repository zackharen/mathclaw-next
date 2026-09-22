import assert from "node:assert/strict";
import test from "node:test";
import { eligibleVocabulary, shuffledVocabulary, vocabularyCarouselIndex } from "../lib/projector/vocabulary-carousel.mjs";

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
