const PLAYER_MAX_HEALTH = 100;
const OPPONENT_MAX_HEALTH = 100;
const DEFENSE_DURATION_MS = 520;
const PUNCH_DURATION_MS = 320;
const WHIFF_RECOVERY_MS = 480;
const RESET_DURATION_MS = 460;

export const LINEAR_LARRY = {
  slug: "linear_larry",
  name: "Linear Larry",
  title: "Tutorial Trouble",
  intro:
    "Larry throws a clean, predictable pattern. Read the tell, dodge or block, and jab when he leaves himself open.",
  pattern: [
    {
      key: "left_hook",
      label: "Left Hook",
      telegraph: "Larry dips his left shoulder.",
      dodge: "dodge_right",
      damage: 14,
      blockedDamage: 4,
      telegraphMs: 900,
      openingMs: 760,
      openingHits: 1,
    },
    {
      key: "right_hook",
      label: "Right Hook",
      telegraph: "Larry loads up his right glove.",
      dodge: "dodge_left",
      damage: 14,
      blockedDamage: 4,
      telegraphMs: 920,
      openingMs: 760,
      openingHits: 1,
    },
    {
      key: "big_cross",
      label: "Big Cross",
      telegraph: "Larry winds way back for a huge cross.",
      dodge: "dodge_right",
      damage: 18,
      blockedDamage: 6,
      telegraphMs: 1100,
      openingMs: 1150,
      openingHits: 2,
      guaranteedOpening: true,
    },
  ],
};

function nextPatternIndex(index) {
  return (index + 1) % LINEAR_LARRY.pattern.length;
}

function currentAttack(state) {
  return LINEAR_LARRY.pattern[state.patternIndex] || LINEAR_LARRY.pattern[0];
}

function normalizePlayerPose(state, now) {
  if (state.playerPose !== "guard" && state.actionExpiresAt <= now) {
    return {
      ...state,
      playerPose: "guard",
    };
  }

  return state;
}

function startTelegraph(state, now, statusText) {
  const attack = currentAttack(state);

  return {
    ...normalizePlayerPose(state, now),
    enemyPhase: "telegraph",
    telegraphText: attack.telegraph,
    enemyActionLabel: attack.label,
    phaseEndsAt: now + attack.telegraphMs,
    openingHitsRemaining: 0,
    statusText,
  };
}

function finishFight(state, result, now, statusText) {
  return {
    ...state,
    result,
    finishTime: now,
    enemyPhase: "finished",
    statusText,
    telegraphText: result === "won" ? "Larry is down for the count." : "You hit the canvas.",
  };
}

function advanceAfterCurrentAttack(state, now, statusText) {
  const wrappedIndex = nextPatternIndex(state.patternIndex);
  const cycleRestart = wrappedIndex === 0;

  return {
    ...state,
    patternIndex: wrappedIndex,
    enemyPhase: "reset",
    phaseEndsAt: now + RESET_DURATION_MS,
    telegraphText: cycleRestart ? "Larry resets to the top of his pattern." : "Larry regains his stance.",
    enemyActionLabel: cycleRestart ? "Pattern Restart" : "Reset",
    statusText,
    openingHitsRemaining: 0,
  };
}

function openCounterWindow(state, now, openingMs, openingHits, statusText) {
  return {
    ...state,
    enemyPhase: "opening",
    phaseEndsAt: now + openingMs,
    openingHitsRemaining: openingHits,
    telegraphText: "Larry is wide open. Jab now.",
    enemyActionLabel: "Opening",
    statusText,
    playerPose: "guard",
  };
}

function resolveEnemyAttack(state, now) {
  const attack = currentAttack(state);
  const vulnerable = state.recoverUntil > now;
  const dodged = !vulnerable && state.playerPose === attack.dodge;
  const blocked = !vulnerable && state.playerPose === "block";
  const nextPattern = nextPatternIndex(state.patternIndex);
  const cycleRestart = nextPattern === 0;

  if (dodged) {
    return openCounterWindow(
      {
        ...state,
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
        dodges: state.dodges + 1,
        successfulDefenses: state.successfulDefenses + 1,
        patternIndex: nextPattern,
      },
      now,
      attack.openingMs + (cycleRestart ? 180 : 0),
      attack.openingHits,
      cycleRestart ? "Larry whiffs and restarts his pattern. Big opening." : "Nice dodge. Larry is open."
    );
  }

  if (blocked) {
    const nextPlayerHealth = Math.max(0, state.playerHealth - attack.blockedDamage);
    if (nextPlayerHealth <= 0) {
      return finishFight(
        {
          ...state,
          playerHealth: nextPlayerHealth,
          enemyAttacksSeen: state.enemyAttacksSeen + 1,
          blocks: state.blocks + 1,
          successfulDefenses: state.successfulDefenses + 1,
        },
        "lost",
        now,
        "Larry broke through your guard."
      );
    }

    return openCounterWindow(
      {
        ...state,
        playerHealth: nextPlayerHealth,
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
        blocks: state.blocks + 1,
        successfulDefenses: state.successfulDefenses + 1,
        patternIndex: nextPattern,
      },
      now,
      attack.openingMs,
      Math.max(1, attack.openingHits - 1),
      "Solid block. Larry is open for a counter."
    );
  }

  const nextPlayerHealth = Math.max(0, state.playerHealth - attack.damage);
  if (nextPlayerHealth <= 0) {
    return finishFight(
      {
        ...state,
        playerHealth: nextPlayerHealth,
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
      },
      "lost",
      now,
      "Larry lands the finishing shot."
    );
  }

  if (attack.guaranteedOpening) {
    return openCounterWindow(
      {
        ...state,
        playerHealth: nextPlayerHealth,
        enemyAttacksSeen: state.enemyAttacksSeen + 1,
        patternIndex: nextPattern,
      },
      now,
      700,
      1,
      "Larry clipped you, but overextended. Quick counter chance."
    );
  }

  return advanceAfterCurrentAttack(
    {
      ...state,
      playerHealth: nextPlayerHealth,
      enemyAttacksSeen: state.enemyAttacksSeen + 1,
      patternIndex: state.patternIndex,
    },
    now,
    "Larry lands a shot. Reset and read the next tell."
  );
}

