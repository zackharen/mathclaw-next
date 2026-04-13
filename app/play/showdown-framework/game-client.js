"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildShowdownTutorialScenario,
  initialShowdownState,
  LINEAR_LARRY,
  performPlayerAction,
  SHOWDOWN_DIFFICULTIES,
  showdownScore,
  stepShowdownFight,
} from "@/lib/question-engine/showdown-framework";

const SPRITE_SHEET = "/showdown/linear-larry-sprites.png";

const ENEMY_ANIMATIONS = {
  idle: [
    { row: 0, col: 0, duration: 180 },
    { row: 0, col: 1, duration: 180 },
  ],
  windup_left: [
    { row: 0, col: 2, duration: 220 },
    { row: 0, col: 3, duration: 220 },
  ],
  windup_right: [
    { row: 0, col: 3, duration: 220 },
    { row: 0, col: 2, duration: 220 },
  ],
  windup_block: [
    { row: 2, col: 0, duration: 220 },
    { row: 2, col: 1, duration: 220 },
  ],
  punch_left: [
    { row: 1, col: 0, duration: 120 },
    { row: 1, col: 1, duration: 120 },
  ],
  punch_right: [
    { row: 1, col: 2, duration: 120 },
    { row: 1, col: 3, duration: 120 },
  ],
  punch_block: [
    { row: 1, col: 1, duration: 110 },
    { row: 1, col: 2, duration: 130 },
  ],
  recovery: [
    { row: 2, col: 0, duration: 160 },
    { row: 2, col: 1, duration: 160 },
  ],
  hit_reaction: [
    { row: 2, col: 1, duration: 120 },
    { row: 2, col: 0, duration: 120 },
  ],
  stunned: [
    { row: 2, col: 0, duration: 140 },
    { row: 2, col: 1, duration: 140 },
  ],
  knocked_down: [{ row: 2, col: 2, duration: 9999 }],
};

const PLAYER_ANIMATIONS = {
  idle: [
    { row: 0, col: 1, duration: 180 },
    { row: 0, col: 0, duration: 180 },
  ],
  dodge_left: [{ row: 0, col: 2, duration: 220 }],
  dodge_right: [{ row: 0, col: 3, duration: 220 }],
  block: [
    { row: 2, col: 0, duration: 170 },
    { row: 2, col: 1, duration: 170 },
  ],
  punch: [
    { row: 1, col: 3, duration: 110 },
    { row: 1, col: 2, duration: 110 },
  ],
  hurt: [
    { row: 2, col: 1, duration: 150 },
    { row: 2, col: 0, duration: 150 },
  ],
  knocked_down: [{ row: 2, col: 2, duration: 9999 }],
};

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function spriteFrameStyle(frame) {
  const x = frame.col * (100 / 3);
  const y = frame.row * (100 / 2);

  return {
    backgroundImage: `url(${SPRITE_SHEET})`,
    backgroundSize: "400% 300%",
    backgroundPosition: `${x}% ${y}%`,
  };
}

function frameForAnimation(frames, elapsedMs) {
  const safeFrames = Array.isArray(frames) && frames.length > 0 ? frames : ENEMY_ANIMATIONS.idle;
  const totalDuration = safeFrames.reduce((sum, frame) => sum + frame.duration, 0);

  if (!totalDuration) {
    return safeFrames[0];
  }

  const playbackMs = safeFrames.length === 1 ? 0 : elapsedMs % totalDuration;
  let cursor = 0;

  for (const frame of safeFrames) {
    cursor += frame.duration;
    if (playbackMs < cursor) {
      return frame;
    }
  }

  return safeFrames[safeFrames.length - 1];
}

function FighterSprite({ role, stateName, startedAt, clock }) {
  const frames = role === "enemy" ? ENEMY_ANIMATIONS[stateName] : PLAYER_ANIMATIONS[stateName];
  const elapsedMs = Math.max(0, Number(clock || 0) - Number(startedAt || 0));
  const frame = frameForAnimation(frames, elapsedMs);

  return (
    <div className={`showdownSpriteSheet ${role}`} style={spriteFrameStyle(frame)} aria-hidden="true" />
  );
}

