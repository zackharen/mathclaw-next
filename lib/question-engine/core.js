export function randomInt(max) {
  return Math.floor(Math.random() * max);
}

export function pickOne(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return list[randomInt(list.length)];
}

export function shuffle(list) {
  const next = [...(list || [])];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

export function buildUniqueOptions(correctValue, buildCandidate, count) {
  const options = new Set([correctValue]);

  while (options.size < count) {
    options.add(buildCandidate());
  }

  return shuffle([...options]);
}

export function createQuestionEngine(definition) {
  return {
    id: definition.id,
    label: definition.label,
    buildQuestion: definition.buildQuestion,
    buildChoices: definition.buildChoices || null,
  };
}