export function initialShowdownState(now = Date.now()) {
  return {
    opponentSlug: LINEAR_LARRY.slug,
    opponentName: LINEAR_LARRY.name,
    opponentTitle: LINEAR_LARRY.title,
    round: 1,
    playerHealth: PLAYER_MAX_HEALTH,
    opponentHealth: OPPONENT_MAX_HEALTH,
    playerPose: "guard",
    recoverUntil: 0,
    actionExpiresAt: 0,
    enemyPhase: "telegraph",
    patternIndex: 0,
    telegraphText: LINEAR_LARRY.pattern[0].telegraph,
    enemyActionLabel: LINEAR_LARRY.pattern[0].label,
    phaseEndsAt: now + LINEAR_LARRY.pattern[0].telegraphMs,
    openingHitsRemaining: 0,
    result: "active",
    statusText: "Watch Larry's tell, defend cleanly, then jab the opening.",
    attempts: 0,
    punchesLanded: 0,
    punchesMissed: 0,
    successfulDefenses: 0,
    dodges: 0,
    blocks: 0,
    enemyAttacksSeen: 0,
    startTime: now,
    finishTime: null,
  };
}

export function performPlayerAction(state, action, now = Date.now()) {
  if (!state || state.result !== "active") {
    return state;
  }

  const nextState = normalizePlayerPose(state, now);

  if (action === "dodge_left" || action === "dodge_right" || action === "block") {
    return {
      ...nextState,
      attempts: nextState.attempts + 1,
      playerPose: action,
      actionExpiresAt: now + DEFENSE_DURATION_MS,
      statusText:
        action === "block"
          ? "Guard up. Hold steady."
          : action === "dodge_left"
            ? "Slip left and watch Larry's glove."
            : "Slip right and wait for the punch.",
    };
  }

  if (action !== "jab") {
    return nextState;
  }

  if (nextState.enemyPhase === "opening") {
    const damage = nextState.openingHitsRemaining >= 2 ? 16 : 12;
    const opponentHealth = Math.max(0, nextState.opponentHealth - damage);
    const afterPunch = {
      ...nextState,
      attempts: nextState.attempts + 1,
      punchesLanded: nextState.punchesLanded + 1,
      opponentHealth,
      playerPose: "jab",
      actionExpiresAt: now + PUNCH_DURATION_MS,
      recoverUntil: now + 180,
      openingHitsRemaining: Math.max(0, nextState.openingHitsRemaining - 1),
      statusText: opponentHealth <= 0 ? "Linear Larry is out." : "Clean counter. Stay ready.",
    };

    if (opponentHealth <= 0) {
      return finishFight(afterPunch, "won", now, "You put Linear Larry away.");
    }

    if (afterPunch.openingHitsRemaining === 0) {
      return {
        ...afterPunch,
        enemyPhase: "reset",
        phaseEndsAt: now + RESET_DURATION_MS,
        telegraphText: "Larry backs off and tries to regroup.",
        enemyActionLabel: "Reset",
      };
    }

    return {
      ...afterPunch,
      phaseEndsAt: Math.max(afterPunch.phaseEndsAt, now + 360),
      telegraphText: "Larry is still open. One more jab will fit.",
    };
  }

  return {
    ...nextState,
    attempts: nextState.attempts + 1,
    punchesMissed: nextState.punchesMissed + 1,
    playerPose: "jab",
    actionExpiresAt: now + PUNCH_DURATION_MS,
    recoverUntil: now + WHIFF_RECOVERY_MS,
    statusText:
      nextState.enemyPhase === "telegraph"
        ? "Too early. Wait for the opening after Larry commits."
        : "No free shot there. Reset and defend first.",
  };
}

export function stepShowdownFight(state, now = Date.now()) {
  if (!state || state.result !== "active") {
    return state;
  }

  const nextState = normalizePlayerPose(state, now);
  if (now < nextState.phaseEndsAt) {
    return nextState;
  }

  if (nextState.enemyPhase === "telegraph") {
    return resolveEnemyAttack(nextState, now);
  }

  if (nextState.enemyPhase === "opening") {
    return startTelegraph(
      {
        ...nextState,
        openingHitsRemaining: 0,
      },
      now,
      nextState.patternIndex === 0
        ? "Larry restarts his pattern. Read the first tell again."
        : "Larry closes up. Read the next tell."
    );
  }

  if (nextState.enemyPhase === "reset") {
    return startTelegraph(nextState, now, nextState.statusText);
  }

  return nextState;
}

export function showdownScore(state) {
  if (!state) return 0;

  const elapsedMs = Math.max(1, (state.finishTime || Date.now()) - (state.startTime || Date.now()));
  const speedBonus = Math.max(0, 90 - Math.floor(elapsedMs / 1000));

  return Math.round(
    (state.result === "won" ? 220 : 40) +
      state.playerHealth * 1.5 +
      state.punchesLanded * 18 +
      state.successfulDefenses * 12 +
      speedBonus -
      state.punchesMissed * 6
  );
}
