"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import {
  buildSpiralReviewQuestion,
  hydrateSpiralReviewQuestion,
  listSpiralReviewSkills,
} from "@/lib/question-engine/spiral-review";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

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
  initialQuestion,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [focus, setFocus] = useState("mixed");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState("Start the review run and keep your streak alive.");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [question, setQuestion] = useState(() => hydrateSpiralReviewQuestion(initialQuestion));
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
  const attempts = sessionRef.current.attempts || 0;
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;

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
    setFeedbackTone("");
    setIsSaving(false);
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
    if (sessionRef.current.attempts >= TOTAL_ROUNDS || isSaving) return;

    const correct = question.checkAnswer(choice);
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = score + (correct ? 1 : 0);
    const nextStreak = correct ? streak + 1 : 0;
    const finished = nextAttempts >= TOTAL_ROUNDS;

    setScore(nextScore);
    setStreak(nextStreak);
    setFeedback(correct ? "Nice review hit." : question.explanation);
    setFeedbackTone(correct ? "correct" : "miss");

    sessionRef.current = {
      courseId,
      focus,
      attempts: nextAttempts,
      correctAnswers: nextScore,
      streak: nextStreak,
      result: finished ? "finished" : "active",
    };

    if (finished) {
      setIsSaving(true);
      try {
        await saveSession({
          ...sessionRef.current,
          result: "finished",
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        setFeedbackTone("miss");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setRoundIndex(nextAttempts + 1);
    setQuestion(buildSpiralReviewQuestion(focus));
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;
  const skillLabel = question.skill === "integers" ? "Integers" : "Compare Numbers";
  const resultTitle =
    score >= 11 ? "Review mastery unlocked." : score >= 9 ? "Strong mixed review." : "Good reps — keep spiraling.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="This review run is saved with its skill focus and class context. Replay the mix or adjust the setup for a more targeted round."
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Final streak", value: streak },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Play Again"}
            onAction={() => startNewRun("reset")}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your review run and refreshing the leaderboard…"
                : savedRunRef.current
                  ? "Run saved."
                  : feedback
            }
          />
        ) : (
          <GameStage
            eyebrow={`Question ${roundIndex} of ${TOTAL_ROUNDS}`}
            title={skillLabel}
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Streak", value: streak },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="gameQuestion gameReviewQuestion">
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

              <div className="gameReviewChoices">
                {question.choices.map((choice) => (
                  <button
                    key={String(choice)}
                    className="btn gameReviewChoice"
                    type="button"
                    onClick={() => answerQuestion(choice)}
                    disabled={isSaving}
                  >
                    <MathText
                      node={question.formatChoiceNode(choice)}
                      className="mathChoiceContent"
                    />
                  </button>
                ))}
              </div>

              <p className={`gameFeedback ${feedbackTone === "miss" ? "is-miss" : ""}`}>
                <MathInlineText text={feedback} />
              </p>
            </div>
          </GameStage>
        )}
      </div>

      <aside className="gameWorkspaceRail" aria-label="Review setup and stats">
        <GameSidePanel eyebrow="Setup" title="Choose the mix" id="game-setup">
          <p className="gameSetupSummary">
            {SKILL_OPTIONS.find((option) => option.slug === focus)?.label || "Mixed Review"}
            {" · "}
            {courseSummary}
          </p>
          <div className="gameSetupOptions">
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
            <button className="btn" type="button" onClick={() => startNewRun("reset")} disabled={isSaving}>
              Reset Run
            </button>
          </div>
        </GameSidePanel>

        <GameSidePanel eyebrow="Progress" title="Your stats" id="game-stats">
        {savedStats ? (
          <div className="gameSideStats">
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
          <p className="gameSetupSummary">No saved review runs yet. Finish all twelve questions to start your record.</p>
        )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to compare review runs.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard…</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No class review scores yet. Finish a run to get it started.</p>
              ) : null}
              {leaderboardRows.map((row, index) => (
                <div key={row.player_id} className="gameLeaderboardRow">
                  <strong>#{index + 1}</strong>
                  <span>{row.display_name}</span>
                  <strong>{row.best_score}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>
      </aside>
    </GameWorkspace>
  );
}
