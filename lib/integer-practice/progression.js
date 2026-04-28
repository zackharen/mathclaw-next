import { INTEGER_PROGRESSION_RULES, getProgressionTheme } from "./levels.js";
import { normalizeIntegerMasterySettings } from "./mastery-settings.js";

function average(values) {
  const usable = [...(values || [])].filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function median(values) {
  const usable = [...(values || [])].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return 0;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

function accuracy(values) {
  if (!values.length) return 0;
  return values.filter(Boolean).length / values.length;
}

function entryIsCorrect(entry, settings) {
  return entry?.correct === true && (settings.countRetriesAsCorrect || Number(entry?.attemptsUsed || 1) <= 1);
}

function longestStreak(history, settings) {
  return (history || []).reduce(
    (result, entry) => {
      const run = entryIsCorrect(entry, settings) ? result.run + 1 : 0;
      return { run, best: Math.max(result.best, run) };
    },
    { run: 0, best: 0 }
  ).best;
}

function scoreFromMinimumBands(value, bands = []) {
  for (const band of bands) {
    if (value >= band.min) return band.score;
  }
  return 0;
}

function scoreFromMaximumBands(value, bands = []) {
  for (const band of bands) {
    if (value <= band.max) return band.score;
  }
  return 0;
}

function getTierThreshold(levelId) {
  if (levelId <= 10) return 300;
  if (levelId <= 25) return 350;
  return 400;
}

function getScoreTier(levelId, theme) {
  if (levelId <= 10) return "beginner";
  if (levelId <= 25) return "intermediate";
  if (theme?.scoreTier === "advanced") return "advanced";
  return "advanced";
}

function getSpeedBands(levelId, theme) {
  if (levelId <= 10) return INTEGER_PROGRESSION_RULES
    ? [
        { maxMs: 4000, score: 100 },
        { maxMs: 6000, score: 80 },
        { maxMs: 8000, score: 60 },
        { maxMs: Number.POSITIVE_INFINITY, score: 30 },
      ]
    : theme.speedBands;
  if (levelId <= 25) {
    return [
      { maxMs: 3000, score: 100 },
      { maxMs: 5000, score: 80 },
      { maxMs: 7000, score: 60 },
      { maxMs: Number.POSITIVE_INFINITY, score: 30 },
    ];
  }
  return [
    { maxMs: 2500, score: 100 },
    { maxMs: 4000, score: 80 },
    { maxMs: 6000, score: 60 },
    { maxMs: Number.POSITIVE_INFINITY, score: 30 },
  ];
}

function getMinAttempts(levelId, level, theme) {
  const fromTier = levelId <= 10 ? 10 : levelId <= 25 ? 12 : 15;
  return Math.max(fromTier, Number(level?.questionCountForEvaluation || 0) || 0, theme?.minAttempts || 0);
}

function getEvaluationWindow(levelId) {
  if (levelId <= 10) return INTEGER_PROGRESSION_RULES.evaluationWindowByTier.beginner;
  if (levelId <= 25) return INTEGER_PROGRESSION_RULES.evaluationWindowByTier.intermediate;
  return INTEGER_PROGRESSION_RULES.evaluationWindowByTier.advanced;
}

function formatTag(tag) {
  return String(tag || "").replaceAll("_", " ");
}

function buildMetricBlock(raw, score, hardFail = false) {
  return { raw, score, hardFail };
}

function summarizeSkill(history, skillTag, settings) {
  const matching = (history || []).filter((entry) => (entry.skillTags || []).includes(skillTag));
  if (!matching.length) return null;
  return {
    attempts: matching.length,
    accuracy: accuracy(matching.map((entry) => entryIsCorrect(entry, settings))),
    hintRate: matching.length ? matching.filter((entry) => entry.hintUsed).length / matching.length : 0,
    medianResponseMs: median(matching.map((entry) => entry.responseMs)),
  };
}

function normalizeLevelStat(stat) {
  if (!stat || typeof stat !== "object") return null;
  const attempts = Number(stat.attempts || 0);
  if (!attempts) return null;
  return {
    attempts,
    correct: Number(stat.correct || 0),
    firstTryCorrect: Number(stat.firstTryCorrect || 0),
    hintsUsed: Number(stat.hintsUsed || 0),
    totalResponseMs: Number(stat.totalResponseMs || 0),
    bestStreak: Number(stat.bestStreak || 0),
    bestFirstTryStreak: Number(stat.bestFirstTryStreak || 0),
  };
}

function buildLevelStatFromHistory(history, levelId) {
  const matching = (history || []).filter((entry) => Number(entry?.levelId || 0) === levelId);
  if (!matching.length) return null;
  return matching.reduce(
    (stat, entry) => {
      const correct = entry?.correct === true;
      const firstTryCorrect = correct && Number(entry?.attemptsUsed || 1) <= 1;
      stat.attempts += 1;
      stat.correct += correct ? 1 : 0;
      stat.firstTryCorrect += firstTryCorrect ? 1 : 0;
      stat.hintsUsed += entry?.hintUsed === true ? 1 : 0;
      stat.totalResponseMs += Number(entry?.responseMs || 0);
      stat.currentStreak = correct ? stat.currentStreak + 1 : 0;
      stat.bestStreak = Math.max(stat.bestStreak, stat.currentStreak);
      stat.currentFirstTryStreak = firstTryCorrect ? stat.currentFirstTryStreak + 1 : 0;
      stat.bestFirstTryStreak = Math.max(stat.bestFirstTryStreak, stat.currentFirstTryStreak);
      return stat;
    },
    {
      attempts: 0,
      correct: 0,
      firstTryCorrect: 0,
      hintsUsed: 0,
      totalResponseMs: 0,
      currentStreak: 0,
      bestStreak: 0,
      currentFirstTryStreak: 0,
      bestFirstTryStreak: 0,
    }
  );
}

function buildMetricMessage(reasonCode, context = {}) {
  switch (reasonCode) {
    case "insufficient_attempts":
      return `Keep going. I need ${context.minAttempts} solid reps on this level before I can move you up.`;
    case "low_recent_correct":
      return `Keep going. This level needs ${context.minCorrectInRecentWindow} correct in the last ${context.recentWindowSize} problems.`;
    case "low_blended_accuracy":
      return "You’re close, but the saved practice history for this level still needs stronger accuracy.";
    case "low_accuracy":
      return "Keep building understanding first. This level still needs stronger accuracy.";
    case "low_focus_accuracy":
      return "You’re close overall, but the main skill for this level still needs more accurate practice.";
    case "short_streak":
      return "Great work so far. Build a slightly longer streak to show consistency.";
    case "high_hint_rate":
      return "You’re solving correctly, but this level needs less hint usage.";
    case "slow_response":
      return "Accuracy is building. This setting still asks for a little more fluency before moving up.";
    case "struggling_state":
      return "Let’s stabilize this level first before moving up.";
    case "weak_skill_tags":
      return `Strong overall performance, but ${context.tags?.map(formatTag).join(" and ")} still need work.`;
    case "score_threshold":
      return "You’re close. Keep the accuracy and independence going for a few more problems.";
    default:
      return "Keep practicing this level a bit more.";
  }
}

export function evaluateLevelProgression({ level, profile, profileSummary = null, masterySettings = null }) {
  const settings = normalizeIntegerMasterySettings(masterySettings || {});
  const levelId = Number(level?.id || 1);
  const theme = getProgressionTheme(levelId);
  const threshold = Math.round(settings.minBlendedAccuracy * 500);
  const minAttempts = Math.max(settings.minAttempts, settings.recentWindowSize);
  const evaluationWindow = Math.max(getEvaluationWindow(levelId), minAttempts, settings.recentWindowSize);
  const history = Array.isArray(profile?.rollingHistory) ? profile.rollingHistory : [];
  const allLevelHistory = history.filter((entry) => Number(entry?.levelId || 0) === levelId);
  const savedLevelStat = normalizeLevelStat(profile?.levelStats?.[String(levelId)] || profile?.levelStats?.[levelId]);
  const fallbackLevelStat = buildLevelStatFromHistory(history, levelId);
  const levelStat = savedLevelStat || fallbackLevelStat;
  const accuracyWindow = allLevelHistory.slice(0, settings.recentWindowSize);

  const recentCorrectCount = accuracyWindow.filter((entry) => entryIsCorrect(entry, settings)).length;
  const recentAccuracy = accuracy(accuracyWindow.map((entry) => entryIsCorrect(entry, settings)));
  const historicalCorrect = settings.countRetriesAsCorrect
    ? Number(levelStat?.correct || 0)
    : Number(levelStat?.firstTryCorrect || 0);
  const historicalAccuracy = levelStat?.attempts
    ? historicalCorrect / levelStat.attempts
    : accuracy(allLevelHistory.map((entry) => entryIsCorrect(entry, settings)));
  const blendedAccuracy =
    recentAccuracy * (1 - settings.historicalWeight) + historicalAccuracy * settings.historicalWeight;
  const medianResponseMs = allLevelHistory.length
    ? median(allLevelHistory.map((entry) => entry.responseMs))
    : levelStat?.attempts
      ? levelStat.totalResponseMs / levelStat.attempts
      : 0;
  const hintRate = levelStat?.attempts
    ? Number(levelStat.hintsUsed || 0) / levelStat.attempts
    : allLevelHistory.length
      ? allLevelHistory.filter((entry) => entry.hintUsed).length / allLevelHistory.length
      : 0;
  const longestRun = levelStat
    ? settings.countRetriesAsCorrect
      ? Number(levelStat.bestStreak || 0)
      : Number(levelStat.bestFirstTryStreak || 0)
    : longestStreak(allLevelHistory, settings);
  const attempts = levelStat?.attempts || allLevelHistory.length;
  const effectiveRecentAccuracy = accuracyWindow.length
    ? recentAccuracy
    : historicalAccuracy;
  const effectiveRecentCorrectCount = accuracyWindow.length
    ? recentCorrectCount
    : Math.min(settings.recentWindowSize, Math.floor(historicalAccuracy * settings.recentWindowSize));
  const effectiveBlendedAccuracy = accuracyWindow.length
    ? blendedAccuracy
    : historicalAccuracy;

  const skillEvidence = level.skillTags.map((tag) => {
    const currentLevelSample = summarizeSkill(allLevelHistory, tag, settings);
    const summarySample = profileSummary?.accuracyBySkill?.[tag]
      ? {
          attempts: Number(profileSummary.accuracyBySkill[tag].attempts || 0),
          accuracy: Number(profileSummary.accuracyBySkill[tag].accuracy || 0),
          hintRate: Number(profileSummary.accuracyBySkill[tag].hintRate || 0),
          medianResponseMs: Number(profileSummary.accuracyBySkill[tag].medianResponseMs || 0),
        }
      : null;

    return {
      tag,
      currentLevelSample,
      summarySample,
    };
  });

  const currentSkillAttempts = skillEvidence.reduce(
    (sum, item) => sum + Number(item.currentLevelSample?.attempts || 0),
    0
  );
  const usedFocusFallback = currentSkillAttempts < INTEGER_PROGRESSION_RULES.focusFallbackMinAttempts;
  const focusAccuracy = usedFocusFallback
    ? effectiveRecentAccuracy
    : average(
        skillEvidence
          .map((item) => item.currentLevelSample?.accuracy)
          .filter((value) => typeof value === "number")
      );

  const weakSkillTags = skillEvidence
    .filter(({ currentLevelSample }) => {
      const sample = currentLevelSample;
      if (!sample || sample.attempts < INTEGER_PROGRESSION_RULES.weakSkillTagMinAttempts) return false;
      return (
        sample.accuracy < INTEGER_PROGRESSION_RULES.weakSkillTagMaxAccuracy ||
        sample.hintRate > INTEGER_PROGRESSION_RULES.weakSkillTagMaxHintRate
      );
    })
    .map(({ tag }) => tag);

  const hardFailCodes = [];
  if (effectiveRecentCorrectCount < settings.minCorrectInRecentWindow) hardFailCodes.push("low_recent_correct");
  if (effectiveBlendedAccuracy < settings.minBlendedAccuracy) hardFailCodes.push("low_blended_accuracy");
  if (longestRun < settings.minCorrectStreak) hardFailCodes.push("short_streak");
  if (settings.useHintGate && hintRate > settings.maxHintRate) hardFailCodes.push("high_hint_rate");
  if (settings.useSpeedGate && medianResponseMs > settings.maxMedianResponseMs) hardFailCodes.push("slow_response");

  const insufficientAttempts = attempts < minAttempts;
  const struggling =
    effectiveRecentAccuracy < INTEGER_PROGRESSION_RULES.struggling.minAccuracy ||
    (settings.useHintGate && hintRate > Math.max(settings.maxHintRate, INTEGER_PROGRESSION_RULES.struggling.maxHintRate));

  const accuracyScore = Math.round(effectiveBlendedAccuracy * 100);
  const speedScore = scoreFromMaximumBands(medianResponseMs, getSpeedBands(levelId, theme));
  const streakScore = scoreFromMinimumBands(longestRun, INTEGER_PROGRESSION_RULES.scoring.streakBands);
  const hintScore = scoreFromMaximumBands(hintRate, INTEGER_PROGRESSION_RULES.scoring.hintBands);
  const focusScore = scoreFromMinimumBands(focusAccuracy, INTEGER_PROGRESSION_RULES.scoring.focusBands);
  const totalScore = accuracyScore + speedScore + streakScore + hintScore + focusScore;

  const blockedReasonCodes = [];
  if (insufficientAttempts) blockedReasonCodes.push("insufficient_attempts");
  blockedReasonCodes.push(...hardFailCodes);
  if (struggling) blockedReasonCodes.push("struggling_state");
  if (weakSkillTags.length) blockedReasonCodes.push("weak_skill_tags");

  const uniqueBlockedReasonCodes = [...new Set(blockedReasonCodes)];
  const canLevelUp =
    !insufficientAttempts &&
    !hardFailCodes.length &&
    !struggling &&
    !weakSkillTags.length;

  const readinessState = canLevelUp
    ? "ready"
    : insufficientAttempts
      ? "building_evidence"
      : struggling
        ? "struggling"
        : effectiveBlendedAccuracy >= settings.minBlendedAccuracy - settings.closeBuffer
          ? "close"
          : "not_ready";

  const recommendedPracticeTags = weakSkillTags.length
    ? weakSkillTags
    : uniqueBlockedReasonCodes.includes("low_blended_accuracy") || uniqueBlockedReasonCodes.includes("weak_skill_tags")
      ? level.skillTags.slice(0, 2)
      : level.skillTags.slice(0, 1);

  const blockedReasons = uniqueBlockedReasonCodes.map((code) =>
    buildMetricMessage(code, {
      minAttempts,
      tags: weakSkillTags,
      minCorrectInRecentWindow: settings.minCorrectInRecentWindow,
      recentWindowSize: settings.recentWindowSize,
    })
  );

  const primaryFeedback = canLevelUp
    ? `Strong work. You showed the accuracy, consistency, and independence needed for ${level.name.replace(/^Level \d+ · /, "")}.`
    : blockedReasons[0] || "Keep practicing this level.";

  return {
    pass: canLevelUp,
    canLevelUp,
    tier: theme.key,
    tierLabel: theme.label,
    scoreTier: getScoreTier(levelId, theme),
    threshold,
    totalScore,
    readinessState,
    usedFocusFallback,
    weakSkillTags,
    recommendedPracticeTags,
    blockedReasons,
    blockedReasonCodes: uniqueBlockedReasonCodes,
    primaryFeedback,
    scoreBreakdown: {
      accuracy: buildMetricBlock(
        effectiveBlendedAccuracy,
        accuracyScore,
        hardFailCodes.includes("low_recent_correct") || hardFailCodes.includes("low_blended_accuracy")
      ),
      speed: buildMetricBlock(medianResponseMs, speedScore, hardFailCodes.includes("slow_response")),
      streak: buildMetricBlock(longestRun, streakScore, hardFailCodes.includes("short_streak")),
      hints: buildMetricBlock(hintRate, hintScore, hardFailCodes.includes("high_hint_rate")),
      focus: buildMetricBlock(focusAccuracy, focusScore, false),
    },
    reasons: {
      recentAccuracy: effectiveRecentAccuracy,
      recentCorrectCount: effectiveRecentCorrectCount,
      recentWindowSize: settings.recentWindowSize,
      historicalAccuracy,
      blendedAccuracy: effectiveBlendedAccuracy,
      medianResponseMs,
      hintRate,
      streak: longestRun,
      focusAccuracy,
      attempts,
      minAttempts,
    },
    evidence: {
      attempts,
      minAttempts,
      evaluationWindow,
      masterySettings: settings,
      skillEvidenceSource: usedFocusFallback ? "general_accuracy" : "current_level_skill_tags",
    },
  };
}
