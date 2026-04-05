import { buildUniqueOptions, createQuestionEngine, pickOne, randomInt } from "./core";

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y) {
    [x, y] = [y, x % y];
  }

  return x || 1;
}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function integerValue(allowNegative) {
  const value = allowNegative ? Math.floor(Math.random() * 41) - 20 : Math.floor(Math.random() * 21);
  return { label: String(value), value };
}

function decimalValue(places) {
  const raw = Math.random() * 40 - 20;
  const value = roundTo(raw, places);
  return { label: value.toFixed(places), value };
}

function fractionValue() {
  const numerator = Math.floor(Math.random() * 19) - 9 || 1;
  const denominator = Math.floor(Math.random() * 8) + 2;
  const divisor = gcd(numerator, denominator);

  return {
    label: `${numerator / divisor}/${denominator / divisor}`,
    value: numerator / denominator,
  };
}

function squareRootValue() {
  const inside = Math.floor(Math.random() * 90) + 2;
  return {
    label: `√${inside}`,
    value: Math.sqrt(inside),
  };
}

export const integerPracticeEngine = createQuestionEngine({
  id: "integer_practice",
  label: "Adding & Subtracting Integers",
  buildQuestion({ level = 1, twoDigit = false } = {}) {
    const limit = twoDigit ? Math.min(99, Math.max(10, 9 + level * 6)) : 9;
    const a = randomInt(limit * 2 + 1) - limit;
    const b = randomInt(limit * 2 + 1) - limit;
    const op = Math.random() > 0.5 ? "+" : "-";
    const answer = op === "+" ? a + b : a - b;

    return { a, b, op, answer };
  },
  buildChoices(question, count = 4) {
    return buildUniqueOptions(
      question.answer,
      () => {
        const offset = Math.floor(Math.random() * 13) - 6 || 1;
        return question.answer + offset;
      },
      count
    );
  },
});

export const numberCompareEngine = createQuestionEngine({
  id: "number_compare",
  label: "Which Number Is Bigger?",
  buildQuestion(settings) {
    const pool = [];

    if ((settings?.decimals || []).length > 0) pool.push("decimal");
    if (settings?.positiveNegative) pool.push("integer");
    if (settings?.fractions) pool.push("fraction");
    if (settings?.squareRoots) pool.push("root");

    const choice = pickOne(pool) || "integer";

    if (choice === "decimal") {
      const places = pickOne(settings.decimals) || 1;
      return decimalValue(places);
    }

    if (choice === "fraction") return fractionValue();
    if (choice === "root") return squareRootValue();
    return integerValue(Boolean(settings?.positiveNegative));
  },
});
