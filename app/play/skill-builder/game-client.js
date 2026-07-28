"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import { buildAdaptiveSnapshot, nextAdaptiveLevel } from "@/lib/question-engine/adaptive";
import {
  buildSkillBuilderQuestion,
  hydrateSkillBuilderQuestion,
  listSkillBuilderTargets,
} from "@/lib/question-engine/skill-builder";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

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
  initialQuestion,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [target, setTarget] = useState("integers");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(1);
  const [feedback, setFeedback] = useState(
    "Choose the strongest answer and keep building your mastery meter."
  );
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [question, setQuestion] = useState(() =>
    hydrateSkillBuilderQuestion(initialQuestion)
  );
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

  const courseSummary =
    courses.find((course) => course.id === courseId)?.title || "No class selected";
  const targetSummary = TARGETS.find((item) => item.slug === target) || TARGETS[0];
  const attempts = sessionRef.current.attempts || 0;
  const masterySnapshot = buildAdaptiveSnapshot({
    level,
    streak,
    correctAnswers: score,
    attempts,
  });
  const accuracy = Math.round(masterySnapshot.accuracy * 100);
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
      setFeedbackTone("miss");
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
    setFeedbackTone("");
    setIsSaving(false);
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
      setIsSaving(true);
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        setFeedbackTone("miss");
        return;
      } finally {
        setIsSaving(false);
      }
    }

    resetRun(nextTarget, nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startNewRun("switched_class", target, nextCourseId);
  }

  async function answerQuestion(choice) {
    if (sessionRef.current.attempts >= TOTAL_ROUNDS || isSaving) return;

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
    setFeedbackTone(correct ? "correct" : "miss");

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
    setQuestion(buildSkillBuilderQuestion(target, nextLevel));
  }

  const runComplete = attempts >= TOTAL_ROUNDS;
  const resultTitle =
    score >= 11
      ? "Mastery is climbing."
      : score >= 9
        ? "A strong skill-building run."
        : "Solid reps — keep building.";

  return (
    <GameWorkspace className="skillBuilderWorkspace">
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message={`You completed ${targetSummary.label} and reached skill level ${level}. Your run keeps its target and class context.`}
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Skill level", value: level },
              { label: "Mastery", value: `${masteryPercent}%` },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Build Again"}
            onAction={() => startNewRun("restart_after_finish", target, courseId)}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your skill run and refreshing the leaderboard…"
                : savedRunRef.current
                  ? "Run saved."
                  : feedback
            }
          />
        ) : (
          <GameStage
            eyebrow={`Question ${roundIndex} of ${TOTAL_ROUNDS}`}
            title={targetSummary.label}
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Streak", value: streak },
              { label: "Skill level", value: level },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="skillBuilderMastery">
              <div>
                <span>Mastery meter</span>
                <strong>{masteryPercent}%</strong>
              </div>
              <span className="skillBuilderMasteryTrack">
                <span style={{ width: `${masteryPercent}%` }} />
              </span>
            </div>

            <div className="gameQuestion skillBuilderQuestion">
              <div className="skillBuilderPromptCard">
                <p className="skillBuilderPromptLabel">{question.prompt}</p>
                {question.leftLabel && question.rightLabel ? (
                  <div className="skillBuilderCompareRow">
                    <div className="skillBuilderValueCard"><MathText node={question.leftNode} /></div>
                    <div className="skillBuilderVs">vs</div>
                    <div className="skillBuilderValueCard"><MathText node={question.rightNode} /></div>
                  </div>
                ) : (
                  <div className="skillBuilderEquation">
                    {question.promptNode ? (
                      <MathText node={question.promptNode} />
                    ) : (
                      <MathInlineText text={question.prompt} />
                    )}
                  </div>
                )}
              </div>

              <div className="skillBuilderChoices">
                {question.choices.map((choice) => (
                  <button
                    key={String(choice)}
                    type="button"
                    className="btn skillBuilderChoice"
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

      <aside className="gameWorkspaceRail" aria-label="Skill Builder setup and stats">
        <GameSidePanel eyebrow="Setup" title="Build your run" id="game-setup">
          <p className="gameSetupSummary">
            {targetSummary.label} · {courseSummary}
          </p>
          <div className="skillBuilderTargetSummary">
            <strong>{targetSummary.label}</strong>
            <p>{targetSummary.description}</p>
          </div>
          <div className="gameSetupOptions">
            <label>
              Target skill
              <select
                className="input"
                value={target}
                onChange={(event) =>
                  startNewRun("switched_target", event.target.value, courseId)
                }
                disabled={isSaving}
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
              <select
                className="input"
                value={courseId}
                onChange={(event) => handleCourseChange(event.target.value)}
                disabled={isSaving}
              >
                <option value="">No class selected</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              type="button"
              onClick={() => startNewRun("manual_reset", target, courseId)}
              disabled={isSaving}
            >
              Start Fresh Run
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
                <strong>{formatScore(savedStats.best_score)}</strong>
              </div>
            </div>
          ) : (
            <p className="gameSetupSummary">
              No saved Skill Builder runs yet. Finish all twelve questions to start your record.
            </p>
          )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to compare Skill Builder runs.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard…</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No class scores yet. Finish a run to get it started.</p>
              ) : null}
              {leaderboardRows.map((row, index) => (
                <div
                  key={`${row.player_id || row.display_name}-${index}`}
                  className="gameLeaderboardRow"
                >
                  <strong>#{index + 1}</strong>
                  <span>{row.display_name || "Student"}</span>
                  <strong>{formatScore(row.best_score ?? row.score)}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>
      </aside>
    </GameWorkspace>
  );
}
