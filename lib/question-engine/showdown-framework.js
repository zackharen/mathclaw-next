const PLAYER_MAX_HEALTH = 100;
const OPPONENT_MAX_HEALTH = 100;
const BASE_PLAYER_ACTION_MS = 260;
const BASE_PLAYER_STUN_MS = 260;
const BASE_BLOCK_WINDOW_MS = 260;

export const SHOWDOWN_DIFFICULTIES = [
  {
    slug: "easy",
    label: "Easy",
    speedMultiplier: 1.55,
    playerWindowMultiplier: 1.28,
    damageMultiplier: 0.85,
    intro: "Extra-slow tells and wider recovery windows for learning Larry's pattern.",
  },
  {
    slug: "normal",
    label: "Normal",
    speedMultiplier: 1,
    playerWindowMultiplier: 1,
    damageMultiplier: 1,
    intro: "The standard tutorial fight pace.",
  },
  {
    slug: "hard",
    label: "Hard",
    speedMultiplier: 0.82,
    playerWindowMultiplier: 0.92,
    damageMultiplier: 1.12,
    intro: "Faster reads, tighter counters, and harder punches.",
  },
];

export const LINEAR_LARRY = {
  slug: "linear_larry",
  name: "Linear Larry",
  title: "Tutorial Trouble",
  intro:
    "Larry is a steady tutorial boxer. Watch his shoulders, learn the side of each punch, then counter during recovery.",
  pattern: [
    {
      key: "left_jab",
      label: "Left Jab",
      side: "left",
      dodge: "dodge_right",
      telegraphMs: 700,
      punchMs: 220,
      recoveryMs: 420,
      damage: 12,
      blockedDamage: 4,
      openingDamage: 12,
      guaranteedOpening: false,
    },
    {
      key: "right_jab",
      label: "Right Jab",
      side: "right",
      dodge: "dodge_left",
      telegraphMs: 760,
      punchMs: 220,
      recoveryMs: 420,
      damage: 12,
      blockedDamage: 4,
      openingDamage: 12,
      guaranteedOpening: false,
    },
    {
      key: "linear_cross",
      label: "Linear Cross",
      side: "left",
      dodge: "dodge_right",
      telegraphMs: 1040,
      punchMs: 280,
      recoveryMs: 760,
      damage: 18,
      blockedDamage: 7,
      openingDamage: 16,
      guaranteedOpening: true,
    },
  ],
};

function getAttack(index) {
  return LINEAR_LARRY.pattern[index % LINEAR_LARRY.pattern.length];
}

function getDifficultySettings(difficultySlug = "easy") {
  return SHOWDOWN_DIFFICULTIES.find((difficulty) => difficulty.slug === difficultySlug) || SHOWDOWN_DIFFICULTIES[0];
}

function scaleMs(value, multiplier) {
  return Math.max(120, Math.round(value * multiplier));
}

function nextPatternIndex(index) {
  return (index + 1) % LINEAR_LARRY.pattern.length;
}

function buildTelegraphState(patternIndex, now, difficultySlug = "easy", previousAttackLabel = "") {
  const attack = getAttack(patternIndex);
  const difficulty = getDifficultySettings(difficultySlug);

  return {
    enemyState: "windup",
    enemyStateStartedAt: now,
    enemyStateEndsAt: now + scaleMs(attack.telegraphMs, difficulty.speedMultiplier),
    pendingAttack: {
      ...attack,
      telegraphMs: scaleMs(attack.telegraphMs, difficulty.speedMultiplier),
      punchMs: scaleMs(attack.punchMs, difficulty.speedMultiplier),
      recoveryMs: scaleMs(attack.recoveryMs, difficulty.speedMultiplier / difficulty.playerWindowMultiplier),
      damage: Math.max(1, Math.round(attack.damage * difficulty.damageMultiplier)),
      blockedDamage: Math.max(1, Math.round(attack.blockedDamage * difficulty.damageMultiplier)),
    },
    attackLabel: attack.label,
    telegraphSide: attack.side,
    flashUntil: now + 140,
    effectText: previousAttackLabel ? `${previousAttackLabel} finished. New tell incoming.` : "Larry starts to wind up.",
  };
}

