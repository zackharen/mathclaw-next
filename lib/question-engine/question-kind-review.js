import { pickOne } from "@/lib/question-engine/core";
import { integerPracticeEngine, numberCompareEngine } from "@/lib/question-engine/generators";

const QUESTION_KINDS = [
  { slug: "integer_equation", label: "Integer Equation" },
  { slug: "number_comparison", label: "Number Comparison" },
  { slug: "money_total", label: "Money Total" },
  { slug: "clock_reading", label: "Clock Reading" },
];

function buildMoneyPrompt() {
  const dollars = Math.floor(Math.random() * 3) + 1;
  const quarters = Math.floor(Math.random() * 4);
  const dimes = Math.floor(Math.random() * 4);
  const nickels = Math.floor(Math.random() * 3);
  const pennies = Math.floor(Math.random() * 5);

  return `How much money is shown: ${dollars} one-dollar bills, ${quarters} quarters, ${dimes} dimes, ${nickels} nickels, and ${pennies} pennies?`;
}

function buildClockPrompt() {
  const hour = Math.floor(Math.random() * 12) + 1;
  const minute = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55][Math.floor(Math.random() * 12)];
  return `What time does this clock show if the hour hand is near ${hour} and the minute hand points to ${minute}?`;
}

const QUESTION_KIND_BUILDERS = [
  {
    slug: "integer_equation",
    label: "Integer Equation",
    buildPrompt() {
      const question = integerPracticeEngine.buildQuestion({ level: 2, twoDigit: true });
      return `${question.a} ${question.op} ${question.b} = ?`;
    },
  },
  {
    slug: "number_comparison",
    label: "Number Comparison",
    buildPrompt() {
      const settings = {
        decimals: [1, 2],
        positiveNegative: true,
        fractions: true,
        squareRoots: true,
      };
      let left = numberCompareEngine.buildQuestion(settings);
      let right = numberCompareEngine.buildQuestion(settings);

      while (Math.abs(left.value - right.value) < 0.001) {
        right = numberCompareEngine.buildQuestion(settings);
      }

      return `Which number is greater: ${left.label} or ${right.label}?`;
    },
  },
  {
    slug: "money_total",
    label: "Money Total",
    buildPrompt: buildMoneyPrompt,
  },
  {
    slug: "clock_reading",
    label: "Clock Reading",
    buildPrompt: buildClockPrompt,
  },
];

export function listQuestionKinds() {
  return QUESTION_KINDS;
}

export function buildQuestionKindReviewQuestion(focus = "mixed") {
  const builders =
    focus === "mixed"
      ? QUESTION_KIND_BUILDERS
      : QUESTION_KIND_BUILDERS.filter((builder) => builder.slug === focus);
  const selected = pickOne(builders) || QUESTION_KIND_BUILDERS[0];

  return {
    prompt: selected.buildPrompt(),
    answer: selected.slug,
    choices: QUESTION_KINDS.map((kind) => kind.slug),
    formatChoice(choice) {
      return QUESTION_KINDS.find((kind) => kind.slug === choice)?.label || choice;
    },
    checkAnswer(choice) {
      return choice === selected.slug;
    },
    explanation: `This one is a ${selected.label}.`,
  };
}
