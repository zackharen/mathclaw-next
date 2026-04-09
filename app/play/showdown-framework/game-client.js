"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  initialShowdownState,
  LINEAR_LARRY,
  performPlayerAction,
  showdownScore,
  stepShowdownFight,
} from "@/lib/question-engine/showdown-framework";

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function stateLabel(state) {
  if (state.result === "won") return "You Win";
  if (state.result === "lost") return "You Lose";
  if (state.enemyState === "windup") return "Watch";
  if (state.enemyState === "punch") return "React";
  if (state.enemyState === "recovery") return "Counter";
  if (state.enemyState === "stunned") return "Press";
  return "Fight";
}

function renderTelegraphGlyph(state) {
  if (state.enemyState === "windup" || state.enemyState === "punch") {
    return state.telegraphSide === "left" ? "<<" : ">>";
  }
  if (state.enemyState === "recovery" || state.enemyState === "stunned") {
    return "!!";
  }
  return "--";
}

export default function ShowdownFrameworkClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [battleState, setBattleState] = useState(() => initialShowdownState());
  const [fightStarted, setFightStarted] = useState(false);
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [showTutorialOverlay, setShowTutorialOverlay] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    ...initialShowdownState(),
    courseId: initialCourseId || "",
  });
  const rafRef = useRef(0);

  const liveScore = useMemo(() => showdownScore(battleState), [battleState]);
  const battleOver = battleState.result === "won" || battleState.result === "lost";
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const interactionLocked = !fightStarted || showTutorialPrompt || showTutorialOverlay;

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
      if (!snapshot || snapshot.attempts <= 0 || savedRunRef.current) {
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
    };
  }, [battleState, courseId]);

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

  function resetBattle(nextCourseId = courseId) {
    savedRunRef.current = false;
    setBattleState(initialShowdownState());
    setCourseId(nextCourseId);
    setFightStarted(false);
  }

  async function startFreshBattle(resultToSave = "reset", nextCourseId = courseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
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
    setFightStarted(true);
    setShowTutorialOverlay(false);
  }

  function rememberTutorialPrompt() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("showdown_tutorial_prompt_seen", "yes");
    }
    setShowTutorialPrompt(false);
  }

  function openTutorial() {
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

  const enemyStyle = {
    transform: `translate(${battleState.visuals.enemy.centerX}px, ${battleState.visuals.enemy.centerY}px) scale(${battleState.visuals.enemy.scale}) rotate(${battleState.visuals.enemy.rotation}deg)`,
  };

  const playerStageStyle = {
    transform: `translate(${battleState.visuals.player.offsetX}px, ${battleState.visuals.player.offsetY}px)`,
  };

  const leftGloveStyle = {
    transform: `translate(calc(-50% - ${battleState.visuals.player.gloveSpread}px + ${battleState.visuals.player.leftGlovePunchX}px), ${battleState.visuals.player.gloveY}px)`,
  };

  const rightGloveStyle = {
    transform: `translate(calc(-50% + ${battleState.visuals.player.gloveSpread}px + ${battleState.visuals.player.rightGlovePunchX}px), ${battleState.visuals.player.gloveY}px)`,
  };

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Fight Controls</h2>
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
              <select className="input" value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
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
            <div className="ctaRow">
              <button className="btn" type="button" onClick={openTutorial}>
                How To Play
              </button>
              <button className="btn primary" type="button" onClick={() => startFreshBattle("manual_reset", courseId)}>
                Restart Fight
              </button>
            </div>
          </div>
        </details>

        <div className="showdownHud">
          <div className="showdownHudBar">
            <span>You</span>
            <div className="showdownMeter">
              <div className="showdownMeterFill playerHp" style={{ width: `${battleState.playerHealth}%` }} />
            </div>
          </div>
          <div className="showdownHudCenter">
            <span className="showdownRetroTag">{stateLabel(battleState)}</span>
            <strong>{battleState.attackLabel}</strong>
          </div>
          <div className="showdownHudBar">
            <span>{LINEAR_LARRY.name}</span>
            <div className="showdownMeter">
              <div className="showdownMeterFill rivalHp" style={{ width: `${battleState.opponentHealth}%` }} />
            </div>
          </div>
        </div>

        <div className="showdownViewport">
          <div className="showdownBackdrop">
            <div className="showdownCrowd" />
            <div className="showdownRopes top" />
            <div className="showdownRopes middle" />
            <div className="showdownRopes bottom" />
            <div className="showdownCanvasOverlay" />
          </div>

          <div className={`showdownWarning side-${battleState.telegraphSide} ${battleState.enemyState === "windup" ? "isActive" : ""}`}>
            {renderTelegraphGlyph(battleState)}
          </div>

          <div
            className={`showdownEnemySprite state-${battleState.enemyState} tint-${battleState.visuals.enemy.tint}`}
            style={enemyStyle}
          >
            <div className="showdownEnemyShadow" />
            <div className="showdownEnemyHead" />
            <div className="showdownEnemyHair" />
            <div className="showdownEnemyBody" />
            <div className="showdownEnemyShorts" />
            <div className="showdownEnemyArm left" style={{ transform: `translate(${battleState.visuals.enemy.armLeft.x}px, ${battleState.visuals.enemy.armLeft.y}px) scale(${battleState.visuals.enemy.armLeft.scale})` }} />
            <div className="showdownEnemyArm right" style={{ transform: `translate(${battleState.visuals.enemy.armRight.x}px, ${battleState.visuals.enemy.armRight.y}px) scale(${battleState.visuals.enemy.armRight.scale})` }} />
            <div className="showdownEnemyGlove left" style={{ transform: `translate(${battleState.visuals.enemy.armLeft.x}px, ${battleState.visuals.enemy.armLeft.y}px) scale(${battleState.visuals.enemy.armLeft.scale})` }} />
            <div className="showdownEnemyGlove right" style={{ transform: `translate(${battleState.visuals.enemy.armRight.x}px, ${battleState.visuals.enemy.armRight.y}px) scale(${battleState.visuals.enemy.armRight.scale})` }} />
          </div>

          <div className={`showdownPlayerLayer tint-${battleState.visuals.player.tint}`} style={playerStageStyle}>
            <div className="showdownPlayerGlove left" style={leftGloveStyle} />
            <div className="showdownPlayerGlove right" style={rightGloveStyle} />
          </div>

          <div className="showdownOverlayHud">
            <span className={`showdownOverlayBadge ${battleState.enemyState}`}>{stateLabel(battleState)}</span>
            <p>{battleState.effectText}</p>
          </div>

          {!fightStarted && !showTutorialPrompt && !showTutorialOverlay ? (
            <div className="showdownModalBackdrop">
              <div className="showdownModalCard">
                <span className="showdownRetroTag">Ready</span>
                <h3>Step Into The Ring</h3>
                <p>Start when you are ready. Larry will begin his pattern as soon as the bell rings.</p>
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
                <p>It will show you Larry&apos;s tells, the controls, and when to counter before the real fight starts.</p>
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
                <h3>How To Beat Linear Larry</h3>
                <div className="list" style={{ textAlign: "left" }}>
                  <p><strong>1.</strong> Watch Larry&apos;s shoulders and the side warning arrows.</p>
                  <p><strong>2.</strong> If he leans left, dodge right. If he leans right, dodge left.</p>
                  <p><strong>3.</strong> Down Arrow blocks if you are not sure you can dodge in time.</p>
                  <p><strong>4.</strong> Jab with Space or Z only when Larry is recovering or stunned.</p>
                  <p><strong>5.</strong> If you punch too early, you whiff and give Larry a free shot.</p>
                </div>
                <div className="ctaRow" style={{ justifyContent: "center" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setShowTutorialOverlay(false);
                    }}
                  >
                    Close Tutorial
                  </button>
                  <button className="btn primary" type="button" onClick={startFightNow}>
                    Start Fight
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="showdownActionGrid">
          <button className="btn" type="button" onClick={() => triggerAction("dodge_left")} disabled={battleOver || interactionLocked}>
            Dodge Left
          </button>
          <button className="btn" type="button" onClick={() => triggerAction("block")} disabled={battleOver || interactionLocked}>
            Block
          </button>
          <button className="btn" type="button" onClick={() => triggerAction("dodge_right")} disabled={battleOver || interactionLocked}>
            Dodge Right
          </button>
          <button className="btn primary" type="button" onClick={() => triggerAction("jab")} disabled={battleOver || interactionLocked}>
            Jab
          </button>
        </div>

        {battleOver ? (
          <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
            <h3>{battleState.result === "won" ? "You Beat Linear Larry" : "Linear Larry Got You"}</h3>
            <p>
              Final score {liveScore}. Landed {battleState.punchesLanded} punches, defended {battleState.successfulDefenses} attacks,
              and survived {battleState.enemyAttacksSeen} Larry swings.
            </p>
            <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
              <button className="btn primary" type="button" onClick={() => startFreshBattle("restart_after_finish", courseId)}>
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
          <span className="pill">Misses: {battleState.punchesMissed}</span>
        </div>

        <p className="showdownHintText">
          Keyboard: Left Arrow = dodge left, Right Arrow = dodge right, Down Arrow = block, Space or Z = jab.
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>Class Leaderboard</h2>
        {courseId && leaderboardLoading ? <p style={{ marginTop: "0.75rem" }}>Loading class leaderboard...</p> : null}
        {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
          <p style={{ marginTop: "0.75rem" }}>No class scores yet. Finish a fight to start the board.</p>
        ) : null}
        {!courseId ? <p style={{ marginTop: "0.75rem" }}>Choose a class to load the leaderboard.</p> : null}
        {leaderboardRows.map((row, index) => (
          <div key={`${row.player_id || row.display_name}-${index}`} className="card" style={{ background: "#f9fbfc", marginTop: "0.75rem" }}>
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
