"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import { buildSpiralReviewQuestion, listSpiralReviewSkills } from "@/lib/question-engine/spiral-review";

const TOTAL_ROUNDS = 12;
const SKILL_OPTIONS = [{ slug: "mixed", label: "Mixed Review" }, ...listSpiralReviewSkills()];

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function SpiralReviewClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [focus, setFocus] = useState("mixed");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState("Start the review run and keep your streak alive.");
  const [question, setQuestion] = useState(() => buildSpiralReviewQuestion("mixed"));
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    focus: "mixed",
    attempts: 0,
    correctAnswers: 0,
    streak: 0,
    result: "active",
  });

  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const accuracy = useMemo(() => {
    const attempts = sessionRef.current.attempts || 0;
    if (!attempts) return 0;
    return Math.round((score / attempts) * 100);
  }, [score]);

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=spiral_review&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: "spiral_review",
          score: snapshot.correctAnswers,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            attempts: snapshot.attempts,
            correctAnswers: snapshot.correctAnswers,
            streak: snapshot.streak,
            focus: snapshot.focus,
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

  function resetRun(nextFocus = focus, nextCourseId = courseId) {
    savedRunRef.current = false;
    setFocus(nextFocus);
    setRoundIndex(1);
    setScore(0);
    setStreak(0);
    setFeedback("Start the review run and keep your streak alive.");
    setQuestion(buildSpiralReviewQuestion(nextFocus));
    sessionRef.current = {
      courseId: nextCourseId,
      focus: nextFocus,
      attempts: 0,
      correctAnswers: 0,
      streak: 0,
      result: "active",
    };
  }

  async function startNewRun(resultToSave = "reset", nextFocus = focus, nextCourseId = courseId) {
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

    resetRun(nextFocus, nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startNewRun("switched_class", focus, nextCourseId);
  }

  async function answerQuestion(choice) {
    const correct = question.checkAnswer(choice);
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = score + (correct ? 1 : 0);
    const nextStreak = correct ? streak + 1 : 0;
    const finished = nextAttempts >= TOTAL_ROUNDS;

    setScore(nextScore);
    setStreak(nextStreak);
    setFeedback(correct ? "Nice review hit." : question.explanation);

    sessionRef.current = {
      courseId,
      focus,
      attempts: nextAttempts,
      correctAnswers: nextScore,
      streak: nextStreak,
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
    setQuestion(buildSpiralReviewQuestion(focus));
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Review Controls</h2>
              <p>
                {SKILL_OPTIONS.find((option) => option.slug === focus)?.label || "Mixed Review"} · {courseSummary}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <label>
              Review focus
              <select
                className="input"
                value={focus}
                onChange={(event) => startNewRun("switched_focus", event.target.value, courseId)}
              >
                {SKILL_OPTIONS.map((option) => (
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
            <button className="btn primary" type="button" onClick={() => startNewRun("reset")}>
              Start New Run
            </button>
          </div>
        </details>
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Mixed Review</h2>
        <div className="pillRow">
          <span className="pill">Round: {Math.min(roundIndex, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}</span>
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Accuracy: {accuracy}%</span>
          <span className="pill">Skill: {question.skill === "integers" ? "Integers" : "Compare Numbers"}</span>
        </div>

        <div className="spiralReviewCard">
          <p className="spiralReviewLabel">{question.prompt}</p>
          {question.leftLabel && question.rightLabel ? (
            <div className="spiralReviewCompareRow">
              <div className="spiralReviewValueCard"><MathText node={question.leftNode} /></div>
              <div className="spiralReviewVs">vs</div>
              <div className="spiralReviewValueCard"><MathText node={question.rightNode} /></div>
            </div>
          ) : (
            <div className="spiralReviewEquation"><MathText node={question.promptNode} /></div>
          )}
        </div>

        <div className="choiceGrid" style={{ marginTop: "1rem" }}>
          {question.choices.map((choice) => (
            <button
              key={String(choice)}
              className="btn bigChoice"
              type="button"
              onClick={() => answerQuestion(choice)}
              disabled={runComplete}
            >
              <MathText node={question.formatChoiceNode ? question.formatChoiceNode(choice) : null} className="mathChoiceContent" />
            </button>
          ))}
        </div>

        {feedback ? (
          <div className="minesweeperStatusBanner active" style={{ marginTop: "0.9rem" }}>
            <strong><MathInlineText text={feedback} /></strong>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Your Stats</h2>
        {savedStats ? (
          <div className="kv compactKv">
            <div>
              <span>Games</span>
              <strong>{savedStats.sessions_played}</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{formatScore(savedStats.average_score)}</strong>
            </div>
            <div>
              <span>Last 10</span>
              <strong>{formatScore(savedStats.last_10_average)}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{savedStats.best_score}</strong>
            </div>
          </div>
        ) : (
          <p>No saved review runs yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>{courseId ? "Class Leaderboard" : "Leaderboard"}</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to compare review runs with classmates.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class review scores yet. Finish a run to get it started.</p>
          ) : null}
          {leaderboardRows.map((row, index) => (
            <div key={row.player_id} className="card" style={{ background: "#f9fbfc" }}>
              <strong>#{index + 1} {row.display_name}</strong>
              <p>
                Avg: {formatScore(row.average_score)} · Last 10: {formatScore(row.last_10_average)} · Best: {row.best_score}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
