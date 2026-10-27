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

test("applyLessonEdits inserts custom lessons and replays switches in order", async () => {
  const { applyLessonEdits } = await import("../lib/planning/lesson-swaps.js");
  const custom = [{ id: "x" }, { id: "y" }];
  assert.equal(ids(applyLessonEdits(lessons, [{ insert: "x", before: "c" }], custom)), "abxcd");
  // A switch made after the insert can move the custom lesson.
  assert.equal(ids(applyLessonEdits(lessons, [{ insert: "x", before: "c" }, ["x", "a"]], custom)), "xbacd");
  // Missing anchor goes to the end; unknown or duplicate inserts are ignored.
  assert.equal(ids(applyLessonEdits(lessons, [{ insert: "y", before: "gone" }, { insert: "y", before: "a" }, { insert: "z", before: "a" }], custom)), "abcdy");
});

test("removeCustomLessonEdits drops the lesson and re-anchors lessons placed before it", async () => {
  const { applyLessonEdits, removeCustomLessonEdits } = await import("../lib/planning/lesson-swaps.js");
  const edits = [{ insert: "x", before: "c" }, { insert: "y", before: "x" }, ["x", "a"], ["b", "d"]];
  const next = removeCustomLessonEdits(edits, "x");
  assert.deepEqual(next, [{ insert: "y", before: "c" }, ["b", "d"]]);
  assert.equal(ids(applyLessonEdits(lessons, next, [{ id: "y" }])), "adycb");
});
