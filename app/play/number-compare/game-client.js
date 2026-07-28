"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MathText, buildLabelNode } from "@/components/math-display";
import { buildAdaptiveSnapshot, nextAdaptiveLevel } from "@/lib/question-engine/adaptive";
import { numberCompareEngine } from "@/lib/question-engine/generators";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const TOTAL_ROUNDS = 10;

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function NumberCompareClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  initialPair,
}) {
  const [settings, setSettings] = useState({
    decimals: [1, 2],
    positiveNegative: true,
    fractions: true,
    squareRoots: false,
  });
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [level, setLevel] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pair, setPair] = useState(initialPair);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const sessionRef = useRef({
    score: 0,
    attempts: 0,
    level: 1,
    accuracy: 0,
    courseId: initialCourseId || "",
    settings: {
      decimals: [1, 2],
      positiveNegative: true,
      fractions: true,
      squareRoots: false,
    },
  });

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=number_compare&courseId=${encodeURIComponent(nextCourseId)}`
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
    },
    []
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

  const saveSession = useCallback(async (sessionSnapshot, options = {}) => {
    if (!sessionSnapshot || sessionSnapshot.attempts <= 0) {
      return null;
    }

    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: options.keepalive === true,
      body: JSON.stringify({
        gameSlug: "number_compare",
        score: sessionSnapshot.score,
        result: sessionSnapshot.score > 0 ? "correct" : "incorrect",
        courseId: sessionSnapshot.courseId || null,
        metadata: {
          skillRating: sessionSnapshot.level,
          attempts: sessionSnapshot.attempts,
          settings: sessionSnapshot.settings,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not save score.");
    }
    if (payload.stats) {
      setSavedStats((current) => ({
        ...current,
        ...payload.stats,
      }));
    }
    if (!options.keepalive) {
      await loadLeaderboard(sessionSnapshot.courseId || "");
    }
    return payload.stats || null;
  }, [loadLeaderboard]);

  useEffect(() => {
    sessionRef.current = {
      ...sessionRef.current,
      ...buildAdaptiveSnapshot({
        level,
        correctAnswers: score,
        attempts,
      }),
      score,
      attempts,
      courseId,
      settings,
    };
  }, [attempts, courseId, level, score, settings]);

  useEffect(() => {
    function handlePageHide() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.attempts <= 0 || savedRunRef.current) return;
      saveSession(snapshot, { keepalive: true }).catch(() => {});
      savedRunRef.current = true;
      sessionRef.current = {
        ...sessionRef.current,
        score: 0,
        attempts: 0,
        accuracy: 0,
      };
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  async function handleCourseChange(nextCourseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession(previousSnapshot);
        savedRunRef.current = true;
      } catch (error) {
        setFeedback(error.message || "Could not save score.");
        return;
      }
    }

    sessionRef.current = {
      ...sessionRef.current,
      score: 0,
      attempts: 0,
      level: 1,
      accuracy: 0,
      courseId: nextCourseId,
      settings,
    };
    savedRunRef.current = false;
    setScore(0);
    setAttempts(0);
    setLevel(1);
    setFeedback("");
    setFeedbackTone("");
    setCourseId(nextCourseId);
    setPair([
      numberCompareEngine.buildQuestion(settings),
      numberCompareEngine.buildQuestion(settings),
    ]);
  }

  async function startNewRun() {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({ ...previousSnapshot, result: "reset" });
        savedRunRef.current = true;
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        return;
      }
    }

    sessionRef.current = {
      ...sessionRef.current,
      score: 0,
      attempts: 0,
      level: 1,
      accuracy: 0,
      courseId,
      settings,
    };
    savedRunRef.current = false;
    setScore(0);
    setAttempts(0);
    setLevel(1);
    setFeedback("");
    setFeedbackTone("");
    setPair([
      numberCompareEngine.buildQuestion(settings),
      numberCompareEngine.buildQuestion(settings),
    ]);
  }

  function toggleDecimal(place) {
    setSettings((current) => {
      const decimals = current.decimals.includes(place)
        ? current.decimals.filter((value) => value !== place)
        : [...current.decimals, place].sort();
      return { ...current, decimals: decimals.length ? decimals : [1] };
    });
  }

  async function answer(index) {
    if (attempts >= TOTAL_ROUNDS || isSaving) return;

    const values = [pair[0].value, pair[1].value];
    const winner = values[0] === values[1] ? null : values[0] > values[1] ? 0 : 1;
    const correct = winner === null || winner === index;
    const nextScore = score + (correct ? 1 : 0);
    const nextAttempts = sessionRef.current.attempts + 1;
    const runComplete = nextAttempts >= TOTAL_ROUNDS;
    const nextLevel = nextAdaptiveLevel({
      currentLevel: level,
      correct,
      streak: correct ? 1 : 0,
      riseAfterStreak: 1,
    });
    setScore(nextScore);
    setAttempts(nextAttempts);
    setLevel(nextLevel);
    setFeedback(correct ? "Nice read — keep the streak moving." : "Not this time. Reset and read both values carefully.");
    setFeedbackTone(correct ? "correct" : "miss");

    const nextSnapshot = {
      ...sessionRef.current,
      ...buildAdaptiveSnapshot({
        level: nextLevel,
        correctAnswers: nextScore,
        attempts: nextAttempts,
      }),
      score: nextScore,
      attempts: nextAttempts,
      courseId,
      settings,
    };
    sessionRef.current = nextSnapshot;

    if (runComplete) {
      setIsSaving(true);
      try {
        await saveSession({ ...nextSnapshot, result: "finished" });
        savedRunRef.current = true;
      } catch (error) {
        setFeedback(error.message || "Your run is complete, but the score could not be saved yet.");
        setFeedbackTone("miss");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setPair([
      numberCompareEngine.buildQuestion(settings),
      numberCompareEngine.buildQuestion(settings),
    ]);
  }

  const runComplete = attempts >= TOTAL_ROUNDS;
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
  const resultTitle =
    score >= 9 ? "Number sense superstar." : score >= 7 ? "Strong comparison run." : "Good practice — run it back.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="Your score is saved with the same class and difficulty settings. Replay to beat it or head back to the Arcade for something new."
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Level reached", value: level },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Play Again"}
            onAction={startNewRun}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your score and refreshing the leaderboard…"
                : savedRunRef.current
                  ? "Run saved."
                  : feedback
            }
          />
        ) : (
          <GameStage
            eyebrow={`Question ${attempts + 1} of ${TOTAL_ROUNDS}`}
            title="Pick the bigger number"
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
              { label: "Level", value: level },
            ]}
          >
            <div className="gameQuestion">
              <p className="gameQuestionPrompt">
                Tap the larger value. If both values are exactly equal, either answer counts.
              </p>
              <div className="gameChoiceGrid">
                {pair.map((entry, index) => (
                  <button
                    key={`${entry.label}-${index}`}
                    className="btn gameChoice"
                    type="button"
                    onClick={() => answer(index)}
                    disabled={isSaving}
                  >
                    <MathText node={buildLabelNode(entry.label)} className="mathChoiceContent" />
                  </button>
                ))}
              </div>
              <p className={`gameFeedback ${feedbackTone === "miss" ? "is-miss" : ""}`}>
                {feedback || "Read both sides before you choose."}
              </p>
            </div>
          </GameStage>
        )}
      </div>

      <aside className="gameWorkspaceRail" aria-label="Game setup and stats">
        <GameSidePanel eyebrow="Setup" title="Tune this run" id="game-setup">
          <p className="gameSetupSummary">
            {String(settings.decimals.length) + " decimal mode" + (settings.decimals.length === 1 ? "" : "s")}
            {" · "}
            {settings.positiveNegative ? "Integers on" : "Integers off"}
            {" · "}
            {settings.fractions ? "Fractions on" : "Fractions off"}
            {" · "}
            {settings.squareRoots ? "Roots on" : "Roots off"}
          </p>
          <div className="gameSetupOptions">
            <div className="gameSetupChoiceRow">
              {[1, 2, 3, 4].map((place) => (
                <button
                  key={place}
                  type="button"
                  className={"btn " + (settings.decimals.includes(place) ? "primary" : "")}
                  onClick={() => toggleDecimal(place)}
                >
                  {place === 1 ? "Tenths" : place === 2 ? "Hundredths" : place === 3 ? "Thousandths" : "10-thousandths"}
                </button>
              ))}
            </div>
            <label className="toggleRow">
              <input type="checkbox" checked={settings.positiveNegative} onChange={(e) => setSettings((current) => ({ ...current, positiveNegative: e.target.checked }))} />
              Positive / negative integers
            </label>
            <label className="toggleRow">
              <input type="checkbox" checked={settings.fractions} onChange={(e) => setSettings((current) => ({ ...current, fractions: e.target.checked }))} />
              Fractions
            </label>
            <label className="toggleRow">
              <input type="checkbox" checked={settings.squareRoots} onChange={(e) => setSettings((current) => ({ ...current, squareRoots: e.target.checked }))} />
              Square roots
            </label>
            <label>
              Class context
              <select className="input" value={courseId} onChange={(e) => handleCourseChange(e.target.value)}>
                <option value="">No class selected</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </label>
            <button className="btn" type="button" onClick={startNewRun} disabled={isSaving}>
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
          <p className="gameSetupSummary">No saved runs yet. Finish ten questions to start your record.</p>
        )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to see your classmates.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard…</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No class scores yet. Finish a run to get it started.</p>
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