function deriveVisuals(state, now) {
  const bob = Math.sin(now / 180) * 6;
  const pulse = Math.sin(now / 95);
  const stateElapsed = now - (state.enemyStateStartedAt || now);
  const enemyCenterXBase = 0;
  let enemyCenterX = enemyCenterXBase;
  let enemyCenterY = bob;
  let enemyScale = 1;
  let enemyRotation = 0;
  let enemyTint = "normal";
  let enemyArmLeft = { x: -44, y: 6, scale: 1 };
  let enemyArmRight = { x: 44, y: 6, scale: 1 };

  if (state.enemyState === "windup") {
    const hopProgress = Math.min(1, stateElapsed / Math.max(1, state.pendingAttack?.telegraphMs || 1));
    const hopArc = Math.sin(hopProgress * Math.PI);
    enemyTint = pulse > 0.35 ? "flash" : "normal";
    enemyCenterX += (state.telegraphSide === "left" ? -24 : 24) + (state.telegraphSide === "left" ? -8 : 8) * hopProgress;
    enemyCenterY -= 18 * hopArc;
    enemyScale = 1 + hopArc * 0.05;
    enemyRotation = (state.telegraphSide === "left" ? -10 : 10) + (state.telegraphSide === "left" ? -4 : 4) * hopProgress;
    if (state.telegraphSide === "left") {
      enemyArmLeft = { x: -56, y: -6 - hopArc * 6, scale: 1.18 };
      enemyArmRight = { x: 40, y: 8, scale: 0.96 };
    } else {
      enemyArmLeft = { x: -40, y: 8, scale: 0.96 };
      enemyArmRight = { x: 56, y: -6 - hopArc * 6, scale: 1.18 };
    }
  } else if (state.enemyState === "punch") {
    enemyCenterX += state.pendingAttack?.side === "left" ? -36 : 36;
    enemyCenterY -= 12;
    enemyScale = 1.06;
    if (state.pendingAttack?.side === "left") {
      enemyArmLeft = { x: -66, y: -8, scale: 1.28 };
    } else {
      enemyArmRight = { x: 66, y: -8, scale: 1.28 };
    }
  } else if (state.enemyState === "recovery") {
    enemyCenterY += 6;
    enemyRotation = state.lastDefenseSuccess ? (state.pendingAttack?.side === "left" ? 7 : -7) : 4;
  } else if (state.enemyState === "stunned") {
    enemyCenterY += 10;
    enemyRotation = Math.sin(now / 70) * 8;
    enemyTint = "stunned";
  } else if (state.result === "won") {
    enemyCenterY += 60;
    enemyRotation = -15;
    enemyTint = "stunned";
  }

  let playerOffsetX = 0;
  let playerOffsetY = 0;
  let gloveSpread = 88;
  let gloveY = state.playerState === "block" ? -10 : 0;
  let leftGlovePunchX = 0;
  let rightGlovePunchX = 0;
  let playerTint = "normal";

  if (state.playerState === "dodge_left") {
    playerOffsetX = -48;
  } else if (state.playerState === "dodge_right") {
    playerOffsetX = 48;
  } else if (state.playerState === "block") {
    gloveSpread = 54;
    gloveY = -28;
  } else if (state.playerState === "jab") {
    rightGlovePunchX = 72;
    gloveY = -26;
  } else if (state.result === "lost") {
    playerOffsetY = 60;
    playerTint = "stunned";
  }

  return {
    enemy: {
      centerX: enemyCenterX,
      centerY: enemyCenterY,
      scale: enemyScale,
      rotation: enemyRotation,
      tint: enemyTint,
      armLeft: enemyArmLeft,
      armRight: enemyArmRight,
    },
    player: {
      offsetX: playerOffsetX,
      offsetY: playerOffsetY,
      gloveSpread,
      gloveY,
      leftGlovePunchX,
      rightGlovePunchX,
      tint: playerTint,
    },
  };
}

function withVisuals(state, now) {
  return {
    ...state,
    visuals: deriveVisuals(state, now),
  };
}

function finishFight(state, result, now, effectText) {
  return withVisuals(
    {
      ...state,
      result,
      finishTime: now,
      effectText,
      enemyState: result === "won" ? "stunned" : state.enemyState,
      playerState: result === "lost" ? "hurt" : state.playerState,
      enemyStateEndsAt: now + 999999,
      playerActionEndsAt: now + 999999,
    },
    now
  );
}

