import test from "node:test";
import assert from "node:assert/strict";
import { mathPrintSegments } from "../lib/assessments/math-print.js";
import { spiralLast } from "../lib/assessments/core.js";

test("MathPrint recognizes full polynomial equations and derivative notation without changing prose", () => {
  assert.deepEqual(mathPrintSegments("Let f(x) = 3x² − 2x + 1. Find f′(x)."), [
    { math: false, value: "Let " },
    { math: true, value: "f(x) = 3x^{2} - 2x + 1" },
    { math: false, value: ". Find " },
    { math: true, value: "f^{\\prime}(x)" },
    { math: false, value: "." },
  ]);
});
test("MathPrint stacks fractions, respects explicit LaTeX, and preserves currency and named inputs", () => {
  assert.equal(mathPrintSegments("Use 3/4.")[1].value, "\\frac{3}{4}");
  assert.deepEqual(mathPrintSegments("Use $\\frac{a}{b}$ or $$x^2=4$$."), [
    { math: false, value: "Use " },
    { math: true, value: "\\frac{a}{b}" },
    { math: false, value: " or " },
    { math: true, display: true, value: "x^2=4" },
    { math: false, value: "." },
  ]);
  for (const text of [
    "The cost is $5 and $10 per hour.",
    "A(Sam) is Sam’s locker.",
    "1 input; 1 output; 1 explanation.",
  ])
    assert.deepEqual(mathPrintSegments(text), [{ math: false, value: text }]);
});
test("standard spiral ordering is stable, nonmutating, and leaves adaptive pools alone", () => {
  const a = { id: "a" },
    s = { id: "spiral", spiral: true },
    b = { id: "b" };
  const input = [s, a, b];
  assert.deepEqual(
    spiralLast(input).map((q) => q.id),
    ["a", "b", "spiral"],
  );
  assert.equal(spiralLast(input)[2], s);
  assert.deepEqual(input, [s, a, b]);
  assert.deepEqual(spiralLast(input, "adaptive"), input);
  assert.deepEqual(spiralLast(input, "spiral"), input);
});

test("automatic fraction layout does not reinterpret ambiguous algebraic division", () => {
  for (const value of ["3/4x", "3/x²", "f(x)/h"]) {
    const rendered = mathPrintSegments(value)
      .map((p) => p.value)
      .join("");
    assert.equal(rendered.includes("\\frac"), false);
  }
  assert.equal(mathPrintSegments("x >= 3")[0].value, "x \\ge  3");
});
