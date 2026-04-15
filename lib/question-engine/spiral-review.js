import { pickOne } from "@/lib/question-engine/core";
import { buildEquationNode, buildIntegerNode, buildLabelNode } from "@/lib/math-display";
import { integerPracticeEngine, numberCompareEngine } from "@/lib/question-engine/generators";

const SPIRAL_REVIEW_SKILLS = [
  {
    slug: "integers",
    label: "Integers",
    buildQuestion() {
      const question = integerPracticeEngine.buildQuestion({ level: 2, twoDigit: true });
      const choices = integerPracticeEngine.buildChoices(question, 4);
      return {
        skill: "integers",
        prompt: `${question.a} ${question.op} ${question.b}`,
        promptNode: buildEquationNode(question.a, question.op, question.b, {
          includeEquals: true,
          includeUnknown: true,
        }),
        answer: question.answer,
        choices,
        formatChoice(choice) {
          return String(choice);
        },
        formatChoiceNode(choice) {
          return buildIntegerNode(choice);
        },
        checkAnswer(value) {
          return Number(value) === question.answer;
        },
        explanation: `The correct answer was ${question.answer}.`,
      };
    },
  },
  {
    slug: "comparison",
    label: "Compare Numbers",
    buildQuestion() {
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

      const answer = left.value > right.value ? "left" : "right";

      return {
        skill: "comparison",
        prompt: "Which value is greater?",
        answer,
        leftLabel: left.label,
        rightLabel: right.label,
        leftNode: buildLabelNode(left.label),
        rightNode: buildLabelNode(right.label),
        choices: ["left", "right"],
        formatChoice(choice) {
          return choice === "left" ? left.label : right.label;
        },
        formatChoiceNode(choice) {
          return buildLabelNode(choice === "left" ? left.label : right.label);
        },
        checkAnswer(value) {
          return value === answer;
        },
        explanation: `${answer === "left" ? left.label : right.label} is greater.`,
      };
    },
  },
];

export function listSpiralReviewSkills() {
  return SPIRAL_REVIEW_SKILLS.map((skill) => ({
    slug: skill.slug,
    label: skill.label,
  }));
}

export function buildSpiralReviewQuestion(focus = "mixed") {
  const availableSkills =
    focus === "mixed"
      ? SPIRAL_REVIEW_SKILLS
      : SPIRAL_REVIEW_SKILLS.filter((skill) => skill.slug === focus);
  const selectedSkill = pickOne(availableSkills) || SPIRAL_REVIEW_SKILLS[0];
  return selectedSkill.buildQuestion();
}