export function initialShowdownState(now = Date.now(), difficultySlug = "easy") {
  const telegraph = buildTelegraphState(0, now, difficultySlug);

  return withVisuals(
    {
      opponentSlug: LINEAR_LARRY.slug,
      opponentName: LINEAR_LARRY.name,
      opponentTitle: LINEAR_LARRY.title,
      difficulty: difficultySlug,
      playerHealth: PLAYER_MAX_HEALTH,
      opponentHealth: OPPONENT_MAX_HEALTH,
      playerState: "idle",
      playerActionEndsAt: 0,
      playerRecoverUntil: 0,
      enemyState: telegraph.enemyState,
      enemyStateStartedAt: telegraph.enemyStateStartedAt,
      enemyStateEndsAt: telegraph.enemyStateEndsAt,
      patternIndex: 0,
      pendingAttack: telegraph.pendingAttack,
      telegraphSide: telegraph.telegraphSide,
      attackLabel: telegraph.attackLabel,
      flashUntil: telegraph.flashUntil,
      lastDefenseSuccess: false,
      lastHitWasBlocked: false,
      result: "active",
      effectText: "Watch Larry's shoulders, then react.",
      attempts: 0,
      punchesLanded: 0,
      punchesMissed: 0,
      successfulDefenses: 0,
      dodges: 0,
      blocks: 0,
      enemyAttacksSeen: 0,
      startTime: now,
      finishTime: null,
    },
    now
  );
}

export function performPlayerAction(state, action, now = Date.now()) {
  if (!state || state.result !== "active") {
    return state;
  }

  let nextState = { ...state };

  if (nextState.playerState !== "idle" && nextState.playerActionEndsAt <= now) {
    nextState.playerState = "idle";
  }

  const difficulty = getDifficultySettings(state.difficulty);
  const playerActionMs = scaleMs(BASE_PLAYER_ACTION_MS, difficulty.playerWindowMultiplier);
  const playerStunMs = scaleMs(BASE_PLAYER_STUN_MS, difficulty.playerWindowMultiplier);
  const blockWindowMs = scaleMs(BASE_BLOCK_WINDOW_MS, difficulty.playerWindowMultiplier);

  if (action === "dodge_left" || action === "dodge_right") {
    nextState = {
      ...nextState,
      attempts: nextState.attempts + 1,
      playerState: action,
      playerActionEndsAt: now + playerActionMs,
      effectText: action === "dodge_left" ? "Slip left." : "Slip right.",
    };
    return withVisuals(nextState, now);
  }

  if (action === "block") {
    nextState = {
      ...nextState,
      attempts: nextState.attempts + 1,
      playerState: "block",
      playerActionEndsAt: now + blockWindowMs,
      effectText: "Guard up.",
    };
    return withVisuals(nextState, now);
  }

  if (action !== "jab") {
    return withVisuals(nextState, now);
  }

  const canLand = nextState.enemyState === "recovery" || nextState.enemyState === "stunned";
  if (canLand) {
    const attack = nextState.pendingAttack || getAttack(nextState.patternIndex);
    const damage = nextState.enemyState === "stunned" ? attack.openingDamage + 2 : attack.openingDamage;
    const opponentHealth = Math.max(0, nextState.opponentHealth - damage);
    const landedState = {
      ...nextState,
      attempts: nextState.attempts + 1,
      punchesLanded: nextState.punchesLanded + 1,
      opponentHealth,
      playerState: "jab",
      playerActionEndsAt: now + playerActionMs,
      enemyState: "stunned",
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + 360,
      effectText: opponentHealth <= 0 ? "Larry is down." : "Clean hit.",
      flashUntil: now + 120,
    };

    if (opponentHealth <= 0) {
      return finishFight(landedState, "won", now, "You dropped Linear Larry.");
    }

    return withVisuals(landedState, now);
  }

  return withVisuals(
    {
      ...nextState,
      attempts: nextState.attempts + 1,
      punchesMissed: nextState.punchesMissed + 1,
      playerState: "jab",
      playerActionEndsAt: now + playerActionMs,
      playerRecoverUntil: now + playerStunMs,
      effectText: "Too early.",
    },
    now
  );
}

