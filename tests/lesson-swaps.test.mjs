import assert from "node:assert/strict";
import test from "node:test";
import { addLessonSwap, applyLessonSwaps } from "../lib/planning/lesson-swaps.js";

const lessons = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list) => list.map((lesson) => lesson.id).join("");

test("applyLessonSwaps switches two lessons and keeps the rest in order", () => {
  assert.equal(ids(applyLessonSwaps(lessons, [["b", "d"]])), "adcb");
  assert.equal(ids(lessons), "abcd");
});

test("applyLessonSwaps applies switches in order and ignores unknown lessons", () => {
  assert.equal(ids(applyLessonSwaps(lessons, [["a", "b"], ["a", "c"]])), "bcad");
  assert.equal(ids(applyLessonSwaps(lessons, [["a", "zzz"], null, ["c", "c"]])), "abcd");
  assert.equal(ids(applyLessonSwaps(lessons, null)), "abcd");
});

test("addLessonSwap cancels an immediate switch back", () => {
  const once = addLessonSwap([], "a", "c");
  assert.deepEqual(once, [["a", "c"]]);
  assert.deepEqual(addLessonSwap(once, "c", "a"), []);
  assert.deepEqual(addLessonSwap(once, "b", "d"), [["a", "c"], ["b", "d"]]);
});
