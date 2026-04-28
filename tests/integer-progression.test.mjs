import test from "node:test";
import assert from "node:assert/strict";

import { getLevelById } from "../lib/integer-practice/levels.js";
import { evaluateLevelProgression } from "../lib/integer-practice/progression.js";

function makeEntry({
  levelId,
  correct = true,
  responseMs = 2500,
  hintUsed = false,
  skillTags = ["mixed_integer_operations", "medium_numbers"],
} = {}) {
  return {
    levelId,
    correct,
    responseMs,
    hintUsed,
    skillTags,
  };
}

function buildProfile(entries) {
  return {
    rollingHistory: entries,
  };
}

test("student levels up with strong metrics", () => {
  const level = getLevelById(12);
  const entries = Array.from({ length: 12 }, () =>
    makeEntry({
      levelId: 12,
      responseMs: 2600,
      skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
    })
  );
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.canLevelUp, true);
  assert.equal(result.readinessState, "ready");
  assert.equal(result.totalScore >= result.threshold, true);
});

test("student is blocked by a hard fail", () => {
  const level = getLevelById(12);
  const entries = [
    ...Array.from({ length: 7 }, () =>
      makeEntry({
        levelId: 12,
        correct: true,
        responseMs: 2600,
        skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
      })
    ),
    ...Array.from({ length: 5 }, () =>
      makeEntry({
        levelId: 12,
        correct: false,
        responseMs: 2600,
        skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
      })
    ),
  ];
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.blockedReasonCodes.includes("low_recent_correct"), true);
});

test("student is blocked despite high score because of weak skill tag mastery", () => {
  const level = getLevelById(24);
  const entries = [
    ...Array.from({ length: 9 }, () =>
      makeEntry({
        levelId: 24,
        correct: true,
        responseMs: 2600,
        skillTags: ["mixed_integer_operations", "medium_numbers"],
      })
    ),
    ...Array.from({ length: 3 }, () =>
      makeEntry({
        levelId: 24,
        correct: false,
        responseMs: 2600,
        skillTags: ["crosses_zero", "mixed_integer_operations", "medium_numbers"],
      })
    ),
  ];
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.weakSkillTags.includes("crosses_zero"), true);
  assert.equal(result.blockedReasonCodes.includes("weak_skill_tags"), true);
});

test("student is blocked because of insufficient attempts", () => {
  const level = getLevelById(32);
  const entries = Array.from({ length: 9 }, () =>
    makeEntry({
      levelId: 32,
      responseMs: 2300,
      skillTags: ["mixed_integer_operations", "large_numbers"],
    })
  );
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.blockedReasonCodes.includes("insufficient_attempts"), true);
});

test("focusAccuracy fallback works correctly when skillTag data is sparse", () => {
  const level = getLevelById(25);
  const entries = Array.from({ length: 12 }, () =>
    makeEntry({
      levelId: 25,
      responseMs: 2800,
      skillTags: ["mixed_integer_operations"],
    })
  );
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.usedFocusFallback, true);
  assert.equal(result.scoreBreakdown.focus.raw, result.scoreBreakdown.accuracy.raw);
});

test("stale older skill history does not weak-skill block current level promotion", () => {
  const level = getLevelById(25);
  const entries = [
    ...Array.from({ length: 12 }, () =>
      makeEntry({
        levelId: 25,
        responseMs: 2600,
        skillTags: ["medium_numbers"],
      })
    ),
    ...Array.from({ length: 8 }, () =>
      makeEntry({
        levelId: 21,
        correct: false,
        responseMs: 2600,
        hintUsed: true,
        skillTags: ["subtraction_to_negative", "medium_numbers"],
      })
    ),
  ];
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.weakSkillTags.includes("subtraction_to_negative"), false);
});

test("global mastery threshold is shared across level ranges", () => {
  const tierCases = [
    { levelId: 5, threshold: 400 },
    { levelId: 20, threshold: 400 },
    { levelId: 39, threshold: 400 },
  ];

  for (const tierCase of tierCases) {
    const level = getLevelById(tierCase.levelId);
    const entries = Array.from({ length: 15 }, () =>
      makeEntry({
        levelId: tierCase.levelId,
        responseMs: 2400,
        skillTags: level.skillTags,
      })
    );
    const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });
    assert.equal(result.threshold, tierCase.threshold);
  }
});

test("hint-heavy behavior blocks progress correctly", () => {
  const level = getLevelById(18);
  const entries = Array.from({ length: 12 }, () =>
    makeEntry({
      levelId: 18,
      responseMs: 2800,
      hintUsed: true,
      skillTags: ["subtract_negative", "medium_numbers"],
    })
  );
  const result = evaluateLevelProgression({ level, profile: buildProfile(entries) });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.blockedReasonCodes.includes("high_hint_rate"), true);
});