export function stepShowdownFight(state, now = Date.now()) {
  if (!state) return state;
  if (state.result !== "active") {
    return withVisuals(state, now);
  }

  let nextState = { ...state };

  if (nextState.playerState !== "idle" && nextState.playerActionEndsAt <= now) {
    nextState.playerState = "idle";
  }

  if (nextState.flashUntil && nextState.flashUntil < now) {
    nextState.flashUntil = 0;
  }

  if (now < nextState.enemyStateEndsAt) {
    return withVisuals(nextState, now);
  }

  if (nextState.enemyState === "windup") {
    nextState = {
      ...nextState,
      enemyState: "punch",
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + nextState.pendingAttack.punchMs,
      effectText: nextState.pendingAttack.label,
      flashUntil: now + 120,
    };
    return withVisuals(nextState, now);
  }

  if (nextState.enemyState === "punch") {
    const playerLocked = nextState.playerRecoverUntil > now;
    const dodged = !playerLocked && nextState.playerState === nextState.pendingAttack.dodge;
    const blocked = !playerLocked && nextState.playerState === "block";

    if (dodged) {
      nextState = {
        ...nextState,
        enemyState: "recovery",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + nextState.pendingAttack.recoveryMs + 180,
        enemyAttacksSeen: nextState.enemyAttacksSeen + 1,
        successfulDefenses: nextState.successfulDefenses + 1,
        dodges: nextState.dodges + 1,
        lastDefenseSuccess: true,
        lastHitWasBlocked: false,
        effectText: "Perfect dodge. Counter now.",
      };
      return withVisuals(nextState, now);
    }

    if (blocked) {
      const playerHealth = Math.max(0, nextState.playerHealth - nextState.pendingAttack.blockedDamage);
      const blockedState = {
        ...nextState,
        playerHealth,
        enemyState: "recovery",
        enemyStateStartedAt: now,
        enemyStateEndsAt: now + nextState.pendingAttack.recoveryMs,
        enemyAttacksSeen: nextState.enemyAttacksSeen + 1,
        successfulDefenses: nextState.successfulDefenses + 1,
        blocks: nextState.blocks + 1,
        lastDefenseSuccess: true,
        lastHitWasBlocked: true,
        effectText: "Block and answer back.",
      };

      if (playerHealth <= 0) {
        return finishFight(blockedState, "lost", now, "Larry broke through your block.");
      }

      return withVisuals(blockedState, now);
    }

    const playerHealth = Math.max(0, nextState.playerHealth - nextState.pendingAttack.damage);
    const hitState = {
      ...nextState,
      playerHealth,
      playerState: "hurt",
      playerActionEndsAt: now + 320,
      playerRecoverUntil: now + 420,
      enemyAttacksSeen: nextState.enemyAttacksSeen + 1,
      enemyState: "recovery",
      enemyStateStartedAt: now,
      enemyStateEndsAt: now + (nextState.pendingAttack.guaranteedOpening ? 520 : 280),
      lastDefenseSuccess: false,
      lastHitWasBlocked: false,
      effectText: "Larry lands it.",
      flashUntil: now + 160,
    };

    if (playerHealth <= 0) {
      return finishFight(hitState, "lost", now, "You hit the canvas.");
    }

    return withVisuals(hitState, now);
  }

  if (nextState.enemyState === "recovery" || nextState.enemyState === "stunned") {
    const nextIndex = nextPatternIndex(nextState.patternIndex);
    const telegraph = buildTelegraphState(nextIndex, now, nextState.difficulty, nextState.attackLabel);
    nextState = {
      ...nextState,
      patternIndex: nextIndex,
      enemyState: telegraph.enemyState,
      enemyStateStartedAt: telegraph.enemyStateStartedAt,
      enemyStateEndsAt: telegraph.enemyStateEndsAt,
      pendingAttack: telegraph.pendingAttack,
      telegraphSide: telegraph.telegraphSide,
      attackLabel: telegraph.attackLabel,
      flashUntil: telegraph.flashUntil,
      effectText: nextState.lastDefenseSuccess
        ? "Larry resets. Read the next side."
        : "Larry keeps coming. Watch the tell."
    };
    return withVisuals(nextState, now);
  }

  return withVisuals(nextState, now);
}

export function showdownScore(state) {
  if (!state) return 0;
  const elapsedMs = Math.max(1, (state.finishTime || Date.now()) - (state.startTime || Date.now()));
  const speedBonus = Math.max(0, 100 - Math.floor(elapsedMs / 900));
  return Math.round(
    (state.result === "won" ? 220 : 40) +
      state.playerHealth * 1.6 +
      state.punchesLanded * 20 +
      state.successfulDefenses * 14 +
      speedBonus -
      state.punchesMissed * 6
  );
}
