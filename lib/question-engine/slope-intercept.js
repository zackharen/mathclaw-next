const SLOPE_VALUES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const INTERCEPT_VALUES = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

function pickRandom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

export function buildSlopeInterceptRound(previousKey = "") {
  let slope = 0;
  let intercept = 0;
  let key = previousKey;

  while (key === previousKey) {
    slope = pickRandom(SLOPE_VALUES);
    intercept = pickRandom(INTERCEPT_VALUES);
    key = `${slope}:${intercept}`;
  }

  return { slope, intercept, key };
}