test("custom mastery settings can tighten recent correct requirement", () => {
  const level = getLevelById(12);
  const entries = [
    ...Array.from({ length: 8 }, () =>
      makeEntry({
        levelId: 12,
        responseMs: 2600,
        skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
      })
    ),
    ...Array.from({ length: 2 }, () =>
      makeEntry({
        levelId: 12,
        correct: false,
        responseMs: 2600,
        skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
      })
    ),
  ];
  const result = evaluateLevelProgression({
    level,
    profile: buildProfile(entries),
    masterySettings: {
      minAttempts: 10,
      recentWindowSize: 10,
      minCorrectInRecentWindow: 9,
      minCorrectStreak: 5,
      minBlendedAccuracy: 0.8,
      useHintGate: true,
      maxHintRate: 0.2,
    },
  });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.blockedReasonCodes.includes("low_recent_correct"), true);
});

test("custom mastery settings can require first-try correctness", () => {
  const level = getLevelById(12);
  const entries = Array.from({ length: 10 }, () => ({
    ...makeEntry({
      levelId: 12,
      responseMs: 2600,
      skillTags: ["positive_plus_negative", "different_sign_addition", "small_numbers"],
    }),
    attemptsUsed: 2,
  }));
  const result = evaluateLevelProgression({
    level,
    profile: buildProfile(entries),
    masterySettings: {
      minAttempts: 10,
      recentWindowSize: 10,
      minCorrectInRecentWindow: 8,
      minCorrectStreak: 5,
      minBlendedAccuracy: 0.8,
      countRetriesAsCorrect: false,
    },
  });

  assert.equal(result.canLevelUp, false);
  assert.equal(result.blockedReasonCodes.includes("low_recent_correct"), true);
});

test("saved aggregate level stats can place a student without full question history", () => {
  const level = getLevelById(12);
  const result = evaluateLevelProgression({
    level,
    profile: {
      rollingHistory: [],
      levelStats: {
        12: {
          attempts: 20,
          correct: 18,
          firstTryCorrect: 18,
          hintsUsed: 0,
          totalResponseMs: 52000,
          bestStreak: 12,
          bestFirstTryStreak: 12,
        },
      },
    },
    masterySettings: {
      minAttempts: 10,
      recentWindowSize: 10,
      minCorrectInRecentWindow: 8,
      minCorrectStreak: 5,
      minBlendedAccuracy: 0.8,
    },
  });

  assert.equal(result.canLevelUp, true);
  assert.equal(result.evidence.attempts, 20);
  assert.equal(result.reasons.historicalAccuracy, 0.9);
});

test("borderline threshold cases behave predictably", () => {
  const cases = [
    {
      name: "close but blocked by streak",
      entries: [
        ...Array.from({ length: 4 }, () =>
          makeEntry({
            levelId: 28,
            responseMs: 2800,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        makeEntry({
          levelId: 28,
          correct: false,
          responseMs: 2800,
          skillTags: ["mixed_integer_operations", "medium_numbers"],
        }),
        ...Array.from({ length: 4 }, () =>
          makeEntry({
            levelId: 28,
            responseMs: 2800,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        makeEntry({
          levelId: 28,
          correct: false,
          responseMs: 2800,
          skillTags: ["mixed_integer_operations", "medium_numbers"],
        }),
        ...Array.from({ length: 4 }, () =>
          makeEntry({
            levelId: 28,
            responseMs: 2800,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
      ],
      blockedReason: "short_streak",
    },
    {
      name: "close but blocked by blended accuracy",
      entries: [
        ...Array.from({ length: 8 }, () =>
          makeEntry({
            levelId: 22,
            responseMs: 4200,
            hintUsed: false,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        ...Array.from({ length: 2 }, () =>
          makeEntry({
            levelId: 22,
            correct: false,
            responseMs: 4200,
            hintUsed: false,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        ...Array.from({ length: 10 }, () =>
          makeEntry({
            levelId: 22,
            correct: false,
            responseMs: 4200,
            hintUsed: false,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
      ],
      blockedReason: "low_blended_accuracy",
    },
  ];

  for (const scenario of cases) {
    const levelId = scenario.entries[0].levelId;
    const result = evaluateLevelProgression({
      level: getLevelById(levelId),
      profile: buildProfile(scenario.entries),
    });
    assert.equal(result.canLevelUp, false, scenario.name);
    assert.equal(result.blockedReasonCodes.includes(scenario.blockedReason), true, scenario.name);
  }
});
