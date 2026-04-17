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
  assert.equal(result.blockedReasonCodes.includes("low_accuracy"), true);
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
  const entries = Array.from({ length: 14 }, () =>
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

test("tier thresholds differ correctly by level range", () => {
  const tierCases = [
    { levelId: 5, threshold: 300 },
    { levelId: 20, threshold: 350 },
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
      name: "close but blocked by score threshold",
      entries: [
        ...Array.from({ length: 5 }, () =>
          makeEntry({
            levelId: 22,
            responseMs: 8200,
            hintUsed: false,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        makeEntry({
          levelId: 22,
          correct: false,
          responseMs: 8200,
          hintUsed: false,
          skillTags: ["mixed_integer_operations", "medium_numbers"],
        }),
        ...Array.from({ length: 3 }, (_, index) =>
          makeEntry({
            levelId: 22,
            responseMs: 8200,
            hintUsed: index < 2,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
        makeEntry({
          levelId: 22,
          correct: false,
          responseMs: 8200,
          hintUsed: false,
          skillTags: ["mixed_integer_operations", "medium_numbers"],
        }),
        ...Array.from({ length: 2 }, () =>
          makeEntry({
            levelId: 22,
            responseMs: 8200,
            hintUsed: false,
            skillTags: ["mixed_integer_operations", "medium_numbers"],
          })
        ),
      ],
      blockedReason: "score_threshold",
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
