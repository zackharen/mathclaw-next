import { buildEquationNode, buildIntegerNode, buildLabelNode } from "@/lib/math-display";
import { integerPracticeEngine } from "@/lib/question-engine/generators";
import { buildSpiralReviewQuestion } from "@/lib/question-engine/spiral-review";
import { numberCompareEngine } from "@/lib/question-engine/generators";

const SKILL_BUILDER_TARGETS = [
  {
    slug: "integers",
    label: "Integer Builder",
    description: "Build confidence with signed-number addition and subtraction.",
    buildQuestion(level = 1) {
      const question = integerPracticeEngine.buildQuestion({
        level: Math.max(1, Number(level || 1)),
        twoDigit: Number(level || 1) >= 4,
      });
      return {
        kind: "multiple_choice",
        prompt: `${question.a} ${question.op} ${question.b}`,
        promptNode: buildEquationNode(question.a, question.op, question.b, {
          includeEquals: true,
          includeUnknown: true,
        }),
        answer: question.answer,
        choices: integerPracticeEngine.buildChoices(question, 4),
        formatChoice(choice) {
          return String(choice);
        },
        formatChoiceNode(choice) {
          return buildIntegerNode(choice);
        },
        checkAnswer(choice) {
          return Number(choice) === question.answer;
        },
        explanation: `The correct answer was ${question.answer}.`,
      };
    },
  },
  {
    slug: "comparison",
    label: "Number Comparison Builder",
    description: "Train students to compare tricky values quickly and accurately.",
    buildQuestion(level = 1) {
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
        kind: "comparison",
        prompt: "Which value is greater?",
        leftLabel: left.label,
        rightLabel: right.label,
        leftNode: buildLabelNode(left.label),
        rightNode: buildLabelNode(right.label),
        answer,
        choices: ["left", "right"],
        formatChoice(choice) {
          return choice === "left" ? left.label : right.label;
        },
        formatChoiceNode(choice) {
          return buildLabelNode(choice === "left" ? left.label : right.label);
        },
        checkAnswer(choice) {
          return choice === answer;
        },
        explanation: `${answer === "left" ? left.label : right.label} is greater.`,
      };
    },
  },
  {
    slug: "mixed_review",
    label: "Mixed Review Builder",
    description: "Cycle through mixed math practice to strengthen flexibility.",
    buildQuestion(level = 1) {
      const focus = Number(level || 1) >= 4 ? "mixed" : "integers";
      return buildSpiralReviewQuestion(focus);
    },
  },
];

export function listSkillBuilderTargets() {
  return SKILL_BUILDER_TARGETS.map((target) => ({
    slug: target.slug,
    label: target.label,
    description: target.description,
  }));
}

export function buildSkillBuilderQuestion(target = "integers", level = 1) {
  const selected =
    SKILL_BUILDER_TARGETS.find((item) => item.slug === target) || SKILL_BUILDER_TARGETS[0];
  return selected.buildQuestion(level);
}
