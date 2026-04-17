import { INTEGER_PROGRESSION_RULES, getProgressionTheme } from "./levels.js";

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

function longestStreak(history) {
  return (history || []).reduce(
    (result, entry) => {
      const run = entry.correct ? result.run + 1 : 0;
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

function summarizeSkill(history, skillTag) {
  const matching = (history || []).filter((entry) => (entry.skillTags || []).includes(skillTag));
  if (!matching.length) return null;
  return {
    attempts: matching.length,
    accuracy: accuracy(matching.map((entry) => entry.correct)),
    hintRate: matching.length ? matching.filter((entry) => entry.hintUsed).length / matching.length : 0,
    medianResponseMs: median(matching.map((entry) => entry.responseMs)),
  };
}

function buildMetricMessage(reasonCode, context = {}) {
  switch (reasonCode) {
    case "insufficient_attempts":
      return `Keep going. I need ${context.minAttempts} solid reps on this level before I can move you up.`;
    case "low_accuracy":
      return "Keep building understanding first. This level still needs stronger accuracy.";
    case "low_focus_accuracy":
      return "You’re close overall, but the main skill for this level still needs more accurate practice.";
    case "short_streak":
      return "Great work so far. Build a slightly longer streak to show consistency.";
    case "high_hint_rate":
      return "You’re solving correctly, but this level needs less hint usage.";
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

export function evaluateLevelProgression({ level, profile, profileSummary = null }) {
  const levelId = Number(level?.id || 1);
  const theme = getProgressionTheme(levelId);
  const threshold = getTierThreshold(levelId);
  const minAttempts = getMinAttempts(levelId, level, theme);
  const evaluationWindow = Math.max(getEvaluationWindow(levelId), minAttempts);
  const history = Array.isArray(profile?.rollingHistory) ? profile.rollingHistory : [];
  const levelHistory = history.filter((entry) => Number(entry?.levelId || 0) === levelId).slice(0, evaluationWindow);
  const accuracyWindow = levelHistory.slice(0, 10);

  const last10Accuracy = accuracy(accuracyWindow.map((entry) => entry.correct));
  const medianResponseMs = median(levelHistory.map((entry) => entry.responseMs));
  const hintRate = levelHistory.length ? levelHistory.filter((entry) => entry.hintUsed).length / levelHistory.length : 0;
  const longestRun = longestStreak(levelHistory);
  const attempts = levelHistory.length;

  const skillEvidence = level.skillTags.map((tag) => {
    const currentLevelSample = summarizeSkill(levelHistory, tag);
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
    ? last10Accuracy
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

  const rules = INTEGER_PROGRESSION_RULES.hardFail;
  const hardFailCodes = [];
  if (last10Accuracy < rules.minAccuracy) hardFailCodes.push("low_accuracy");
  if (focusAccuracy < rules.minFocusAccuracy) hardFailCodes.push("low_focus_accuracy");
  if (longestRun < rules.minStreak) hardFailCodes.push("short_streak");
  if (hintRate > rules.maxHintRate) hardFailCodes.push("high_hint_rate");

  const insufficientAttempts = attempts < minAttempts;
  const struggling =
    last10Accuracy < INTEGER_PROGRESSION_RULES.struggling.minAccuracy ||
    hintRate > INTEGER_PROGRESSION_RULES.struggling.maxHintRate;

  const accuracyScore = scoreFromMinimumBands(last10Accuracy, INTEGER_PROGRESSION_RULES.scoring.accuracyBands);
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
  if (!insufficientAttempts && !hardFailCodes.length && !struggling && !weakSkillTags.length && totalScore < threshold) {
    blockedReasonCodes.push("score_threshold");
  }

  const uniqueBlockedReasonCodes = [...new Set(blockedReasonCodes)];
  const canLevelUp =
    !insufficientAttempts &&
    !hardFailCodes.length &&
    !struggling &&
    !weakSkillTags.length &&
    totalScore >= threshold;

  const readinessState = canLevelUp
    ? "ready"
    : insufficientAttempts
      ? "building_evidence"
      : struggling
        ? "struggling"
        : totalScore >= threshold - INTEGER_PROGRESSION_RULES.closeThresholdBuffer
          ? "close"
          : "not_ready";

  const recommendedPracticeTags = weakSkillTags.length
    ? weakSkillTags
    : uniqueBlockedReasonCodes.includes("low_focus_accuracy") || uniqueBlockedReasonCodes.includes("weak_skill_tags")
      ? level.skillTags.slice(0, 2)
      : level.skillTags.slice(0, 1);

  const blockedReasons = uniqueBlockedReasonCodes.map((code) =>
    buildMetricMessage(code, { minAttempts, tags: weakSkillTags })
  );

  const primaryFeedback = canLevelUp
    ? `Strong work. You showed the accuracy, fluency, and independence needed for ${level.name.replace(/^Level \d+ · /, "")}.`
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
      accuracy: buildMetricBlock(last10Accuracy, accuracyScore, hardFailCodes.includes("low_accuracy")),
      speed: buildMetricBlock(medianResponseMs, speedScore, false),
      streak: buildMetricBlock(longestRun, streakScore, hardFailCodes.includes("short_streak")),
      hints: buildMetricBlock(hintRate, hintScore, hardFailCodes.includes("high_hint_rate")),
      focus: buildMetricBlock(focusAccuracy, focusScore, hardFailCodes.includes("low_focus_accuracy")),
    },
    reasons: {
      recentAccuracy: last10Accuracy,
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
      skillEvidenceSource: usedFocusFallback ? "general_accuracy" : "current_level_skill_tags",
    },
  };
}
