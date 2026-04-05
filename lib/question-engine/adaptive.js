export function clampLevel(level, minimum = 1, maximum = 10) {
  return Math.max(minimum, Math.min(maximum, Number(level || minimum)));
}

export function nextAdaptiveLevel({
  currentLevel,
  correct,
  streak = 0,
  riseAfterStreak = 1,
  fallBy = 1,
  minLevel = 1,
  maxLevel = 10,
}) {
  const normalizedLevel = clampLevel(currentLevel, minLevel, maxLevel);

  if (correct) {
    const levelGain = streak >= riseAfterStreak ? 1 : 0;
    return clampLevel(normalizedLevel + levelGain, minLevel, maxLevel);
  }

  return clampLevel(normalizedLevel - fallBy, minLevel, maxLevel);
}

export function buildAdaptiveSnapshot({
  level,
  streak = 0,
  correctAnswers = 0,
  attempts = 0,
  minLevel = 1,
  maxLevel = 10,
}) {
  const safeAttempts = Number(attempts || 0);
  const safeCorrectAnswers = Number(correctAnswers || 0);
  return {
    level: clampLevel(level, minLevel, maxLevel),
    streak: Math.max(0, Number(streak || 0)),
    correctAnswers: Math.max(0, safeCorrectAnswers),
    attempts: Math.max(0, safeAttempts),
    accuracy: safeAttempts > 0 ? safeCorrectAnswers / safeAttempts : 0,
  };
}
