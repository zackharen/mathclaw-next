"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MathInlineText } from "@/components/math-display";
import {
  buildQuestionKindReviewQuestion,
  hydrateQuestionKindReviewQuestion,
  listQuestionKinds,
} from "@/lib/question-engine/question-kind-review";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const TOTAL_ROUNDS = 10;
const KIND_OPTIONS = [{ slug: "mixed", label: "Mixed Question Types" }, ...listQuestionKinds()];

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function QuestionKindReviewClient({
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
  const [feedback, setFeedback] = useState("Look at the prompt first, then decide what kind of question it is.");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [question, setQuestion] = useState(() =>
    hydrateQuestionKindReviewQuestion(initialQuestion)
  );
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
        `/api/play/leaderboard?gameSlug=question_kind_review&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: "question_kind_review",
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
    setFeedback("Look at the prompt first, then decide what kind of question it is.");
    setFeedbackTone("");
    setIsSaving(false);
    setQuestion(buildQuestionKindReviewQuestion(nextFocus));
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
    setFeedback(correct ? "Good catch. You recognized the question type." : question.explanation);
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
    setQuestion(buildQuestionKindReviewQuestion(focus));
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;
  const resultTitle =
    score >= 9 ? "Strategy spotter." : score >= 7 ? "Strong question reading." : "Good noticing — try another set.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="Your strategy run is saved with its question focus and class context. Replay the mix or narrow the next run to one question type."
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
                ? "Saving your strategy run and refreshing the leaderboard…"
                : savedRunRef.current
                  ? "Run saved."
                  : feedback
            }
          />
        ) : (
          <GameStage
            eyebrow={`Question ${roundIndex} of ${TOTAL_ROUNDS}`}
            title="Name the question type"
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Streak", value: streak },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="gameQuestion gameReviewQuestion">
              <div className="spiralReviewCard gameKindPromptCard">
                <p className="spiralReviewLabel">Read the prompt before solving</p>
                <div className="spiralReviewPrompt"><MathInlineText text={question.prompt} /></div>
              </div>

              <div className="gameReviewChoices">
                {question.choices.map((choice) => (
                  <button
                    key={choice}
                    className="btn gameReviewChoice"
                    type="button"
                    onClick={() => answerQuestion(choice)}
                    disabled={isSaving}
                  >
                    {question.formatChoice(choice)}
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

      <aside className="gameWorkspaceRail" aria-label="Question review setup and stats">
        <GameSidePanel eyebrow="Setup" title="Choose the focus" id="game-setup">
          <p className="gameSetupSummary">
            {KIND_OPTIONS.find((option) => option.slug === focus)?.label || "Mixed Question Types"}
            {" · "}
            {courseSummary}
          </p>
          <div className="gameSetupOptions">
            <label>
              Question focus
              <select
                className="input"
                value={focus}
                onChange={(event) => startNewRun("switched_focus", event.target.value, courseId)}
              >
                {KIND_OPTIONS.map((option) => (
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
          <p className="gameSetupSummary">No saved strategy runs yet. Finish all ten questions to start your record.</p>
        )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to compare strategy runs.</p> : null}
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
