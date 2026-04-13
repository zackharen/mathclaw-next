const PLAYER_MAX_HEALTH = 100;
const OPPONENT_MAX_HEALTH = 100;
const PLAYER_ACTION_MS = 300;
const PLAYER_HURT_MS = 380;
const BETWEEN_ATTACK_MS = 620;

export const SHOWDOWN_DIFFICULTIES = [
  {
    slug: "easy",
    label: "Easy",
    speedMultiplier: 1.9,
    playerWindowMultiplier: 1.35,
    damageMultiplier: 0.82,
    intro: "Very slow reads and roomy counter windows for learning the fight rhythm.",
  },
  {
    slug: "normal",
    label: "Normal",
    speedMultiplier: 1.35,
    playerWindowMultiplier: 1.08,
    damageMultiplier: 0.94,
    intro: "A steady tutorial pace that still gives you time to watch and react.",
  },
  {
    slug: "hard",
    label: "Hard",
    speedMultiplier: 1,
    playerWindowMultiplier: 0.96,
    damageMultiplier: 1.08,
    intro: "Faster reads, tighter counters, and harder punishment on missed defenses.",
  },
];

const ATTACK_LIBRARY = {
  left_jab: {
    key: "left_jab",
    label: "Left Jab",
    telegraphState: "windup_left",
    punchState: "punch_left",
    correctDefense: "dodge_right",
    telegraphMs: 860,
    punchMs: 220,
    recoveryMs: 760,
    hitDamage: 12,
    blockedDamage: 4,
    counterDamage: 16,
  },
  right_jab: {
    key: "right_jab",
    label: "Right Jab",
    telegraphState: "windup_right",
    punchState: "punch_right",
    correctDefense: "dodge_left",
    telegraphMs: 900,
    punchMs: 220,
    recoveryMs: 760,
    hitDamage: 12,
    blockedDamage: 4,
    counterDamage: 16,
  },
  guard_break: {
    key: "guard_break",
    label: "Body Breaker",
    telegraphState: "windup_block",
    punchState: "punch_block",
    correctDefense: "block",
    telegraphMs: 1180,
    punchMs: 260,
    recoveryMs: 980,
    hitDamage: 18,
    blockedDamage: 5,
    counterDamage: 20,
  },
};

export const LINEAR_LARRY = {
  slug: "linear_larry",
  name: "Linear Larry",
  title: "Tutorial Trouble",
  intro:
    "Larry fights in a simple loop. Read the lean, dodge the straight shots, block the heavy rush, then punish the recovery.",
  pattern: ["left_jab", "right_jab", "guard_break"],
};

function getDifficultySettings(difficultySlug = "easy") {
  return (
    SHOWDOWN_DIFFICULTIES.find((difficulty) => difficulty.slug === difficultySlug) ||
    SHOWDOWN_DIFFICULTIES[0]
  );
}

function scaleMs(value, multiplier) {
  return Math.max(120, Math.round(value * multiplier));
}

function buildAttack(attackKey, difficultySlug = "easy") {
  const template = ATTACK_LIBRARY[attackKey] || ATTACK_LIBRARY.left_jab;
  const difficulty = getDifficultySettings(difficultySlug);

  return {
    ...template,
    telegraphMs: scaleMs(template.telegraphMs, difficulty.speedMultiplier),
    punchMs: scaleMs(template.punchMs, Math.max(0.82, difficulty.speedMultiplier * 0.82)),
    recoveryMs: scaleMs(
      template.recoveryMs,
      difficulty.speedMultiplier / difficulty.playerWindowMultiplier
    ),
    hitDamage: Math.max(1, Math.round(template.hitDamage * difficulty.damageMultiplier)),
    blockedDamage: Math.max(1, Math.round(template.blockedDamage * difficulty.damageMultiplier)),
    counterDamage: Math.max(1, Math.round(template.counterDamage * difficulty.playerWindowMultiplier)),
  };
}

function nextPatternIndex(index) {
  return (index + 1) % LINEAR_LARRY.pattern.length;
}

function normalizeClock(state, now) {
  return { ...state, clock: now };
}

function finishFight(state, result, now, effectText) {
  return normalizeClock(
    {
      ...state,
      result,
      finishTime: now,
      effectText,
      enemyState: result === "won" ? "knocked_down" : state.enemyState,
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + 999999,
      playerState: result === "lost" ? "knocked_down" : state.playerState,
      playerStateStartedAt: now,
      playerActionEndsAt: now + 999999,
      playerRecoverUntil: now + 999999,
    },
    now
  );
}

function buildIdleWindow(state, now, delayMs = BETWEEN_ATTACK_MS) {
  return {
    ...state,
    enemyState: "idle",
    enemyStateStartedAt: now,
    enemyStateEndsAt: now + delayMs,
    currentAttack: null,
  };
}

