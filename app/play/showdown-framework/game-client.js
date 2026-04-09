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

function phaseLabel(state) {
  if (state.result === "won") return "Victory";
  if (state.result === "lost") return "Knocked Out";
  if (state.enemyPhase === "opening") return "Counter Window";
  if (state.enemyPhase === "telegraph") return "Read The Tell";
  return "Reset";
}

export default function ShowdownFrameworkClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [battleState, setBattleState] = useState(() => initialShowdownState());
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    ...initialShowdownState(),
    courseId: initialCourseId || "",
  });

  const liveScore = useMemo(() => showdownScore(battleState), [battleState]);
  const battleOver = battleState.result === "won" || battleState.result === "lost";
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";

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
        statusText: error.message || "Could not load class leaderboard.",
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
    if (battleOver) return undefined;

    const interval = window.setInterval(() => {
      setBattleState((current) => stepShowdownFight(current, Date.now()));
    }, 100);

    return () => window.clearInterval(interval);
  }, [battleOver]);

  useEffect(() => {
    if (battleState.result !== "active") {
      const snapshot = { ...sessionRef.current, courseId };
      saveSession(snapshot).catch((error) => {
        setBattleState((current) => ({
          ...current,
          statusText: error.message || "Could not save that fight.",
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
      if (event.repeat || battleOver) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        triggerAction("dodge_left");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        triggerAction("dodge_right");
      } else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        event.preventDefault();
        triggerAction("block");
      } else if (event.key === " " || event.key.toLowerCase() === "x" || event.key === "Enter") {
        event.preventDefault();
        triggerAction("jab");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [battleOver, triggerAction]);

  function resetBattle(nextCourseId = courseId) {
    savedRunRef.current = false;
    setBattleState(initialShowdownState());
    setCourseId(nextCourseId);
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
          statusText: error.message || "Could not save that fight.",
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
            <div className="card" style={{ background: "#f9fbfc" }}>
              <strong>How To Win</strong>
              <p style={{ marginTop: "0.35rem" }}>
                Read the tell, dodge or block the punch, then jab during the opening. Larry repeats the same three-step pattern.
              </p>
            </div>
            <div className="ctaRow">
              <button className="btn primary" type="button" onClick={() => startFreshBattle("manual_reset", courseId)}>
                Restart Fight
              </button>
            </div>
          </div>
        </details>

        <div className="showdownScoreboard">
          <div className="showdownFighterCard">
            <strong>You</strong>
            <div className="showdownHpBar">
              <div className="showdownHpFill playerHp" style={{ width: `${battleState.playerHealth}%` }} />
            </div>
            <p>{battleState.playerHealth} health</p>
          </div>
          <div className="showdownRoundBadge">
            <strong>{phaseLabel(battleState)}</strong>
            <p>{battleState.enemyActionLabel}</p>
          </div>
          <div className="showdownFighterCard">
            <strong>{LINEAR_LARRY.name}</strong>
            <div className="showdownHpBar">
              <div className="showdownHpFill rivalHp" style={{ width: `${battleState.opponentHealth}%` }} />
            </div>
            <p>{battleState.opponentHealth} health</p>
          </div>
        </div>

        <div className="showdownRing">
          <div className={`showdownCorner playerCorner pose-${battleState.playerPose}`}>
            <div className="showdownSprite playerSprite">
              <div className="showdownHead" />
              <div className="showdownBody" />
              <div className="showdownGlove left" />
              <div className="showdownGlove right" />
            </div>
            <strong>You</strong>
            <span>{battleState.playerPose.replace("_", " ")}</span>
          </div>

          <div className="showdownCenterPanel">
            <span className={`showdownCallout ${battleState.enemyPhase === "opening" ? "opening" : ""}`}>
              {battleState.enemyPhase === "opening" ? "Opening" : battleState.enemyActionLabel}
            </span>
            <p>{battleState.telegraphText}</p>
            <div className="pillRow" style={{ justifyContent: "center" }}>
              <span className="pill">Score: {liveScore}</span>
              <span className="pill">Defenses: {battleState.successfulDefenses}</span>
              <span className="pill">Landed: {battleState.punchesLanded}</span>
            </div>
          </div>

          <div className={`showdownCorner rivalCorner phase-${battleState.enemyPhase}`}>
            <div className="showdownSprite rivalSprite">
              <div className="showdownHead" />
              <div className="showdownBody" />
              <div className="showdownGlove left" />
              <div className="showdownGlove right" />
            </div>
            <strong>{LINEAR_LARRY.name}</strong>
            <span>{LINEAR_LARRY.title}</span>
          </div>
        </div>

        <div className="showdownActionGrid">
          <button className="btn" type="button" onClick={() => triggerAction("dodge_left")} disabled={battleOver}>
            Dodge Left
          </button>
          <button className="btn" type="button" onClick={() => triggerAction("block")} disabled={battleOver}>
            Block
          </button>
          <button className="btn" type="button" onClick={() => triggerAction("dodge_right")} disabled={battleOver}>
            Dodge Right
          </button>
          <button className="btn primary" type="button" onClick={() => triggerAction("jab")} disabled={battleOver}>
            Jab
          </button>
        </div>

        <p className="showdownStatusText">{battleState.statusText}</p>
        <p className="showdownHintText">
          Keyboard: Left Arrow = dodge left, Right Arrow = dodge right, Down Arrow or S = block, Space/X/Enter = jab.
        </p>

        {battleOver ? (
          <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
            <h3>{battleState.result === "won" ? "You Beat Linear Larry" : "Linear Larry Got You"}</h3>
            <p>
              Final score {liveScore}. You landed {battleState.punchesLanded} jabs, defended {battleState.successfulDefenses} attacks,
              and saw {battleState.enemyAttacksSeen} Larry punches.
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
          <span className="pill">Dodges: {battleState.dodges}</span>
          <span className="pill">Blocks: {battleState.blocks}</span>
          <span className="pill">Misses: {battleState.punchesMissed}</span>
          <span className="pill">Actions: {battleState.attempts}</span>
        </div>

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
