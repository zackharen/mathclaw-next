const DENOMINATION_VALUES = {
  one: 100,
  quarter: 25,
  dime: 10,
  nickel: 5,
  penny: 1,
};

function randomCount(limit) {
  return Math.floor(Math.random() * (limit + 1));
}

function buildMoneyPile() {
  const pile = {
    one: randomCount(3),
    quarter: randomCount(4),
    dime: randomCount(4),
    nickel: randomCount(4),
    penny: randomCount(4),
  };
  const total = Object.entries(DENOMINATION_VALUES).reduce(
    (sum, [key, cents]) => sum + cents * pile[key],
    0
  );

  if (total === 0) {
    pile.quarter = 1;
    return { pile, total: 25 };
  }

  return { pile, total };
}

export function buildMoneyChoices(total, choiceCount = 4) {
  const options = new Set([total]);
  const shifts = [-55, -40, -30, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30, 40, 55];
  let attempts = 0;

  while (options.size < choiceCount && attempts < 200) {
    const shift = shifts[Math.floor(Math.random() * shifts.length)];
    options.add(Math.max(0, total + shift));
    attempts += 1;
  }

  let fallbackStep = 1;
  while (options.size < choiceCount) {
    options.add(Math.max(0, total + fallbackStep));
    if (options.size < choiceCount) {
      options.add(Math.max(0, total - fallbackStep));
    }
    fallbackStep += 1;
  }

  return [...options].sort(() => Math.random() - 0.5).slice(0, choiceCount);
}

export function buildMoneyQuestion(mode = "mixed", choiceCount = 4) {
  const selectedMode = mode === "mixed" ? (Math.random() > 0.5 ? "count" : "make") : mode;
  const generated = buildMoneyPile();

  return {
    mode: selectedMode,
    pile: generated.pile,
    total: generated.total,
    choices: buildMoneyChoices(generated.total, choiceCount),
  };
}