export default function ShowdownFrameworkClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [difficulty, setDifficulty] = useState("easy");
  const [battleState, setBattleState] = useState(() => initialShowdownState(Date.now(), "easy"));
  const [fightStarted, setFightStarted] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(false);
  const [tutorialStep, setTutorialStep] = useState("intro");
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [showTutorialOverlay, setShowTutorialOverlay] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    ...initialShowdownState(Date.now(), "easy"),
    courseId: initialCourseId || "",
  });
  const rafRef = useRef(0);

  const liveScore = useMemo(() => showdownScore(battleState), [battleState]);
  const battleOver = battleState.result === "won" || battleState.result === "lost";
  const courseSummary =
    courses.find((course) => course.id === courseId)?.title || "No class selected";
  const interactionLocked = !fightStarted || showTutorialPrompt || showTutorialOverlay;
  const difficultySummary =
    SHOWDOWN_DIFFICULTIES.find((option) => option.slug === difficulty) || SHOWDOWN_DIFFICULTIES[0];
  const sceneClock = battleState.clock || Date.now();

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=showdown_framework&courseId=${encodeURIComponent(nextCourseId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load class leaderboard.");
      }
      setLeaderboardRows(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch (error) {
      setBattleState((current) => ({
        ...current,
        effectText: error.message || "Could not load class leaderboard.",
      }));
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const saveSession = useCallback(
    async (snapshot, options = {}) => {
      if (!snapshot || snapshot.attempts <= 0 || savedRunRef.current || snapshot.isTutorial) {
        return null;
      }

      savedRunRef.current = true;
      const response = await fetch("/api/play/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: options.keepalive === true,
        body: JSON.stringify({
          gameSlug: "showdown_framework",
          score: showdownScore(snapshot),
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            opponent: snapshot.opponentName,
            difficulty: snapshot.difficulty,
            playerHealth: snapshot.playerHealth,
            opponentHealth: snapshot.opponentHealth,
            attempts: snapshot.attempts,
            punchesLanded: snapshot.punchesLanded,
            punchesMissed: snapshot.punchesMissed,
            dodges: snapshot.dodges,
            blocks: snapshot.blocks,
            successfulDefenses: snapshot.successfulDefenses,
            enemyAttacksSeen: snapshot.enemyAttacksSeen,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        savedRunRef.current = false;
        throw new Error(payload.error || "Could not save that fight.");
      }

      if (payload.stats) {
        setSavedStats((current) => ({
          ...current,
          ...payload.stats,
        }));
      }

      if (!options.keepalive) {
        await loadLeaderboard(snapshot.courseId || "");
      }

      return payload.stats || null;
    },
    [loadLeaderboard]
  );

  useEffect(() => {
    if (!courseId) {
      setLeaderboardRows([]);
      return;
    }

    if (courseId === initialCourseId && (initialLeaderboard || []).length > 0) {
      return;
    }

    loadLeaderboard(courseId);
  }, [courseId, initialCourseId, initialLeaderboard, loadLeaderboard]);

  useEffect(() => {
    sessionRef.current = {
      ...battleState,
      courseId,
      isTutorial: tutorialMode,
    };
  }, [battleState, courseId, tutorialMode]);

  useEffect(() => {
    if (battleOver || !fightStarted || showTutorialPrompt || showTutorialOverlay) return undefined;

    function loop() {
      setBattleState((current) => stepShowdownFight(current, Date.now()));
      rafRef.current = window.requestAnimationFrame(loop);
    }

    rafRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [battleOver, fightStarted, showTutorialOverlay, showTutorialPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSeenTutorialPrompt = window.localStorage.getItem("showdown_tutorial_prompt_seen");
    if (!hasSeenTutorialPrompt) {
      setShowTutorialPrompt(true);
    }
  }, []);

  useEffect(() => {
    if (battleState.result !== "active") {
      const snapshot = { ...sessionRef.current, courseId };
      saveSession(snapshot).catch((error) => {
        setBattleState((current) => ({
          ...current,
          effectText: error.message || "Could not save that fight.",
        }));
      });
    }
  }, [battleState.result, courseId, saveSession]);

  useEffect(() => {
    if (!tutorialMode) return;

    if (tutorialStep === "dodge") {
      if (battleState.successfulDefenses >= 1) {
        setFightStarted(false);
        setShowTutorialOverlay(true);
        setTutorialStep("jab_intro");
        setBattleState(buildShowdownTutorialScenario("jab", difficulty, Date.now()));
        return;
      }

      if (battleState.playerHealth < 100) {
        setBattleState(buildShowdownTutorialScenario("dodge", difficulty, Date.now()));
      }
    }

    if (tutorialStep === "jab") {
      if (battleState.punchesLanded >= 1) {
        setTutorialMode(false);
        setTutorialStep("complete");
        setShowTutorialOverlay(true);
        setFightStarted(false);
        setBattleState(initialShowdownState(Date.now(), difficulty));
        return;
      }

      if (battleState.punchesMissed > 0 || battleState.playerHealth < 100) {
        setBattleState(buildShowdownTutorialScenario("jab", difficulty, Date.now()));
      }
    }
  }, [battleState, difficulty, tutorialMode, tutorialStep]);

  useEffect(() => {
    function handlePageHide() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.attempts <= 0) return;
      saveSession(
        { ...snapshot, result: snapshot.result === "active" ? "left_page" : snapshot.result },
        { keepalive: true }
      ).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  const triggerAction = useCallback((action) => {
    setBattleState((current) => performPlayerAction(current, action, Date.now()));
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.repeat || battleOver || interactionLocked) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        triggerAction("dodge_left");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        triggerAction("dodge_right");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        triggerAction("block");
      } else if (event.key === " " || event.key.toLowerCase() === "z") {
        event.preventDefault();
        triggerAction("jab");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [battleOver, interactionLocked, triggerAction]);

  function resetBattle(nextCourseId = courseId, nextDifficulty = difficulty) {
    savedRunRef.current = false;
    setBattleState(initialShowdownState(Date.now(), nextDifficulty));
    setCourseId(nextCourseId);
    setFightStarted(false);
    setTutorialMode(false);
    setTutorialStep("intro");
  }

  async function startFreshBattle(resultToSave = "reset", nextCourseId = courseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result:
            previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setBattleState((current) => ({
          ...current,
          effectText: error.message || "Could not save that fight.",
        }));
        return;
      }
    }

    resetBattle(nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startFreshBattle("switched_class", nextCourseId);
  }

  function startFightNow() {
    setBattleState(initialShowdownState(Date.now(), difficulty));
    setFightStarted(true);
    setShowTutorialOverlay(false);
    setTutorialMode(false);
    setTutorialStep("intro");
  }

  function handleDifficultyChange(nextDifficulty) {
    setDifficulty(nextDifficulty);
    savedRunRef.current = false;
    setBattleState(initialShowdownState(Date.now(), nextDifficulty));
    setFightStarted(false);
    setTutorialMode(false);
    setTutorialStep("intro");
  }

  function rememberTutorialPrompt() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("showdown_tutorial_prompt_seen", "yes");
    }
    setShowTutorialPrompt(false);
  }

  function openTutorial() {
    setTutorialStep("intro");
    setShowTutorialOverlay(true);
    setFightStarted(false);
  }

  function chooseTutorial() {
    rememberTutorialPrompt();
    openTutorial();
  }

  function skipTutorial() {
    rememberTutorialPrompt();
    setShowTutorialOverlay(false);
  }

  function beginTutorialDodge() {
    setTutorialMode(true);
    setTutorialStep("dodge");
    setShowTutorialOverlay(false);
    setFightStarted(true);
    setBattleState(buildShowdownTutorialScenario("dodge", difficulty, Date.now()));
  }

  function beginTutorialJab() {
    setTutorialStep("jab");
    setShowTutorialOverlay(false);
    setFightStarted(true);
    setBattleState(buildShowdownTutorialScenario("jab", difficulty, Date.now()));
  }

  const sceneClasses = [
    "showdownViewport",
    `enemy-${battleState.enemyState}`,
    `player-${battleState.playerState}`,
    battleState.result === "won" ? "result-won" : "",
    battleState.result === "lost" ? "result-lost" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Fight Setup</h2>
              <p>{LINEAR_LARRY.name} · {courseSummary}</p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <label>
              Class context
              <select
                className="input"
                value={courseId}
                onChange={(event) => handleCourseChange(event.target.value)}
              >
                <option value="">No class selected</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="card" style={{ background: "#f9fbfc" }}>
              <strong>{LINEAR_LARRY.name}</strong>
              <p style={{ marginTop: "0.35rem" }}>{LINEAR_LARRY.intro}</p>
            </div>
            <label>
              Difficulty
              <select
                className="input"
                value={difficulty}
                onChange={(event) => handleDifficultyChange(event.target.value)}
              >
                {SHOWDOWN_DIFFICULTIES.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="card" style={{ background: "#f9fbfc" }}>
              <strong>{difficultySummary.label}</strong>
              <p style={{ marginTop: "0.35rem" }}>{difficultySummary.intro}</p>
            </div>
            <div className="ctaRow">
              <button className="btn" type="button" onClick={openTutorial}>
                Tutorial
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => startFreshBattle("manual_reset", courseId)}
              >
                Restart Fight
              </button>
            </div>
          </div>
        </details>

        <div className="showdownHud">
          <div className="showdownHudBar">
            <span>You</span>
            <div className="showdownMeter">
              <div
                className="showdownMeterFill playerHp"
                style={{ width: `${battleState.playerHealth}%` }}
              />
            </div>
          </div>
          <div className="showdownHudCenter">
            <span className="showdownRetroTag">{difficultySummary.label}</span>
            <strong>{fightStarted ? "Read The Ring" : "Awaiting Bell"}</strong>
          </div>
          <div className="showdownHudBar">
            <span>{LINEAR_LARRY.name}</span>
            <div className="showdownMeter">
              <div
                className="showdownMeterFill rivalHp"
                style={{ width: `${battleState.opponentHealth}%` }}
              />
            </div>
          </div>
        </div>

        <div className={sceneClasses}>
          <div className="showdownBackdrop">
            <div className="showdownCrowd" />
            <div className="showdownRingPost left" />
            <div className="showdownRingPost right" />
            <div className="showdownRopes top" />
            <div className="showdownRopes middle" />
            <div className="showdownRopes bottom" />
            <div className="showdownCanvasOverlay" />
            <div className="showdownRingFloor" />
          </div>

          <div className="showdownFighter enemy">
            <div className="showdownFighterShadow" />
            <FighterSprite
              role="enemy"
              stateName={battleState.enemyState}
              startedAt={battleState.enemyStateStartedAt}
              clock={sceneClock}
            />
            <div className="showdownNamePlate enemy">
              <strong>{LINEAR_LARRY.name}</strong>
            </div>
          </div>

          <div className="showdownFighter player">
            <div className="showdownFighterShadow" />
            <FighterSprite
              role="player"
              stateName={battleState.playerState}
              startedAt={battleState.playerStateStartedAt}
              clock={sceneClock}
            />
            <div className="showdownNamePlate player">
              <strong>You</strong>
            </div>
          </div>

          {!fightStarted && !showTutorialPrompt && !showTutorialOverlay ? (
            <div className="showdownModalBackdrop">
              <div className="showdownModalCard">
                <span className="showdownRetroTag">Ready</span>
                <h3>Step Into The Ring</h3>
                <p>
                  Larry will open with a slow pattern. Watch his body, then react to the motion instead of the UI.
                </p>
                <div className="ctaRow" style={{ justifyContent: "center" }}>
                  <button className="btn" type="button" onClick={openTutorial}>
                    Tutorial
                  </button>
                  <button className="btn primary" type="button" onClick={startFightNow}>
                    Start Fight
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showTutorialPrompt ? (
            <div className="showdownModalBackdrop">
              <div className="showdownModalCard">
                <span className="showdownRetroTag">First Time?</span>
                <h3>Want A Quick Tutorial?</h3>
                <p>
                  It walks you through one dodge and one counter so you can feel the rhythm before the full fight.
                </p>
                <div className="ctaRow" style={{ justifyContent: "center" }}>
                  <button className="btn" type="button" onClick={skipTutorial}>
                    Skip
                  </button>
                  <button className="btn primary" type="button" onClick={chooseTutorial}>
                    Teach Me
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showTutorialOverlay ? (
            <div className="showdownModalBackdrop">
              <div className="showdownModalCard tutorial">
                <span className="showdownRetroTag">Tutorial</span>
                {tutorialStep === "complete" ? (
                  <>
                    <h3>You Felt The Loop</h3>
                    <div className="list" style={{ textAlign: "left" }}>
                      <p><strong>1.</strong> Watch the lean to read which punch is coming.</p>
                      <p><strong>2.</strong> Defend at the last moment, then hit Larry during the freeze after he misses.</p>
                      <p><strong>3.</strong> That same read-defend-counter rhythm carries the whole fight.</p>
                    </div>
                    <div className="ctaRow" style={{ justifyContent: "center" }}>
                      <button className="btn" type="button" onClick={beginTutorialDodge}>
                        Practice Again
                      </button>
                      <button className="btn primary" type="button" onClick={startFightNow}>
                        Start Fight
                      </button>
                    </div>
                  </>
                ) : tutorialStep === "jab_intro" ? (
                  <>
                    <h3>That Freeze Is Your Opening</h3>
                    <p>
                      When Larry hangs in place after a miss, step in and jab before he resets.
                    </p>
                    <div className="ctaRow" style={{ justifyContent: "center" }}>
                      <button className="btn" type="button" onClick={openTutorial}>
                        Back
                      </button>
                      <button className="btn primary" type="button" onClick={beginTutorialJab}>
                        Try The Counter
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>Watch Larry, Not The UI</h3>
                    <div className="list" style={{ textAlign: "left" }}>
                      <p><strong>1.</strong> If he leans left, dodge right.</p>
                      <p><strong>2.</strong> If he leans right, dodge left.</p>
                      <p><strong>3.</strong> If he pulls both gloves back, block the rush.</p>
                    </div>
                    <div className="ctaRow" style={{ justifyContent: "center" }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setShowTutorialOverlay(false);
                          setTutorialMode(false);
                        }}
                      >
                        Close Tutorial
                      </button>
                      <button className="btn primary" type="button" onClick={beginTutorialDodge}>
                        Start Dodge Drill
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="showdownActionGrid">
          <button
            className="btn"
            type="button"
            onClick={() => triggerAction("dodge_left")}
            disabled={battleOver || interactionLocked}
          >
            Dodge Left
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => triggerAction("block")}
            disabled={battleOver || interactionLocked}
          >
            Block
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => triggerAction("dodge_right")}
            disabled={battleOver || interactionLocked}
          >
            Dodge Right
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => triggerAction("jab")}
            disabled={battleOver || interactionLocked}
          >
            Jab
          </button>
        </div>

        {battleOver ? (
          <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
            <h3>{battleState.result === "won" ? "You Beat Linear Larry" : "Linear Larry Got You"}</h3>
            <p>
              Final score {liveScore}. Landed {battleState.punchesLanded} punches, defended{" "}
              {battleState.successfulDefenses} attacks, and watched {battleState.enemyAttacksSeen} Larry swings.
            </p>
            <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
              <button
                className="btn primary"
                type="button"
                onClick={() => startFreshBattle("restart_after_finish", courseId)}
              >
                Fight Again
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Fight Stats</h2>
        <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
          <div>
            <span>Fights Played</span>
            <strong>{savedStats?.sessions_played || 0}</strong>
          </div>
          <div>
            <span>Average</span>
            <strong>{formatScore(savedStats?.average_score)}</strong>
          </div>
          <div>
            <span>Last 10 Avg</span>
            <strong>{formatScore(savedStats?.last_10_average)}</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{formatScore(savedStats?.best_score)}</strong>
          </div>
        </div>

        <div className="pillRow" style={{ marginTop: "1rem" }}>
          <span className="pill">Score: {liveScore}</span>
          <span className="pill">Dodges: {battleState.dodges}</span>
          <span className="pill">Blocks: {battleState.blocks}</span>
          <span className="pill">Hits Landed: {battleState.punchesLanded}</span>
        </div>

        <h2 style={{ marginTop: "1.25rem" }}>Class Leaderboard</h2>
        {courseId && leaderboardLoading ? (
          <p style={{ marginTop: "0.75rem" }}>Loading class leaderboard...</p>
        ) : null}
        {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
          <p style={{ marginTop: "0.75rem" }}>No class scores yet. Finish a fight to start the board.</p>
        ) : null}
        {!courseId ? (
          <p style={{ marginTop: "0.75rem" }}>Choose a class to load the leaderboard.</p>
        ) : null}
        {leaderboardRows.map((row, index) => (
          <div
            key={`${row.player_id || row.display_name}-${index}`}
            className="card"
            style={{ background: "#f9fbfc", marginTop: "0.75rem" }}
          >
            <strong>#{index + 1} {row.display_name || "Student"}</strong>
            <p style={{ marginTop: "0.35rem" }}>
              Score {formatScore(row.score)} · {row.sessions_played || 0} fights
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