function buildWindupState(state, now, attackKey) {
  const attack = buildAttack(attackKey, state.difficulty);

  return {
    ...state,
    currentAttack: attack,
    enemyState: attack.telegraphState,
    enemyStateStartedAt: now,
    enemyStateEndsAt: now + attack.telegraphMs,
    attackLabel: attack.label,
    flashUntil: 0,
  };
}

export function initialShowdownState(now = Date.now(), difficultySlug = "easy") {
  return normalizeClock(
    {
      opponentSlug: LINEAR_LARRY.slug,
      opponentName: LINEAR_LARRY.name,
      opponentTitle: LINEAR_LARRY.title,
      difficulty: difficultySlug,
      playerHealth: PLAYER_MAX_HEALTH,
      opponentHealth: OPPONENT_MAX_HEALTH,
      playerState: "idle",
      playerStateStartedAt: now,
      playerActionEndsAt: now,
      playerRecoverUntil: now,
      enemyState: "idle",
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + 900,
      patternIndex: 0,
      currentAttack: null,
      attackLabel: "Watch Larry",
      result: "active",
      effectText: "Bell up.",
      attempts: 0,
      punchesLanded: 0,
      punchesMissed: 0,
      successfulDefenses: 0,
      dodges: 0,
      blocks: 0,
      enemyAttacksSeen: 0,
      startTime: now,
      finishTime: null,
      tutorialDrill: null,
    },
    now
  );
}

export function buildShowdownTutorialScenario(step = "dodge", difficultySlug = "easy", now = Date.now()) {
  const base = initialShowdownState(now, difficultySlug);

  if (step === "jab") {
    const tutorialAttack = buildAttack("left_jab", difficultySlug);
    return normalizeClock(
      {
        ...base,
        enemyState: "recovery",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + 1800,
        currentAttack: tutorialAttack,
        attackLabel: "Counter Drill",
        successfulDefenses: 1,
        dodges: 1,
        tutorialDrill: "jab",
      },
      now
    );
  }

  const dodgeAttack = buildAttack("left_jab", difficultySlug);
  return normalizeClock(
    {
      ...base,
      enemyState: dodgeAttack.telegraphState,
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + dodgeAttack.telegraphMs,
      currentAttack: dodgeAttack,
      attackLabel: "Dodge Drill",
      tutorialDrill: "dodge",
    },
    now
  );
}

export function performPlayerAction(state, action, now = Date.now()) {
  if (!state || state.result !== "active") {
    return state;
  }

  let nextState = normalizeClock({ ...state }, now);

  if (nextState.playerState !== "idle" && nextState.playerActionEndsAt <= now) {
    nextState.playerState = "idle";
    nextState.playerStateStartedAt = now;
  }

  const difficulty = getDifficultySettings(state.difficulty);
  const playerActionMs = scaleMs(PLAYER_ACTION_MS, 1 / difficulty.playerWindowMultiplier);
  const playerHurtMs = scaleMs(PLAYER_HURT_MS, 1 / difficulty.playerWindowMultiplier);

  if (action === "dodge_left" || action === "dodge_right") {
    return normalizeClock(
      {
        ...nextState,
        attempts: nextState.attempts + 1,
        playerState: action,
        playerStateStartedAt: now,
        playerActionEndsAt: now + playerActionMs,
      },
      now
    );
  }

  if (action === "block") {
    return normalizeClock(
      {
        ...nextState,
        attempts: nextState.attempts + 1,
        playerState: "block",
        playerStateStartedAt: now,
        playerActionEndsAt: now + playerActionMs + 120,
      },
      now
    );
  }

  if (action !== "jab") {
    return nextState;
  }

  const canLand =
    nextState.enemyState === "recovery" ||
    nextState.enemyState === "stunned" ||
    nextState.enemyState === "hit_reaction";

  if (canLand) {
    const attack = nextState.currentAttack || buildAttack(LINEAR_LARRY.pattern[nextState.patternIndex], nextState.difficulty);
    const damage =
      nextState.enemyState === "stunned" ? attack.counterDamage + 4 : attack.counterDamage;
    const opponentHealth = Math.max(0, nextState.opponentHealth - damage);
    const landedState = normalizeClock(
      {
        ...nextState,
        attempts: nextState.attempts + 1,
        punchesLanded: nextState.punchesLanded + 1,
        opponentHealth,
        playerState: "punch",
        playerStateStartedAt: now,
        playerActionEndsAt: now + playerActionMs,
        enemyState: "hit_reaction",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + 220,
        effectText: opponentHealth <= 0 ? "Larry dropped." : "Counter landed.",
      },
      now
    );

    if (opponentHealth <= 0) {
      return finishFight(landedState, "won", now, "You dropped Linear Larry.");
    }

    return landedState;
  }

  return normalizeClock(
    {
      ...nextState,
      attempts: nextState.attempts + 1,
      punchesMissed: nextState.punchesMissed + 1,
      playerState: "punch",
      playerStateStartedAt: now,
      playerActionEndsAt: now + playerActionMs,
      playerRecoverUntil: now + playerHurtMs,
      effectText: "Swing missed.",
    },
    now
  );
}

