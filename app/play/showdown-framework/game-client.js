"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyShowdownAnswer,
  buildShowdownPrompt,
  initialShowdownState,
  listShowdownStyles,
  showdownScore,
} from "@/lib/question-engine/showdown-framework";

const STYLES = listShowdownStyles();

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function ShowdownFrameworkClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [style, setStyle] = useState(STYLES[0]?.slug || "counter_cadet");
  const [status, setStatus] = useState("Answer cleanly to land punches and protect your stamina.");
  const [battleState, setBattleState] = useState(() => initialShowdownState(STYLES[0]?.slug || "counter_cadet"));
  const [prompt, setPrompt] = useState(() => buildShowdownPrompt(1));
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    ...initialShowdownState(STYLES[0]?.slug || "counter_cadet"),
    courseId: initialCourseId || "",
    result: "active",
  });

  const styleSummary = STYLES.find((item) => item.slug === style) || STYLES[0];
  const liveScore = useMemo(() => showdownScore(battleState), [battleState]);
  const battleOver = battleState.result === "won" || battleState.result === "lost";
  const pressureLabel =
    battleState.combo >= 3 ? "Hot streak" : battleState.playerHp <= 30 ? "Danger" : "Steady";

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
      setStatus(error.message || "Could not load class leaderboard.");
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
            style: snapshot.style,
            round: snapshot.round,
            playerHp: snapshot.playerHp,
            rivalHp: snapshot.rivalHp,
            combo: snapshot.combo,
            correctAnswers: snapshot.correctAnswers,
            attempts: snapshot.attempts,
            knockdowns: snapshot.knockdowns,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        savedRunRef.current = false;
        throw new Error(payload.error || "Could not save score.");
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

  function resetBattle(nextStyle = style, nextCourseId = courseId) {
    savedRunRef.current = false;
    const initialState = {
      ...initialShowdownState(nextStyle),
      courseId: nextCourseId,
      result: "active",
    };
    setStyle(nextStyle);
    setBattleState(initialState);
    setPrompt(buildShowdownPrompt(1));
    setStatus("Answer cleanly to land punches and protect your stamina.");
    sessionRef.current = initialState;
  }

  async function startFreshBattle(resultToSave = "reset", nextStyle = style, nextCourseId = courseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setStatus(error.message || "Could not save that showdown.");
        return;
      }
    }

    resetBattle(nextStyle, nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startFreshBattle("switched_class", style, nextCourseId);
  }

  async function answerPrompt(choice) {
    const correct = prompt.checkAnswer(choice);
    const nextState = {
      ...applyShowdownAnswer(battleState, correct),
      style,
      courseId,
    };

    setBattleState(nextState);
    setStatus(
      correct
        ? nextState.knockdowns > battleState.knockdowns
          ? "Knockdown! The next round starts now."
          : "Direct hit. Keep the pressure on."
        : prompt.explanation
    );
    sessionRef.current = nextState;

    if (nextState.result === "won" || nextState.result === "lost") {
      try {
        await saveSession(nextState);
      } catch (error) {
        setStatus(error.message || "Could not save that showdown.");
      }
      return;
    }

    setPrompt(buildShowdownPrompt(nextState.round + nextState.combo));
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Framework Controls</h2>
              <p>
                {styleSummary?.label || "Counter Cadet"} · {courses.find((course) => course.id === courseId)?.title || "No class selected"}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <label>
              Rival style
              <select
                className="input"
                value={style}
                onChange={(event) => startFreshBattle("switched_style", event.target.value, courseId)}
              >
                {STYLES.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
              <strong>{styleSummary?.label || "Counter Cadet"}</strong>
              <p style={{ marginTop: "0.35rem" }}>{styleSummary?.intro || ""}</p>
            </div>
            <div className="ctaRow">
              <button className="btn" type="button" onClick={() => startFreshBattle("manual_reset", style, courseId)}>
                Restart Framework Run
              </button>
            </div>
          </div>
        </details>

        <div className="showdownArena">
          <div className="showdownFighterCard">
            <strong>You</strong>
            <div className="showdownHpBar">
              <div className="showdownHpFill playerHp" style={{ width: `${battleState.playerHp}%` }} />
            </div>
            <p>{battleState.playerHp} stamina</p>
          </div>
          <div className="showdownRoundBadge">
            <strong>Round {battleState.round}</strong>
            <p>{pressureLabel}</p>
          </div>
          <div className="showdownFighterCard">
            <strong>{styleSummary?.label || "Rival"}</strong>
            <div className="showdownHpBar">
              <div className="showdownHpFill rivalHp" style={{ width: `${battleState.rivalHp}%` }} />
            </div>
            <p>{battleState.rivalHp} stamina</p>
          </div>
        </div>

        <div className="pillRow" style={{ marginTop: "1rem" }}>
          <span className="pill">Combo: {battleState.combo}</span>
          <span className="pill">Correct: {battleState.correctAnswers}</span>
          <span className="pill">Attempts: {battleState.attempts}</span>
          <span className="pill">Knockdowns: {battleState.knockdowns}</span>
          <span className="pill">Live Score: {liveScore}</span>
        </div>

        <div className="card showdownPromptCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <span className="skillBuilderPromptLabel">Attack Window</span>
          <h3 style={{ marginTop: "0.6rem" }}>{prompt.prompt}</h3>
          {prompt.leftLabel && prompt.rightLabel ? (
            <div className="spiralReviewCompareRow">
              <div className="spiralReviewValueCard">{prompt.leftLabel}</div>
              <div className="spiralReviewVs">vs</div>
              <div className="spiralReviewValueCard">{prompt.rightLabel}</div>
            </div>
          ) : null}
        </div>

        <div className="skillBuilderChoices">
          {prompt.choices.map((choice) => (
            <button
              key={String(choice)}
              type="button"
              className="btn"
              onClick={() => answerPrompt(choice)}
              disabled={battleOver}
            >
              {prompt.formatChoice ? prompt.formatChoice(choice) : String(choice)}
            </button>
          ))}
        </div>

        <p style={{ marginTop: "1rem", minHeight: "1.5rem" }}>{status}</p>

        {battleOver ? (
          <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
            <h3>{battleState.result === "won" ? "Framework Victory" : "Framework Defeat"}</h3>
            <p>
              This run ended with {battleState.knockdowns} knockdowns, {battleState.correctAnswers} correct answers,
              and a score of {liveScore}.
            </p>
            <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
              <button className="btn primary" type="button" onClick={() => startFreshBattle("restart_after_finish", style, courseId)}>
                Run It Again
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Framework Stats</h2>
        <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
          <div>
            <span>Runs Played</span>
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

        <h2 style={{ marginTop: "1.25rem" }}>Class Leaderboard</h2>
        {courseId && leaderboardLoading ? <p style={{ marginTop: "0.75rem" }}>Loading class leaderboard...</p> : null}
        {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
          <p style={{ marginTop: "0.75rem" }}>No class scores yet. Finish a framework run to start the board.</p>
        ) : null}
        {!courseId ? <p style={{ marginTop: "0.75rem" }}>Choose a class to load the leaderboard.</p> : null}
        {leaderboardRows.map((row, index) => (
          <div key={`${row.player_id || row.display_name}-${index}`} className="card" style={{ background: "#f9fbfc", marginTop: "0.75rem" }}>
            <strong>#{index + 1} {row.display_name || "Student"}</strong>
            <p style={{ marginTop: "0.35rem" }}>
              Score {formatScore(row.score)} · {row.sessions_played || 0} runs
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
