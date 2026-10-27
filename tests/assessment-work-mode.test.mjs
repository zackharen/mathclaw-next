import test from "node:test";
import assert from "node:assert/strict";
import {
  questionWorkMode,
  needsPaperReview,
  safeQuestion,
} from "../lib/assessments/core.js";
import { makeQuestion, assessmentVariation } from "../lib/assessments/bank.js";
test("work defaults and safe student fields preserve teacher selection without keys", () => {
  assert.equal(questionWorkMode({}), "paper");
  for (const mode of ["paper", "typed", "either"]) {
    const q = { ...makeQuestion("linear", 3, 42, 0), work_mode: mode };
    assert.equal(questionWorkMode(q), mode);
    assert.equal(safeQuestion(q).work_mode, mode);
    assert.equal(safeQuestion(q).answer, undefined);
    assert.equal(assessmentVariation(q, "fresh").work_mode, mode);
  }
});
test("paper review gate respects explicit new formats and legacy snapshots", () => {
  assert.equal(needsPaperReview({ questions: [{ work_mode: "paper" }] }), true);
  assert.equal(
    needsPaperReview({ questions: [{ work_mode: "either" }] }),
    true,
  );
  assert.equal(
    needsPaperReview({ questions: [{ work_mode: "typed" }] }),
    false,
  );
  assert.equal(needsPaperReview({ questions: [{}] }), false);
  assert.equal(
    needsPaperReview({
      questions: [{ work_mode: "paper" }],
      workReview: { at: "2026-10-27" },
    }),
    false,
  );
});
