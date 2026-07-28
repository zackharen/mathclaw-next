"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildSlopeInterceptRound } from "@/lib/question-engine/slope-intercept";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const GAME_SLUG = "slope_intercept";
const TOTAL_ROUNDS = 10;
const DESMOS_API_KEY =
  process.env.NEXT_PUBLIC_DESMOS_API_KEY || "dcb31709b452b1cf9dc26972add0fda6";

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function buildBounds(slope, intercept) {
  const xMin = -6;
  const xMax = 6;
  const yAtLeft = slope * xMin + intercept;
  const yAtRight = slope * xMax + intercept;
  const minY = Math.min(yAtLeft, yAtRight, intercept);
  const maxY = Math.max(yAtLeft, yAtRight, intercept);
  const padding = 2;

  return {
    left: xMin,
    right: xMax,
    bottom: Math.min(-10, Math.floor(minY - padding)),
    top: Math.max(10, Math.ceil(maxY + padding)),
  };
}

function parseIntegerInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function loadDesmosApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Desmos only loads in the browser."));
  }

  if (window.Desmos?.GraphingCalculator) {
    return Promise.resolve(window.Desmos);
  }

  if (window.__mathclawDesmosPromise) {
    return window.__mathclawDesmosPromise;
  }

  window.__mathclawDesmosPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-desmos-loader='1']");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Desmos));
      existing.addEventListener("error", () => reject(new Error("Could not load Desmos.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${DESMOS_API_KEY}`;
    script.async = true;
    script.dataset.desmosLoader = "1";
    script.onload = () => resolve(window.Desmos);
    script.onerror = () => reject(new Error("Could not load Desmos."));
    document.head.appendChild(script);
  });

  return window.__mathclawDesmosPromise;
}

function updateGraph(calculator, round) {
  if (!calculator || !round) return;

  calculator.setBlank();
  calculator.setMathBounds(buildBounds(round.slope, round.intercept));
  calculator.setExpression({
    id: "line",
    latex: `y=${round.slope}x${round.intercept < 0 ? round.intercept : `+${round.intercept}`}`,
    color: "#00325a",
  });
}

