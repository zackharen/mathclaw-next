import { integerPracticeEngine, numberCompareEngine } from "@/lib/question-engine/generators";
import { pickOne } from "@/lib/question-engine/core";

const SHOWDOWN_STYLES = [
  {
    slug: "counter_cadet",
    label: "Counter Cadet",
    intro: "A steady starter rival who leaves openings after every clean combo.",
  },
  {
    slug: "clockwork_crusher",
    label: "Clockwork Crusher",
    intro: "A rhythm-heavy rival who punishes hesitation and rewards calm answers.",
  },
  {
    slug: "mirror_mischief",
    label: "Mirror Mischief",
    intro: "A trickier rival built for mixed review and surprise swings.",
  },
];

function buildIntegerPrompt(level) {
  const question = integerPracticeEngine.buildQuestion({
    level: Math.max(1, Number(level || 1)),
    twoDigit: Number(level || 1) >= 3,
  });

  return {
    type: "integer",
    prompt: `${question.a} ${question.op} ${question.b}`,
    answer: question.answer,
    choices: integerPracticeEngine.buildChoices(question, 4),
    formatChoice(choice) {
      return String(choice);
    },
    checkAnswer(choice) {
      return Number(choice) === question.answer;
    },
    explanation: `The correct answer was ${question.answer}.`,
  };
}

function buildComparisonPrompt(level) {
  const settings = {
    decimals: Number(level || 1) >= 3 ? [1, 2] : [1],
    positiveNegative: true,
    fractions: Number(level || 1) >= 4,
    squareRoots: Number(level || 1) >= 6,
  };
  let left = numberCompareEngine.buildQuestion(settings);
  let right = numberCompareEngine.buildQuestion(settings);

  while (Math.abs(left.value - right.value) < 0.001) {
    right = numberCompareEngine.buildQuestion(settings);
  }

  const answer = left.value > right.value ? "left" : "right";

  return {
    type: "comparison",
    prompt: "Pick the stronger value before your rival swings.",
    leftLabel: left.label,
    rightLabel: right.label,
    answer,
    choices: ["left", "right"],
    formatChoice(choice) {
      return choice === "left" ? left.label : right.label;
    },
    checkAnswer(choice) {
      return choice === answer;
    },
    explanation: `${answer === "left" ? left.label : right.label} was stronger.`,
  };
}

export function listShowdownStyles() {
  return SHOWDOWN_STYLES;
}

export function buildShowdownPrompt(level = 1) {
  const builders = [buildIntegerPrompt];
  if (Number(level || 1) >= 2) builders.push(buildComparisonPrompt);
  return pickOne(builders)(level);
}

export function initialShowdownState(style = "counter_cadet") {
  return {
    style,
    round: 1,
    playerHp: 100,
    rivalHp: 100,
    combo: 0,
    correctAnswers: 0,
    attempts: 0,
    knockdowns: 0,
  };
}

export function applyShowdownAnswer(state, correct) {
  const nextAttempts = state.attempts + 1;
  const nextCombo = correct ? state.combo + 1 : 0;
  const playerDamage = correct ? 0 : 14;
  const rivalDamage = correct ? 12 + Math.min(nextCombo, 4) * 4 : 0;
  const nextPlayerHp = Math.max(0, state.playerHp - playerDamage);
  const nextRivalHp = Math.max(0, state.rivalHp - rivalDamage);
  const knockdown = correct && nextRivalHp === 0;
  const nextRound = knockdown ? state.round + 1 : state.round;

  return {
    ...state,
    round: nextRound,
    playerHp: knockdown ? Math.max(70, nextPlayerHp) : nextPlayerHp,
    rivalHp: knockdown ? 100 : nextRivalHp,
    combo: knockdown ? 0 : nextCombo,
    correctAnswers: state.correctAnswers + (correct ? 1 : 0),
    attempts: nextAttempts,
    knockdowns: state.knockdowns + (knockdown ? 1 : 0),
    result:
      nextPlayerHp <= 0
        ? "lost"
        : state.knockdowns + (knockdown ? 1 : 0) >= 3
          ? "won"
          : "active",
  };
}

export function showdownScore(state) {
  if (!state) return 0;
  const accuracy = state.attempts > 0 ? state.correctAnswers / state.attempts : 0;
  return Math.round(
    state.correctAnswers * 12 +
      state.knockdowns * 120 +
      state.playerHp +
      accuracy * 100
  );
}
