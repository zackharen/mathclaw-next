"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAdaptiveSnapshot, nextAdaptiveLevel } from "@/lib/question-engine/adaptive";
import {
  buildSkillBuilderQuestion,
  listSkillBuilderTargets,
} from "@/lib/question-engine/skill-builder";

const TOTAL_ROUNDS = 12;
const TARGETS = listSkillBuilderTargets();

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function SkillBuilderClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [target, setTarget] = useState("integers");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(1);
  const [feedback, setFeedback] = useState("Choose the strongest answer and keep building your mastery meter.");
  const [question, setQuestion] = useState(() => buildSkillBuilderQuestion("integers", 1));
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    target: "integers",
    attempts: 0,
    correctAnswers: 0,
    streak: 0,
    level: 1,
    accuracy: 0,
    result: "active",
  });

  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const targetSummary = TARGETS.find((item) => item.slug === target) || TARGETS[0];
  const masterySnapshot = useMemo(
    () =>
      buildAdaptiveSnapshot({
        level,
        streak,
        correctAnswers: score,
        attempts: sessionRef.current.attempts,
      }),
    [level, score, streak]
  );

  const masteryPercent = Math.max(
    8,
    Math.min(
      100,
      Math.round(
        masterySnapshot.level * 8 +
          masterySnapshot.accuracy * 45 +
          Math.min(masterySnapshot.streak, 5) * 4
      )
    )
  );

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=skill_builder&courseId=${encodeURIComponent(nextCourseId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load class leaderboard.");
      }
      setLeaderboardRows(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch (error) {
      setFeedback(error.message || "Could not load class leaderboard.");
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
          gameSlug: "skill_builder",
          score: snapshot.correctAnswers,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            target: snapshot.target,
            attempts: snapshot.attempts,
            correctAnswers: snapshot.correctAnswers,
            streak: snapshot.streak,
            skillRating: snapshot.level,
            accuracy: snapshot.accuracy,
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

  function resetRun(nextTarget = target, nextCourseId = courseId) {
    savedRunRef.current = false;
    setTarget(nextTarget);
    setRoundIndex(1);
    setScore(0);
    setStreak(0);
    setLevel(1);
    setFeedback("Choose the strongest answer and keep building your mastery meter.");
    setQuestion(buildSkillBuilderQuestion(nextTarget, 1));
    sessionRef.current = {
      courseId: nextCourseId,
      target: nextTarget,
      attempts: 0,
      correctAnswers: 0,
      streak: 0,
      level: 1,
      accuracy: 0,
      result: "active",
    };
  }

  async function startNewRun(resultToSave = "reset", nextTarget = target, nextCourseId = courseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        return;
      }
    }

    resetRun(nextTarget, nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startNewRun("switched_class", target, nextCourseId);
  }

  async function answerQuestion(choice) {
    const correct = question.checkAnswer(choice);
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = score + (correct ? 1 : 0);
    const nextStreak = correct ? streak + 1 : 0;
    const nextLevel = nextAdaptiveLevel({
      currentLevel: level,
      correct,
      streak: nextStreak,
      riseAfterStreak: 2,
      fallBy: 1,
      minLevel: 1,
      maxLevel: 10,
    });
    const finished = nextAttempts >= TOTAL_ROUNDS;

    setScore(nextScore);
    setStreak(nextStreak);
    setLevel(nextLevel);
    setFeedback(correct ? "Strong work. Your mastery meter moved up." : question.explanation);

    sessionRef.current = {
      ...buildAdaptiveSnapshot({
        level: nextLevel,
        streak: nextStreak,
        correctAnswers: nextScore,
        attempts: nextAttempts,
      }),
      courseId,
      target,
      attempts: nextAttempts,
      correctAnswers: nextScore,
      streak: nextStreak,
      level: nextLevel,
      result: finished ? "finished" : "active",
    };

    if (finished) {
      try {
        await saveSession({
          ...sessionRef.current,
          result: "finished",
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
      }
      return;
    }

    setRoundIndex(nextAttempts + 1);
    setQuestion(buildSkillBuilderQuestion(target, nextLevel));
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Builder Controls</h2>
              <p>
                {targetSummary.label} · {courseSummary}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <label>
              Target skill
              <select
                className="input"
                value={target}
                onChange={(event) => startNewRun("switched_target", event.target.value, courseId)}
              >
                {TARGETS.map((option) => (
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
              <strong>{targetSummary.label}</strong>
              <p style={{ marginTop: "0.35rem" }}>{targetSummary.description}</p>
            </div>
            <div className="ctaRow">
              <button className="btn" type="button" onClick={() => startNewRun("manual_reset", target, courseId)}>
                Start Fresh Run
              </button>
            </div>
          </div>
        </details>

        <div className="pillRow" style={{ marginTop: "1rem" }}>
          <span className="pill">Round {Math.min(roundIndex, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}</span>
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Skill Level: {level}</span>
        </div>

        <div className="skillBuilderMeter">
          <div className="skillBuilderMeterFill" style={{ width: `${masteryPercent}%` }} />
        </div>
        <p className="skillBuilderMeterLabel">
          Mastery Meter: {masteryPercent}% · Accuracy {Math.round(masterySnapshot.accuracy * 100)}%
        </p>

        <div className="card skillBuilderPromptCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <span className="skillBuilderPromptLabel">{targetSummary.label}</span>
          <h3 style={{ marginTop: "0.6rem" }}>{question.prompt}</h3>
          {question.leftLabel && question.rightLabel ? (
            <div className="spiralReviewCompareRow">
              <div className="spiralReviewValueCard">{question.leftLabel}</div>
              <div className="spiralReviewVs">vs</div>
              <div className="spiralReviewValueCard">{question.rightLabel}</div>
            </div>
          ) : null}
        </div>

        <div className="skillBuilderChoices">
          {question.choices.map((choice) => (
            <button
              key={String(choice)}
              type="button"
              className="btn"
              onClick={() => answerQuestion(choice)}
              disabled={runComplete}
            >
              {question.formatChoice ? question.formatChoice(choice) : String(choice)}
            </button>
          ))}
        </div>

        <p style={{ marginTop: "1rem", minHeight: "1.5rem" }}>{feedback}</p>

        {runComplete ? (
          <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
            <h3>Run Complete</h3>
            <p>
              You finished {targetSummary.label} with {score} correct answers and reached skill level {level}.
            </p>
            <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
              <button className="btn primary" type="button" onClick={() => startNewRun("restart_after_finish", target, courseId)}>
                Build Again
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Skill Builder Stats</h2>
        <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
          <div>
            <span>Games Played</span>
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
          <p style={{ marginTop: "0.75rem" }}>No class scores yet. Finish a run to start the leaderboard.</p>
        ) : null}
        {!courseId ? <p style={{ marginTop: "0.75rem" }}>Choose a class to load the leaderboard.</p> : null}
        {leaderboardRows.map((row, index) => (
          <div key={`${row.player_id || row.display_name}-${index}`} className="card" style={{ background: "#f9fbfc", marginTop: "0.75rem" }}>
            <strong>
              #{index + 1} {row.display_name || "Student"}
            </strong>
            <p style={{ marginTop: "0.35rem" }}>
              Score {formatScore(row.score)} · {row.sessions_played || 0} sessions
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
