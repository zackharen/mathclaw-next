import { buildEquationNode, buildIntegerNode } from "@/lib/math-display";
import { DEFAULT_ASSIGNMENT, INTEGER_LEVELS, INTEGER_LEVEL_MAP, getLevelById } from "./levels.js";
import { evaluateLevelProgression } from "./progression.js";

function randomInt(min, max) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function pickOne(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function signedLabel(value) {
  return value < 0 ? `(${value})` : String(value);
}

function buildEmptyStats() {
  return {
    attempts: 0,
    correct: 0,
    firstTryCorrect: 0,
    hintsUsed: 0,
    totalResponseMs: 0,
    correctResponseMs: 0,
    incorrectResponseMs: 0,
    attemptsPerProblem: 0,
    mistakes: {},
  };
}

function pushLimited(list, value, limit = 80) {
  return [value, ...(list || [])].slice(0, limit);
}

function median(values) {
  const usable = [...(values || [])].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return 0;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

function average(values) {
  const usable = [...(values || [])].filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function accuracy(values) {
  if (!values.length) return 0;
  return values.filter(Boolean).length / values.length;
}

function weightedRecentAccuracy(history) {
  const recent = (history || []).slice(0, 12);
  if (!recent.length) return 0;
  const totalWeight = recent.reduce((sum, _, index) => sum + (recent.length - index), 0);
  const weighted = recent.reduce(
    (sum, entry, index) => sum + (entry.correct ? 1 : 0) * (recent.length - index),
    0
  );
  return weighted / totalWeight;
}

function highestSustainedLevel(history) {
  const correctRuns = {};
  let best = 1;
  for (const entry of history || []) {
    if (!entry?.levelId) continue;
    if (entry.correct) {
      correctRuns[entry.levelId] = (correctRuns[entry.levelId] || 0) + 1;
      if (correctRuns[entry.levelId] >= 5) {
        best = Math.max(best, entry.levelId);
      }
    } else {
      correctRuns[entry.levelId] = 0;
    }
  }
  return best;
}

function speedTrend(history) {
  const usable = (history || []).slice(0, 12).filter((entry) => Number.isFinite(entry.responseMs));
  if (usable.length < 6) return "steady";
  const recent = average(usable.slice(0, 6).map((entry) => entry.responseMs));
  const older = average(usable.slice(6, 12).map((entry) => entry.responseMs));
  if (recent < older * 0.92) return "faster";
  if (recent > older * 1.08) return "slower";
  return "steady";
}

function classifySkillSize(maxAbs) {
  if (maxAbs <= 10) return "small_numbers";
  if (maxAbs <= 30) return "medium_numbers";
  return "large_numbers";
}

function classifyProblem(problem) {
  const tags = new Set([classifySkillSize(problem.maxAbs)]);
  const { a, b, op, answer } = problem;

  if (op === "+") {
    if (a >= 0 && b >= 0) {
      tags.add("positive_addition");
      tags.add("same_sign_addition");
    }
    if (a < 0 && b < 0) {
      tags.add("negative_plus_negative");
      tags.add("same_sign_addition");
    }
    if (a >= 0 && b < 0) tags.add("positive_plus_negative");
    if (a < 0 && b >= 0) tags.add("negative_plus_positive");
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) tags.add("different_sign_addition");
  }

  if (op === "-") {
    if (a >= 0 && b >= 0) {
      tags.add("positive_subtraction");
      tags.add(answer === 0 ? "subtraction_to_zero" : answer < 0 ? "subtraction_to_negative" : "same_sign_subtraction_pattern");
    }
    if (b < 0) tags.add("subtract_negative");
    if (a < 0 && b >= 0) tags.add("negative_minus_positive");
    if (a < 0 && b < 0) tags.add("negative_minus_negative");
  }

  if ((a < 0 && answer > 0) || (a > 0 && answer < 0) || (a === 0 && answer !== 0) || (a !== 0 && answer === 0)) {
    tags.add("crosses_zero");
  }

  tags.add("mixed_integer_operations");
  return [...tags];
}

function buildCounters(problem) {
  const positiveCount = Math.max(0, problem.a);
  const negativeCount = Math.max(0, -problem.a);
  const incomingPositive = problem.op === "+" ? Math.max(0, problem.b) : Math.max(0, -problem.b);
  const incomingNegative = problem.op === "+" ? Math.max(0, -problem.b) : Math.max(0, problem.b);
  const zeroPairs = Math.min(positiveCount + incomingPositive, negativeCount + incomingNegative);

  return {
    startPositive: positiveCount,
    startNegative: negativeCount,
    incomingPositive,
    incomingNegative,
    zeroPairs,
  };
}

function buildNumberLine(problem) {
  const subtractAsAdd = problem.op === "-" ? -problem.b : problem.b;
  const minimum = Math.min(problem.a, problem.answer, 0) - 2;
  const maximum = Math.max(problem.a, problem.answer, 0) + 2;
  return {
    min: minimum,
    max: maximum,
    start: problem.a,
    end: problem.answer,
    jump: subtractAsAdd,
  };
}

function buildStrategy(problem) {
  const absoluteCompare = Math.abs(problem.a) >= Math.abs(problem.b) ? "first" : "second";

  if (problem.op === "-" && problem.b < 0) {
    return {
      headline: "Subtracting a negative becomes adding the opposite.",
      steps: [
        `Rewrite ${signedLabel(problem.a)} - ${signedLabel(problem.b)} as ${signedLabel(problem.a)} + ${signedLabel(-problem.b)}.`,
        "Now add the two integers.",
      ],
      rewrite: `${signedLabel(problem.a)} + ${signedLabel(-problem.b)}`,
    };
  }

  if (problem.op === "+" && problem.a * problem.b < 0) {
    return {
      headline: "Opposite signs mean compare the absolute values.",
      steps: [
        `Compare |${problem.a}| and |${problem.b}|.`,
        `The ${absoluteCompare} number has the larger absolute value, so the answer keeps that sign.`,
        "Subtract the smaller absolute value from the larger one.",
      ],
    };
  }

  if (problem.op === "+" && problem.a < 0 && problem.b < 0) {
    return {
      headline: "Same-sign addition keeps the sign.",
      steps: [
        "Both numbers are negative.",
        "Add their absolute values.",
        "Keep the negative sign.",
      ],
    };
  }

  if (problem.op === "-") {
    return {
      headline: "Subtraction can move you left on the number line.",
      steps: [
        `Start at ${signedLabel(problem.a)}.`,
        `Move ${Math.abs(problem.b)} step${Math.abs(problem.b) === 1 ? "" : "s"} ${problem.b >= 0 ? "left" : "right"}.`,
      ],
    };
  }

  return {
    headline: "Addition combines the two integer amounts.",
    steps: ["Start with the first integer.", "Combine the second integer amount and keep track of the sign."],
  };
}

function selectProblemType(level, options = {}) {
  const pool = [...level.problemTypes];
  if (options.lockedSkillTag === "subtract_negative") {
    return pickOne(pool.filter((type) => type.includes("subtract_negative") || type === "subtract_negative") || pool);
  }
  return pickOne(pool);
}

function nonZeroInt(maxAbs) {
  const value = randomInt(1, maxAbs);
  return Math.random() > 0.5 ? value : -value;
}

function buildProblemFromType(type, maxAbs) {
  switch (type) {
    case "positive_addition": {
      const a = randomInt(0, maxAbs);
      const b = randomInt(0, maxAbs);
      return { a, b, op: "+", answer: a + b };
    }
    case "positive_subtraction_nonnegative": {
      const a = randomInt(0, maxAbs);
      const b = randomInt(0, a);
      return { a, b, op: "-", answer: a - b };
    }
    case "subtraction_to_zero": {
      const a = randomInt(0, maxAbs);
      return { a, b: a, op: "-", answer: 0 };
    }
    case "positive_subtraction_negative": {
      const b = randomInt(1, maxAbs);
      const a = randomInt(0, b - 1);
      return { a, b, op: "-", answer: a - b };
    }
    case "negative_plus_negative": {
      const a = -randomInt(1, maxAbs);
      const b = -randomInt(1, maxAbs);
      return { a, b, op: "+", answer: a + b };
    }
    case "positive_plus_negative_positive": {
      const a = randomInt(1, maxAbs);
      const b = -randomInt(1, a);
      return { a, b, op: "+", answer: a + b };
    }
    case "positive_plus_negative_zero_or_positive": {
      const a = randomInt(1, maxAbs);
      const b = -randomInt(1, a);
      return { a, b, op: "+", answer: a + b };
    }
    case "positive_plus_negative_any": {
      const a = randomInt(1, maxAbs);
      const b = -randomInt(1, maxAbs);
      return { a, b, op: "+", answer: a + b };
    }
    case "negative_plus_positive_any": {
      const a = -randomInt(1, maxAbs);
      const b = randomInt(1, maxAbs);
      return { a, b, op: "+", answer: a + b };
    }
    case "subtract_negative": {
      const a = nonZeroInt(maxAbs);
      const b = -randomInt(1, maxAbs);
      return { a, b, op: "-", answer: a - b };
    }
    case "negative_minus_positive": {
      const a = -randomInt(1, maxAbs);
      const b = randomInt(1, maxAbs);
      return { a, b, op: "-", answer: a - b };
    }
    case "negative_minus_negative": {
      const a = -randomInt(1, maxAbs);
      const b = -randomInt(1, maxAbs);
      return { a, b, op: "-", answer: a - b };
    }
    case "crosses_zero_mix": {
      const candidate = Math.random() > 0.5
        ? buildProblemFromType("positive_plus_negative_any", maxAbs)
        : buildProblemFromType("positive_subtraction_negative", maxAbs);
      if (!classifyProblem({ ...candidate, maxAbs }).includes("crosses_zero")) {
        return buildProblemFromType("crosses_zero_mix", maxAbs);
      }
      return candidate;
    }
    case "larger_abs_second_mix": {
      const a = randomInt(1, maxAbs - 1);
      const b = -randomInt(a + 1, maxAbs);
      return Math.random() > 0.5
        ? { a, b, op: "+", answer: a + b }
        : { a, b: Math.abs(b), op: "-", answer: a - Math.abs(b) };
    }
    case "mixed_core_small":
    case "mixed_core_medium":
    case "mixed_core_large":
    case "mixed_all_patterns": {
      const pool = [
        "positive_addition",
        "positive_subtraction_nonnegative",
        "positive_subtraction_negative",
        "negative_plus_negative",
        "positive_plus_negative_any",
        "negative_plus_positive_any",
        "subtract_negative",
        "negative_minus_positive",
        "negative_minus_negative",
      ];
      return buildProblemFromType(pickOne(pool), maxAbs);
    }
    case "advanced_subtract_negative": {
      const a = -randomInt(10, maxAbs);
      const b = -randomInt(10, maxAbs);
      return { a, b, op: "-", answer: a - b };
    }
    default:
      return buildProblemFromType("positive_addition", maxAbs);
  }
}

function dedupe(values) {
  return [...new Set(values)];
}

function buildDistractors(problem, count, profile = "standard") {
  const correct = problem.answer;
  const distractors = [];
  const push = (value) => {
    if (Number.isFinite(value) && value !== correct) distractors.push(value);
  };

  push(-correct);
  push(Math.abs(correct));
  push(-Math.abs(correct));
  push(problem.a + Math.abs(problem.b));
  push(problem.a - Math.abs(problem.b));
  push(Math.abs(problem.a) + Math.abs(problem.b));
  push(Math.abs(problem.a) - Math.abs(problem.b));
  push(correct + 1);
  push(correct - 1);
  push(correct + (profile === "gentle" ? 2 : 3));
  push(correct - (profile === "gentle" ? 2 : 3));

  if (problem.op === "-" && problem.b < 0) {
    push(problem.a - Math.abs(problem.b));
    push(-(problem.a + Math.abs(problem.b)));
  }

  if (problem.op === "+" && problem.a * problem.b < 0) {
    push(-(Math.abs(problem.a) - Math.abs(problem.b)));
  }

  const unique = dedupe(distractors);
  const choices = [];
  while (choices.length < count - 1 && unique.length) {
    const index = randomInt(0, unique.length - 1);
    choices.push(unique.splice(index, 1)[0]);
  }

  while (choices.length < count - 1) {
    const offset = randomInt(2, 6) * (Math.random() > 0.5 ? 1 : -1);
    if (!choices.includes(correct + offset) && correct + offset !== correct) {
      choices.push(correct + offset);
    }
  }

  return dedupe([correct, ...choices])
    .slice(0, count)
    .sort(() => Math.random() - 0.5);
}

export function applyScaffoldsToProblem(problem, level, scaffolds = level?.scaffolds || {}) {
  const answerMode = scaffolds.answerMode || level?.scaffolds?.answerMode || "open_response";
  const choiceCount = Number(scaffolds.choiceCount || level?.scaffolds?.choiceCount || 4);

  return {
    ...problem,
    answerMode,
    choiceCount,
    choices:
      answerMode === "multiple_choice"
        ? buildDistractors(problem, choiceCount, level?.distractorProfile)
        : [],
  };
}

export function createProblem(level, options = {}) {
  const problemType = selectProblemType(level, options);
  const base = buildProblemFromType(problemType, level.numberRange.max);
  const answerMode = options.answerMode || level.scaffolds.answerMode;
  const choiceCount = Number(options.choiceCount || level.scaffolds.choiceCount || 4);
  const problem = {
    ...base,
    id: `${level.id}-${problemType}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    levelId: level.id,
    pattern: problemType,
    maxAbs: level.numberRange.max,
  };
  const skillTags = classifyProblem(problem);
  const strategy = buildStrategy(problem);

  return applyScaffoldsToProblem({
    ...problem,
    skillTags,
    primarySkillTag: skillTags.find((tag) => level.skillTags.includes(tag)) || skillTags[0],
    promptNode: buildEquationNode(problem.a, problem.op, problem.b, {
      includeEquals: true,
      includeUnknown: true,
    }),
    answerNode: buildIntegerNode(problem.answer, { parenthesizeNegative: false }),
    counters: buildCounters(problem),
    numberLine: buildNumberLine(problem),
    strategy,
  }, level, { answerMode, choiceCount });
}

export function detectErrorType(problem, guess, responseMs = 0) {
  if (!Number.isFinite(guess)) return "invalid_response";
  const correct = problem.answer;
  if (guess === correct) return "correct";
  if (guess === -correct) return "right_magnitude_wrong_sign";
  if (Math.abs(guess) === Math.abs(correct)) return "right_magnitude_wrong_sign";
  if (Math.sign(guess) === Math.sign(correct) && Math.abs(guess - correct) <= 3) return "careless_close_answer";
  if (Math.abs(guess) === Math.abs(problem.a) + Math.abs(problem.b)) return "same_sign_confusion";
  if (problem.op === "-" && problem.b < 0 && guess === problem.a - Math.abs(problem.b)) return "subtraction_rule_confusion";
  if (problem.op === "+" && problem.a * problem.b < 0 && guess === -(Math.abs(problem.a) - Math.abs(problem.b))) return "sign_error";
  if (responseMs < 1800) return "fast_guessing";
  if (responseMs > 12000) return "slow_confusion";
  return Math.sign(guess) === Math.sign(correct) ? "wrong_magnitude_right_sign" : "absolute_value_confusion";
}

export function createEmptyIntegerProfile() {
  return {
    currentLevelId: 1,
    highestLevelReached: 1,
    masteredSkillTags: [],
    strugglingSkillTags: [],
    recentSessions: [],
    rollingHistory: [],
    levelStats: {},
    rollingStats: {
      overall: buildEmptyStats(),
      bySkill: {},
      responseTimes: [],
      correctResponseTimes: [],
      incorrectResponseTimes: [],
      lastFive: [],
      lastTen: [],
      lastTwenty: [],
      errorTypes: {},
      hintDependence: 0,
      consistencyAcrossFormats: {},
    },
    hintDependence: 0,
    responseTimeTrends: {},
    accuracyBySkill: {},
    currentScaffolds: null,
    sessionHistory: [],
    badges: [],
    fluencyState: "learning",
    dropOffPoint: null,
  };
}

function emptyLevelStat() {
  return {
    attempts: 0,
    correct: 0,
    firstTryCorrect: 0,
    hintsUsed: 0,
    totalResponseMs: 0,
    currentStreak: 0,
    bestStreak: 0,
    currentFirstTryStreak: 0,
    bestFirstTryStreak: 0,
  };
}

function applyAnswerToLevelStats(levelStats, answerEntry) {
  const nextStats = { ...(levelStats || {}) };
  const levelKey = String(Number(answerEntry?.levelId || 1));
  const current = { ...emptyLevelStat(), ...(nextStats[levelKey] || {}) };
  const correct = answerEntry?.correct === true;
  const firstTryCorrect = correct && Number(answerEntry?.attemptsUsed || 1) <= 1;

  current.attempts += 1;
  current.correct += correct ? 1 : 0;
  current.firstTryCorrect += firstTryCorrect ? 1 : 0;
  current.hintsUsed += answerEntry?.hintUsed === true ? 1 : 0;
  current.totalResponseMs += Number(answerEntry?.responseMs || 0);
  current.currentStreak = correct ? current.currentStreak + 1 : 0;
  current.bestStreak = Math.max(current.bestStreak, current.currentStreak);
  current.currentFirstTryStreak = firstTryCorrect ? current.currentFirstTryStreak + 1 : 0;
  current.bestFirstTryStreak = Math.max(current.bestFirstTryStreak, current.currentFirstTryStreak);
  nextStats[levelKey] = current;

  return nextStats;
}

function summarizeSkill(history, skillTag) {
  const matching = (history || []).filter((entry) => (entry.skillTags || []).includes(skillTag));
  if (!matching.length) return null;
  const responseTimes = matching.map((entry) => entry.responseMs).filter(Number.isFinite);
  const hints = matching.filter((entry) => entry.hintUsed).length;
  return {
    attempts: matching.length,
    accuracy: accuracy(matching.map((entry) => entry.correct)),
    medianResponseMs: median(responseTimes),
    hintRate: matching.length ? hints / matching.length : 0,
    errorTypes: matching.reduce((map, entry) => {
      if (!entry.errorType || entry.errorType === "correct") return map;
      map[entry.errorType] = (map[entry.errorType] || 0) + 1;
      return map;
    }, {}),
  };
}

export function summarizeProfile(profile) {
  const history = profile?.rollingHistory || [];
  const responseTimes = history.map((entry) => entry.responseMs).filter(Number.isFinite);
  const correctTimes = history.filter((entry) => entry.correct).map((entry) => entry.responseMs);
  const incorrectTimes = history.filter((entry) => !entry.correct).map((entry) => entry.responseMs);
  const hintRate = history.length ? history.filter((entry) => entry.hintUsed).length / history.length : 0;
  const skillSummary = {};

  [
    "positive_addition",
    "positive_subtraction",
    "subtraction_to_zero",
    "subtraction_to_negative",
    "negative_plus_negative",
    "positive_plus_negative",
    "negative_plus_positive",
    "subtract_negative",
    "negative_minus_positive",
    "negative_minus_negative",
    "crosses_zero",
    "same_sign_addition",
    "different_sign_addition",
    "same_sign_subtraction_pattern",
    "mixed_integer_operations",
    "small_numbers",
    "medium_numbers",
    "large_numbers",
  ].forEach((tag) => {
    const summary = summarizeSkill(history, tag);
    if (summary) skillSummary[tag] = summary;
  });

  const errorTypes = history.reduce((map, entry) => {
    if (!entry.errorType || entry.errorType === "correct") return map;
    map[entry.errorType] = (map[entry.errorType] || 0) + 1;
    return map;
  }, {});

  const recentCorrectness = history.map((entry) => entry.correct);
  const overallAccuracy = accuracy(recentCorrectness);
  const state =
    overallAccuracy >= 0.93 && hintRate <= 0.08 && median(correctTimes) <= 4500
      ? "automatic"
      : overallAccuracy >= 0.88 && hintRate <= 0.15 && median(correctTimes) <= 6000
        ? "fluent"
        : overallAccuracy >= 0.78
          ? "proficient"
          : overallAccuracy >= 0.65
            ? "developing"
            : overallAccuracy >= 0.45
              ? "learning"
              : "struggling";

  const strugglingSkillTags = Object.entries(skillSummary)
    .filter(([, summary]) => summary.attempts >= 4 && (summary.accuracy < 0.68 || summary.hintRate > 0.45))
    .map(([tag]) => tag)
    .slice(0, 4);

  const masteredSkillTags = Object.entries(skillSummary)
    .filter(([, summary]) => summary.attempts >= 6 && summary.accuracy >= 0.9 && summary.hintRate < 0.2)
    .map(([tag]) => tag)
    .slice(0, 8);

  return {
    overallAccuracy,
    accuracyBySkill: skillSummary,
    currentStreak: history.reduce((streak, entry, index) => {
      if (index === 0 && entry.correct) return 1;
      if (index === 0) return 0;
      return streak;
    }, 0),
    longestStreak: history.reduce(
      (result, entry) => {
        const run = entry.correct ? result.run + 1 : 0;
        return { run, best: Math.max(result.best, run) };
      },
      { run: 0, best: 0 }
    ).best,
    averageResponseMs: average(responseTimes),
    medianResponseMs: median(responseTimes),
    correctMedianResponseMs: median(correctTimes),
    incorrectMedianResponseMs: median(incorrectTimes),
    last5Accuracy: accuracy(recentCorrectness.slice(0, 5)),
    last10Accuracy: accuracy(recentCorrectness.slice(0, 10)),
    last20Accuracy: accuracy(recentCorrectness.slice(0, 20)),
    weightedRecentAccuracy: weightedRecentAccuracy(history),
    hintRate,
    firstTryCorrectRate: history.length ? history.filter((entry) => entry.correct && entry.attemptsUsed === 1).length / history.length : 0,
    averageAttemptsPerProblem: average(history.map((entry) => entry.attemptsUsed)),
    errorTypes,
    performanceStability: history.length >= 8 ? Math.abs(accuracy(recentCorrectness.slice(0, 8)) - accuracy(recentCorrectness.slice(8, 16))) : 0,
    highestSustainedDifficulty: highestSustainedLevel(history),
    dropOffPoint:
      history.find((entry) => !entry.correct && entry.levelId >= (profile?.highestLevelReached || 1) - 1)?.levelId || null,
    consistencyAcrossFormats: profile?.rollingStats?.consistencyAcrossFormats || {},
    speedTrend: speedTrend(history),
    masteredSkillTags,
    strugglingSkillTags,
    fluencyState: state,
  };
}

export function evaluateLevelMastery(level, profileSummary) {
  const fallbackFocusAccuracies = level.skillTags
    .map((tag) => profileSummary.accuracyBySkill?.[tag]?.accuracy)
    .filter((value) => typeof value === "number");
  const focusAccuracy = fallbackFocusAccuracies.length ? average(fallbackFocusAccuracies) : profileSummary.last10Accuracy;
  return {
    pass:
      profileSummary.last10Accuracy >= level.masteryRules.minAccuracy &&
      profileSummary.medianResponseMs <= level.masteryRules.maxMedianResponseMs &&
      profileSummary.hintRate <= level.masteryRules.maxHintRate &&
      profileSummary.longestStreak >= level.masteryRules.minStreak &&
      focusAccuracy >= level.masteryRules.minFocusAccuracy,
    canLevelUp: false,
    threshold: 0,
    totalScore: 0,
    readinessState: "not_ready",
    usedFocusFallback: fallbackFocusAccuracies.length === 0,
    weakSkillTags: [],
    recommendedPracticeTags: level.skillTags.slice(0, 1),
    blockedReasons: [],
    blockedReasonCodes: [],
    primaryFeedback: "",
    scoreBreakdown: {
      accuracy: { raw: profileSummary.last10Accuracy, score: 0, hardFail: false },
      speed: { raw: profileSummary.medianResponseMs, score: 0, hardFail: false },
      streak: { raw: profileSummary.longestStreak, score: 0, hardFail: false },
      hints: { raw: profileSummary.hintRate, score: 0, hardFail: false },
      focus: { raw: focusAccuracy, score: 0, hardFail: false },
    },
    reasons: {
      recentAccuracy: profileSummary.last10Accuracy,
      medianResponseMs: profileSummary.medianResponseMs,
      hintRate: profileSummary.hintRate,
      streak: profileSummary.longestStreak,
      focusAccuracy,
      attempts: 0,
      minAttempts: level.questionCountForEvaluation || 10,
    },
    evidence: {
      attempts: 0,
      minAttempts: level.questionCountForEvaluation || 10,
      evaluationWindow: level.questionCountForEvaluation || 10,
      skillEvidenceSource: fallbackFocusAccuracies.length === 0 ? "general_accuracy" : "profile_summary",
    },
  };
}

export function chooseRemediationSkill(profileSummary, level, progression = null) {
  if (progression?.recommendedPracticeTags?.length) {
    return progression.recommendedPracticeTags[0];
  }
  const weak = Object.entries(profileSummary.accuracyBySkill || {})
    .filter(([tag, summary]) => level.skillTags.includes(tag) && summary.attempts >= 3)
    .sort((a, b) => a[1].accuracy - b[1].accuracy);
  return weak[0]?.[0] || null;
}

export function deriveTemporaryScaffolds(level, profileSummary, progression = null) {
  const weakSkill = chooseRemediationSkill(profileSummary, level, progression);
  if (!weakSkill) return null;
  const needsSupport =
    profileSummary.last5Accuracy < 0.65 || profileSummary.hintRate > 0.5 || profileSummary.performanceStability > 0.3;

  if (!needsSupport) return null;

  return {
    ...level.scaffolds,
    answerMode: "multiple_choice",
    choiceCount: Math.min(4, Math.max(3, level.scaffolds.choiceCount || 4)),
    showNumberLine: true,
    showHintButton: true,
    showStrategyPrompt: true,
    stepByStep: true,
    allowRetry: true,
    untimed: true,
    timedPressure: false,
    timerSeconds: null,
    remediationSkillTag: weakSkill,
  };
}

export function buildSessionSummary({
  session,
  profileSummary,
  level,
  levelChange,
  mastery = null,
}) {
  const responseTimes = session.answers.map((item) => item.responseMs);
  return {
    questionsAnswered: session.answers.length,
    accuracy: accuracy(session.answers.map((item) => item.correct)),
    averageResponseMs: average(responseTimes),
    medianResponseMs: median(responseTimes),
    bestStreak: session.bestStreak,
    skillTypesPracticed: dedupe(session.answers.flatMap((item) => item.skillTags)).slice(0, 8),
    skillsImproved: profileSummary.masteredSkillTags.slice(0, 4),
    recommendedNextFocus: chooseRemediationSkill(profileSummary, level) || level.skillTags[0],
    leveledUp: levelChange > 0,
    levelChange,
    needsSupportOn: profileSummary.strugglingSkillTags[0] || null,
    readinessState: mastery?.readinessState || null,
    blockedReasons: mastery?.blockedReasons || [],
    scoreBreakdown: mastery?.scoreBreakdown || null,
    totalScore: mastery?.totalScore ?? null,
    threshold: mastery?.threshold ?? null,
    primaryFeedback: mastery?.primaryFeedback || null,
    recommendedPracticeTags: mastery?.recommendedPracticeTags || [],
  };
}

export function createEmptySession(levelId) {
  return {
    levelId,
    answers: [],
    streak: 0,
    bestStreak: 0,
    hintsUsed: 0,
    mode: "adaptive",
    remediation: null,
  };
}

export function applyAnswerToProfile(profile, answerEntry) {
  const nextProfile = structuredClone(profile || createEmptyIntegerProfile());
  nextProfile.levelStats = applyAnswerToLevelStats(nextProfile.levelStats, answerEntry);
  nextProfile.rollingHistory = pushLimited(nextProfile.rollingHistory, answerEntry, 30);
  nextProfile.highestLevelReached = Math.max(nextProfile.highestLevelReached || 1, answerEntry.levelId);
  const summary = summarizeProfile(nextProfile);
  nextProfile.masteredSkillTags = summary.masteredSkillTags;
  nextProfile.strugglingSkillTags = summary.strugglingSkillTags;
  nextProfile.accuracyBySkill = summary.accuracyBySkill;
  nextProfile.fluencyState = summary.fluencyState;
  nextProfile.dropOffPoint = summary.dropOffPoint;
  nextProfile.hintDependence = summary.hintRate;
  nextProfile.currentLevelId = profile?.currentLevelId || 1;
  return { profile: nextProfile, summary };
}

export function computeLevelChange({
  mode,
  currentLevelId,
  profile,
  profileSummary,
  assignment = DEFAULT_ASSIGNMENT,
}) {
  const level = getLevelById(currentLevelId);
  const mastery =
    profile && typeof profile === "object"
      ? evaluateLevelProgression({ level, profile, profileSummary })
      : evaluateLevelMastery(level, profileSummary);

  if (mode === "challenge") {
    return { nextLevelId: currentLevelId, mastery, supportScaffolds: null };
  }

  if (mode === "assignment") {
    const upperBound = Math.max(assignment.startLevelId, assignment.endLevelId);
    const nextLevelId = mastery.pass ? Math.min(upperBound, level.nextLevelId || level.id) : level.id;
    return {
      nextLevelId,
      mastery,
      supportScaffolds: assignment.allowAdaptiveSupport ? deriveTemporaryScaffolds(level, profileSummary, mastery) : null,
    };
  }

  if (mode === "progression") {
    return {
      nextLevelId: mastery.pass ? (level.nextLevelId || level.id) : level.id,
      mastery,
      supportScaffolds: deriveTemporaryScaffolds(level, profileSummary, mastery),
    };
  }

  const supportScaffolds = deriveTemporaryScaffolds(level, profileSummary, mastery);
  if (mastery.pass) {
    return { nextLevelId: level.nextLevelId || level.id, mastery, supportScaffolds: null };
  }

  const fallbackLevelId =
    profileSummary.last5Accuracy < 0.45 && level.fallbackLevelId ? level.fallbackLevelId : level.id;
  return {
    nextLevelId: fallbackLevelId,
    mastery,
    supportScaffolds,
  };
}

export function buildAssignmentPlan(input = {}) {
  return {
    ...DEFAULT_ASSIGNMENT,
    ...input,
    startLevelId: clamp(Number(input.startLevelId || DEFAULT_ASSIGNMENT.startLevelId), 1, INTEGER_LEVELS.length),
    endLevelId: clamp(Number(input.endLevelId || DEFAULT_ASSIGNMENT.endLevelId), 1, INTEGER_LEVELS.length),
    questionCount: clamp(Number(input.questionCount || DEFAULT_ASSIGNMENT.questionCount), 5, 30),
    masteryTarget: clamp(Number(input.masteryTarget || DEFAULT_ASSIGNMENT.masteryTarget), 0.6, 0.98),
  };
}

export function buildBadges(profileSummary, highestLevelReached) {
  const badges = [];
  if (highestLevelReached >= 5) badges.push("Warm-Up Winner");
  if (highestLevelReached >= 15) badges.push("Integer Explorer");
  if (highestLevelReached >= 25) badges.push("Sign Strategist");
  if (highestLevelReached >= 35) badges.push("Fluency Builder");
  if (profileSummary.fluencyState === "automatic") badges.push("Automaticity Star");
  if ((profileSummary.longestStreak || 0) >= 8) badges.push("Streak Engine");
  return badges;
}
