import assert from "node:assert/strict";
import test from "node:test";
import { splitMathSegments } from "../lib/vocabulary/math-text.mjs";

test("plain definitions stay a single text segment", () => {
  assert.deepEqual(splitMathSegments("The process of finding a derivative."), [
    { math: false, value: "The process of finding a derivative." },
  ]);
  assert.deepEqual(splitMathSegments(""), []);
});

test("inline $...$ becomes math segments between text", () => {
  assert.deepEqual(splitMathSegments("The function $y = e^x$; its derivative equals itself."), [
    { math: false, value: "The function " },
    { math: true, value: "y = e^x" },
    { math: false, value: "; its derivative equals itself." },
  ]);
  assert.deepEqual(splitMathSegments("$[a, b]$"), [{ math: true, value: "[a, b]" }]);
});

test("escaped, unmatched, and empty dollar signs stay text", () => {
  assert.deepEqual(splitMathSegments("Costs \\$5 each"), [{ math: false, value: "Costs $5 each" }]);
  assert.deepEqual(splitMathSegments("Costs $5 each"), [{ math: false, value: "Costs $5 each" }]);
  assert.deepEqual(splitMathSegments("a $$ b"), [{ math: false, value: "a $$ b" }]);
});