function resolvePunchState(state, now) {
  const attack =
    state.currentAttack || buildAttack(LINEAR_LARRY.pattern[state.patternIndex], state.difficulty);
  const playerLocked = state.playerRecoverUntil > now;
  const playerAction = playerLocked ? "locked" : state.playerState;
  const dodged = !playerLocked && playerAction === attack.correctDefense;
  const blocked = !playerLocked && playerAction === "block";

  if (dodged || (attack.correctDefense === "block" && blocked)) {
    return normalizeClock(
      {
        ...state,
        enemyState: "recovery",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + attack.recoveryMs,
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
        successfulDefenses: state.successfulDefenses + 1,
        dodges: dodged ? state.dodges + 1 : state.dodges,
        blocks: blocked ? state.blocks + 1 : state.blocks,
        effectText: "Clean defense.",
      },
      now
    );
  }

  if (blocked && attack.correctDefense !== "block") {
    const playerHealth = Math.max(0, state.playerHealth - attack.blockedDamage);
    const blockedState = normalizeClock(
      {
        ...state,
        playerHealth,
        enemyState: "recovery",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + Math.max(360, attack.recoveryMs - 180),
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
        successfulDefenses: state.successfulDefenses + 1,
        blocks: state.blocks + 1,
        effectText: "You caught some of it.",
      },
      now
    );

    if (playerHealth <= 0) {
      return finishFight(blockedState, "lost", now, "Larry broke through your guard.");
    }

    return blockedState;
  }

  const playerHealth = Math.max(0, state.playerHealth - attack.hitDamage);
  const hitState = normalizeClock(
    {
      ...state,
      playerHealth,
      playerState: "hurt",
      playerStateStartedAt: now,
      playerActionEndsAt: now + PLAYER_HURT_MS,
      playerRecoverUntil: now + PLAYER_HURT_MS + 120,
      enemyAttacksSeen: state.enemyAttacksSeen + 1,
      enemyState: "recovery",
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + Math.max(340, attack.recoveryMs - 260),
      effectText: "Larry lands it.",
    },
    now
  );

  if (playerHealth <= 0) {
    return finishFight(hitState, "lost", now, "You hit the canvas.");
  }

  return hitState;
}

export function stepShowdownFight(state, now = Date.now()) {
  if (!state) return state;

  let nextState = normalizeClock({ ...state }, now);

  if (nextState.result !== "active") {
    return nextState;
  }

  if (nextState.playerState !== "idle" && nextState.playerActionEndsAt <= now) {
    nextState.playerState = "idle";
    nextState.playerStateStartedAt = now;
  }

  if (now < nextState.enemyStateEndsAt) {
    return nextState;
  }

  if (nextState.enemyState === "idle") {
    const attackKey = LINEAR_LARRY.pattern[nextState.patternIndex];
    return normalizeClock(buildWindupState(nextState, now, attackKey), now);
  }

  if (String(nextState.enemyState).startsWith("windup")) {
    return normalizeClock(
      {
        ...nextState,
        enemyState: nextState.currentAttack?.punchState || "punch_left",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + (nextState.currentAttack?.punchMs || 220),
      },
      now
    );
  }

  if (String(nextState.enemyState).startsWith("punch")) {
    return resolvePunchState(nextState, now);
  }

  if (nextState.enemyState === "hit_reaction") {
    return normalizeClock(
      {
        ...nextState,
        enemyState: "stunned",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + 260,
        effectText: "Larry is rattled.",
      },
      now
    );
  }

  if (nextState.enemyState === "recovery" || nextState.enemyState === "stunned") {
    const advancedState = buildIdleWindow(
      {
        ...nextState,
        patternIndex: nextPatternIndex(nextState.patternIndex),
      },
      now
    );
    return normalizeClock(advancedState, now);
  }

  return nextState;
}

export function showdownScore(state) {
  if (!state) return 0;
  const elapsedMs = Math.max(1, (state.finishTime || Date.now()) - (state.startTime || Date.now()));
  const speedBonus = Math.max(0, 100 - Math.floor(elapsedMs / 900));

  return Math.round(
    (state.result === "won" ? 220 : 40) +
      state.playerHealth * 1.7 +
      state.punchesLanded * 22 +
      state.successfulDefenses * 16 +
      speedBonus -
      state.punchesMissed * 7
  );
}