export default function SlopeInterceptClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  initialRound,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [slopeAnswer, setSlopeAnswer] = useState("");
  const [interceptAnswer, setInterceptAnswer] = useState("");
  const [round, setRound] = useState(initialRound);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const [isSaving, setIsSaving] = useState(false);
  const [graphReady, setGraphReady] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [scientificReady, setScientificReady] = useState(false);
  const [scientificFallback, setScientificFallback] = useState(false);
  const [lastRoundSummary, setLastRoundSummary] = useState(null);
  const [runComplete, setRunComplete] = useState(false);
  const graphHostRef = useRef(null);
  const scientificHostRef = useRef(null);
  const calculatorRef = useRef(null);
  const scientificCalculatorRef = useRef(null);
  const roundRef = useRef(initialRound);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    score: 0,
    attempts: 0,
    courseId: initialCourseId || "",
  });

  const courseSummary =
    courses.find((course) => course.id === courseId)?.title || "No class selected";
  const graphStatusMessage = graphError
    ? graphError
    : graphReady
      ? ""
      : "Loading graph...";
  const canSubmit =
    parseIntegerInput(slopeAnswer) !== null &&
    parseIntegerInput(interceptAnswer) !== null &&
    !runComplete &&
    !isSaving;
  roundRef.current = round;
  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=${GAME_SLUG}&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: GAME_SLUG,
          score: snapshot.score,
          result: snapshot.score >= Math.ceil(snapshot.attempts / 2) ? "correct" : "practice",
          courseId: snapshot.courseId || null,
          metadata: {
            attempts: snapshot.attempts,
            totalRounds: TOTAL_ROUNDS,
            percentCorrect: snapshot.attempts
              ? Math.round((snapshot.score / snapshot.attempts) * 100)
              : 0,
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
    if (runComplete) return undefined;

    let cancelled = false;

    loadDesmosApi()
      .then((Desmos) => {
        if (cancelled || !graphHostRef.current) return;

        const calculator = Desmos.GraphingCalculator(graphHostRef.current, {
          expressions: false,
          settingsMenu: false,
          zoomButtons: false,
          keypad: false,
          border: false,
          xAxisNumbers: true,
          yAxisNumbers: true,
        });

        calculatorRef.current = calculator;
        updateGraph(calculator, roundRef.current);
        setGraphReady(true);

        if (
          scientificHostRef.current &&
          Desmos.enabledFeatures?.ScientificCalculator &&
          typeof Desmos.ScientificCalculator === "function"
        ) {
          scientificCalculatorRef.current = Desmos.ScientificCalculator(scientificHostRef.current, {
            qwertyKeyboard: true,
            degreeMode: false,
          });
          setScientificReady(true);
          setScientificFallback(false);
        } else {
          setScientificFallback(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGraphError(error.message || "Could not load Desmos.");
          setScientificFallback(true);
        }
      });

    return () => {
      cancelled = true;
      calculatorRef.current?.destroy();
      scientificCalculatorRef.current?.destroy();
      calculatorRef.current = null;
      scientificCalculatorRef.current = null;
    };
  }, [runComplete]);

  useEffect(() => {
    if (!graphReady || !calculatorRef.current) return;
    updateGraph(calculatorRef.current, round);
  }, [graphReady, round]);

  useEffect(() => {
    sessionRef.current = {
      ...sessionRef.current,
      score,
      attempts: runComplete ? TOTAL_ROUNDS : Math.max(0, roundIndex - 1),
      courseId,
    };
  }, [courseId, roundIndex, runComplete, score]);

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
      saveSession(snapshot, { keepalive: true }).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  async function handleCourseChange(nextCourseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0) {
      setIsSaving(true);
      try {
        await saveSession(previousSnapshot);
      } catch (error) {
        setFeedback(error.message || "Could not save score.");
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    savedRunRef.current = false;
    setCourseId(nextCourseId);
    setRoundIndex(1);
    setScore(0);
    setFeedback("");
    setFeedbackTone("");
    setSlopeAnswer("");
    setInterceptAnswer("");
    setLastRoundSummary(null);
    setRunComplete(false);
    setRound((current) => buildSlopeInterceptRound(current.key));
    sessionRef.current = {
      score: 0,
      attempts: 0,
      courseId: nextCourseId,
    };
  }

  async function startNewRun() {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      setIsSaving(true);
      try {
        await saveSession(previousSnapshot);
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    savedRunRef.current = false;
    setRoundIndex(1);
    setScore(0);
    setFeedback("");
    setFeedbackTone("");
    setSlopeAnswer("");
    setInterceptAnswer("");
    setLastRoundSummary(null);
    setRunComplete(false);
    setRound((current) => buildSlopeInterceptRound(current.key));
    sessionRef.current = {
      score: 0,
      attempts: 0,
      courseId,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    const slopeGuess = parseIntegerInput(slopeAnswer);
    const interceptGuess = parseIntegerInput(interceptAnswer);
    const slopeCorrect = slopeGuess === round.slope;
    const interceptCorrect = interceptGuess === round.intercept;
    const roundCorrect = slopeCorrect && interceptCorrect;
    const nextScore = score + (roundCorrect ? 1 : 0);
    const nextAttempts = roundIndex;

    setScore(nextScore);
    setLastRoundSummary({
      slopeCorrect,
      interceptCorrect,
      correctSlope: round.slope,
      correctIntercept: round.intercept,
    });

    if (roundCorrect) {
      setFeedback("Nice work. You got both parts right.");
      setFeedbackTone("correct");
    } else if (slopeCorrect || interceptCorrect) {
      setFeedback(
        `Close. The line was slope ${round.slope} and y-intercept ${round.intercept}.`
      );
      setFeedbackTone("miss");
    } else {
      setFeedback(
        `Not this time. The line was slope ${round.slope} and y-intercept ${round.intercept}.`
      );
      setFeedbackTone("miss");
    }

    sessionRef.current = {
      score: nextScore,
      attempts: nextAttempts,
      courseId,
    };

    if (roundIndex >= TOTAL_ROUNDS) {
      setRunComplete(true);
      setIsSaving(true);
      try {
        await saveSession({
          score: nextScore,
          attempts: nextAttempts,
          courseId,
        });
      } catch (error) {
        setFeedback(error.message || "Could not save score.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setRoundIndex((current) => current + 1);
    setSlopeAnswer("");
    setInterceptAnswer("");
    setRound((current) => buildSlopeInterceptRound(current.key));
  }

  const attempts = runComplete ? TOTAL_ROUNDS : Math.max(0, roundIndex - 1);
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
  const resultTitle =
    score >= 9 ? "Graph-reading expert." : score >= 7 ? "Strong slope run." : "Good reps — graph another set.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="Your ten-graph run is saved with its class context. Replay for a new set of lines or head back to the Arcade."
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Graphs", value: TOTAL_ROUNDS },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Play Again"}
            onAction={startNewRun}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your graph run and refreshing the leaderboard…"
                : feedbackTone === "miss" && feedback.includes("save")
                  ? feedback
                  : "Run saved."
            }
          />
        ) : (
          <GameStage
            eyebrow={`Graph ${Math.min(roundIndex, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS}`}
            title="What line is this?"
            status={graphReady ? "Graph ready" : graphError ? "Graph unavailable" : "Loading graph"}
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Graph", value: `${Math.min(roundIndex, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="slopeInterceptGraphShell slopeGameShell">
              <div className="slopeInterceptGraphFrame">
                <div ref={graphHostRef} className="slopeInterceptGraph" />
                {graphStatusMessage ? (
                  <div className="slopeInterceptGraphOverlay">
                    <p>{graphStatusMessage}</p>
                  </div>
                ) : null}
              </div>
              <aside className="slopeInterceptPromptCard">
                <p className="slopeInterceptEyebrow">Graph {Math.min(roundIndex, TOTAL_ROUNDS)}</p>
                <h3>Read both features</h3>
                <p>Enter the slope and y-intercept as integers.</p>
                <form className="slopeInterceptAnswerForm" onSubmit={handleSubmit}>
                  <label>
                    Slope
                    <input
                      className="input"
                      inputMode="numeric"
                      pattern="-?[0-9]*"
                      placeholder="Ex: -3"
                      value={slopeAnswer}
                      onChange={(event) => setSlopeAnswer(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                  <label>
                    Y-intercept
                    <input
                      className="input"
                      inputMode="numeric"
                      pattern="-?[0-9]*"
                      placeholder="Ex: 4"
                      value={interceptAnswer}
                      onChange={(event) => setInterceptAnswer(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                  <button className="btn primary" type="submit" disabled={!canSubmit}>
                    Check Answer
                  </button>
                </form>
                {lastRoundSummary ? (
                  <div className="slopeInterceptRevealCard">
                    <strong>Last graph</strong>
                    <p>Slope: {lastRoundSummary.correctSlope}</p>
                    <p>Y-intercept: {lastRoundSummary.correctIntercept}</p>
                  </div>
                ) : null}
              </aside>
            </div>
            <p className={`gameFeedback slopeGameFeedback ${feedbackTone === "miss" ? "is-miss" : ""}`}>
              {feedback || "You earn the point when both the slope and y-intercept are correct."}
            </p>
          </GameStage>
        )}
      </div>

      <div className="gameWorkspaceRail">
        <GameSidePanel eyebrow="Setup" title="Choose the context">
          <p className="gameSetupSummary">{courseSummary} · Ten new lines per run</p>
          <div className="gameSetupOptions">
            <label>
              Class context
              <select
                className="input"
                value={courseId}
                onChange={(event) => handleCourseChange(event.target.value)}
                disabled={isSaving}
              >
                <option value="">Practice without a class</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" type="button" onClick={startNewRun} disabled={isSaving}>
              Reset Run
            </button>
          </div>
        </GameSidePanel>

        <GameSidePanel eyebrow="Progress" title="Your stats">
          <div className="gameSideStats">
            <div><span>Games</span><strong>{savedStats?.sessions_played || 0}</strong></div>
            <div><span>Average</span><strong>{formatScore(savedStats?.average_score || 0)}</strong></div>
            <div><span>Last 10</span><strong>{formatScore(savedStats?.last_10_average || 0)}</strong></div>
            <div><span>Best</span><strong>{formatScore(savedStats?.best_score || 0)}</strong></div>
          </div>
          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Choose a class to see class-specific scores.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading leaderboard...</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No scores saved for this class yet.</p>
              ) : null}
              {leaderboardRows.map((row, index) => (
                <div key={`${row.player_id}-${index}`} className="gameLeaderboardRow">
                  <strong>#{index + 1}</strong>
                  <span>{row.display_name}</span>
                  <strong>{formatScore(row.best_score ?? row.score ?? 0)}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>

        <GameSidePanel eyebrow="Tool" title="Scientific calculator">
          <div className="slopeScientificShell">
            {scientificFallback ? (
              <div className="slopeScientificFallback">
                <p>The embedded Desmos scientific calculator is not enabled for this API key.</p>
                <a className="btn" href="https://www.desmos.com/scientific" target="_blank" rel="noreferrer">
                  Open Desmos Calculator
                </a>
              </div>
            ) : null}
            <div
              ref={scientificHostRef}
              className={`slopeScientificCalculator ${scientificReady ? "isReady" : ""} ${
                scientificFallback ? "isHidden" : ""
              }`}
            />
          </div>
        </GameSidePanel>
      </div>
    </GameWorkspace>
  );
}
