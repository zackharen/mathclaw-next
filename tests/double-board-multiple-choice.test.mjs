import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDoubleBoardMultipleChoiceOptions,
  formatDoubleBoardAnswer,
} from "../lib/question-engine/double-board.js";

function formatChoices(choices, metadata) {
  return choices.map((choice) => formatDoubleBoardAnswer(choice, metadata));
}

test("percent increase multiple choice includes correct, opposite, decimal percent, and one random choice", () => {
  const metadata = {
    answerFormat: "multiplier_hundredths",
    boardType: "percent_change_multipliers",
    percentValue: 94,
    direction: "increase",
  };
  const choices = buildDoubleBoardMultipleChoiceOptions({
    correctAnswer: 194,
    operand1: 94,
    metadata,
  });
  const formattedChoices = formatChoices(choices, metadata);

  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size, 4);
  assert.equal(formattedChoices.includes("1.94"), true);
  assert.equal(formattedChoices.includes("0.06"), true);
  assert.equal(formattedChoices.includes("0.94"), true);
  assert.equal(formattedChoices.every((choice) => /^(?:0|1)\.\d{2}$/.test(choice)), true);
});

test("percent decrease multiple choice includes correct, opposite, decimal percent, and one random choice", () => {
  const metadata = {
    answerFormat: "multiplier_hundredths",
    boardType: "percent_change_multipliers",
    percentValue: 94,
    direction: "decrease",
  };
  const choices = buildDoubleBoardMultipleChoiceOptions({
    correctAnswer: 6,
    operand1: 94,
    metadata,
  });
  const formattedChoices = formatChoices(choices, metadata);

  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size, 4);
  assert.equal(formattedChoices.includes("0.06"), true);
  assert.equal(formattedChoices.includes("1.94"), true);
  assert.equal(formattedChoices.includes("0.94"), true);
  assert.equal(formattedChoices.every((choice) => /^(?:0|1)\.\d{2}$/.test(choice)), true);
});

test("decimal percent multiple choice uses ten-thousandths scale without duplicates", () => {
  const metadata = {
    answerFormat: "multiplier_tenthousandths",
    boardType: "percent_change_multipliers",
    percentValue: 12.34,
    direction: "increase",
  };
  const choices = buildDoubleBoardMultipleChoiceOptions({
    correctAnswer: 11234,
    operand1: 12.34,
    metadata,
  });
  const formattedChoices = formatChoices(choices, metadata);

  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size, 4);
  assert.equal(formattedChoices.includes("1.1234"), true);
  assert.equal(formattedChoices.includes("0.8766"), true);
  assert.equal(formattedChoices.includes("0.1234"), true);
  assert.equal(formattedChoices.every((choice) => /^(?:0|1)\.\d{4}$/.test(choice)), true);
});
