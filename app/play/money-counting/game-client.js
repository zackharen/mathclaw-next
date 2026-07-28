"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMoneyChoices,
  buildMoneyQuestion,
} from "@/lib/question-engine/money-counting";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const TOTAL_ROUNDS = 10;
const DENOMINATIONS = [
  { key: "one", label: "$1", cents: 100, name: "Dollar", shortName: "bill", visual: "bill", colorClass: "dollar" },
  { key: "quarter", label: "25c", cents: 25, name: "Quarter", shortName: "coin", visual: "coin", colorClass: "quarter" },
  { key: "dime", label: "10c", cents: 10, name: "Dime", shortName: "coin", visual: "coin", colorClass: "dime" },
  { key: "nickel", label: "5c", cents: 5, name: "Nickel", shortName: "coin", visual: "coin", colorClass: "nickel" },
  { key: "penny", label: "1c", cents: 1, name: "Penny", shortName: "coin", visual: "coin", colorClass: "penny" },
];

const EMPTY_PILE = {
  one: 0,
  quarter: 0,
  dime: 0,
  nickel: 0,
  penny: 0,
};

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function pileTotal(pile) {
  return DENOMINATIONS.reduce(
    (sum, denomination) => sum + denomination.cents * Number(pile[denomination.key] || 0),
    0
  );
}

function describeDifference(delta) {
  if (delta === 0) {
    return "Exact match";
  }

  if (delta > 0) {
    return `${formatMoney(delta)} too high`;
  }

  return `${formatMoney(Math.abs(delta))} to go`;
}

export default function MoneyCountingClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  initialQuestion,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [mode, setMode] = useState("mixed");
  const [countAnswerMode, setCountAnswerMode] = useState("multiple_choice");
  const [choiceCount, setChoiceCount] = useState(4);
  const [showRunningTotal, setShowRunningTotal] = useState(true);
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [question, setQuestion] = useState(initialQuestion);
  const [playerPile, setPlayerPile] = useState(EMPTY_PILE);
  const [countAnswerDollars, setCountAnswerDollars] = useState("");
  const [countAnswerCents, setCountAnswerCents] = useState("");
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    attempts: 0,
    score: 0,
    mode: "mixed",
    countAnswerMode: "multiple_choice",
    choiceCount: 4,
  });
  const savedRunRef = useRef(false);

  const choices = question.choices;
  const builtTotal = useMemo(() => pileTotal(playerPile), [playerPile]);
  const buildDelta = question.total - builtTotal;
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=money_counting&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: "money_counting",
          score: snapshot.score,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            attempts: snapshot.attempts,
            mode: snapshot.mode,
            count_answer_mode: snapshot.countAnswerMode,
            choice_count: snapshot.choiceCount,
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
      saveSession({ ...snapshot, result: "left_page" }, { keepalive: true }).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  function resetRun(nextMode = mode, nextCourseId = courseId) {
    savedRunRef.current = false;
    const nextQuestion = buildMoneyQuestion(nextMode, choiceCount);
    setQuestion(nextQuestion);
    setPlayerPile(EMPTY_PILE);
    setCountAnswerDollars("");
    setCountAnswerCents("");
    setRoundIndex(1);
    setScore(0);
    setFeedback("");
    setFeedbackTone("");
    sessionRef.current = {
      courseId: nextCourseId,
      attempts: 0,
      score: 0,
      mode: nextMode,
      countAnswerMode,
      choiceCount,
    };
  }

  async function startNewRun() {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({ ...previousSnapshot, result: "reset" });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        return;
      }
    }

    resetRun();
  }

  async function handleCourseChange(nextCourseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({ ...previousSnapshot, result: "switched_class" });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
        return;
      }
    }

    setCourseId(nextCourseId);
    resetRun(mode, nextCourseId);
  }

  async function advanceRun(correct) {
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = sessionRef.current.score + (correct ? 1 : 0);
    const finished = nextAttempts >= TOTAL_ROUNDS;

    sessionRef.current = {
      courseId,
      attempts: nextAttempts,
      score: nextScore,
      mode,
      countAnswerMode,
      choiceCount,
    };

    setScore(nextScore);

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

    const nextQuestion = buildMoneyQuestion(mode, choiceCount);
    setQuestion(nextQuestion);
    setPlayerPile(EMPTY_PILE);
    setCountAnswerDollars("");
    setCountAnswerCents("");
    setRoundIndex(nextAttempts + 1);
  }

  function answerCountMode(choice) {
    const correct = choice === question.total;
    setFeedback(correct ? "Correct total." : `Not quite. The money shown is ${formatMoney(question.total)}.`);
    setFeedbackTone(correct ? "correct" : "miss");
    advanceRun(correct);
  }

  function answerCountFillMode() {
    const dollars = Number.parseInt(countAnswerDollars || "0", 10);
    const cents = Number.parseInt(countAnswerCents || "0", 10);

    if (Number.isNaN(dollars) || Number.isNaN(cents) || cents < 0 || cents > 99) {
      setFeedback("Enter a valid dollar amount and a cents value from 00 to 99.");
      setFeedbackTone("miss");
      return;
    }

    const submittedTotal = dollars * 100 + cents;
    const correct = submittedTotal === question.total;
    setFeedback(correct ? "Correct total." : `Not quite. The money shown is ${formatMoney(question.total)}.`);
    setFeedbackTone(correct ? "correct" : "miss");
    setCountAnswerDollars("");
    setCountAnswerCents("");
    advanceRun(correct);
  }

  function answerMakeMode() {
    const correct = builtTotal === question.total;
    setFeedback(
      correct
        ? "You built the right amount."
        : `Not quite. The target was ${formatMoney(question.total)} and your pile was ${formatMoney(builtTotal)}.`
    );
    setFeedbackTone(correct ? "correct" : "miss");
    advanceRun(correct);
  }

  function renderMoneyVisual(denomination, count, compact = false) {
    const visibleCount = Math.min(count, compact ? 3 : 4);
    const extraCount = Math.max(0, count - visibleCount);

    return (
      <div className={`moneyVisualStack ${compact ? "compact" : ""}`} aria-hidden="true">
        {Array.from({ length: Math.max(visibleCount, 1) }).map((_, index) => (
          <span
            key={`${denomination.key}-${index}`}
            className={`moneyVisual ${denomination.visual} ${denomination.colorClass}`}
            style={{
              transform: `translate(${index * 6}px, ${index * 3}px)`,
              zIndex: visibleCount - index,
            }}
          >
            <span>{denomination.label}</span>
          </span>
        ))}
        {count > 1 ? <span className="moneyVisualCount">x{count}</span> : null}
        {extraCount > 0 ? <span className="moneyVisualExtra">+{extraCount}</span> : null}
      </div>
    );
  }

  function renderSpreadMoneyVisuals(denomination, count) {
    return (
      <div className={`moneyPieceField ${denomination.visual}Field`} aria-label={`${count} ${denomination.name}${count === 1 ? "" : "s"}`}>
        {Array.from({ length: count }).map((_, index) => (
          <span
            key={`${denomination.key}-piece-${index}`}
            className={`moneyVisual ${denomination.visual} ${denomination.colorClass} moneyPiece`}
            style={{
              transform: `rotate(${(index % 4) * 4 - 6}deg)`,
            }}
          >
            <span>{denomination.label}</span>
          </span>
        ))}
      </div>
    );
  }

  function handleChoiceCountChange(nextChoiceCount) {
    setChoiceCount(nextChoiceCount);
    setQuestion((current) => ({
      ...current,
      choices: buildMoneyChoices(current.total, nextChoiceCount),
    }));
    setFeedback("");
    setCountAnswerDollars("");
    setCountAnswerCents("");
  }

  function handleCountAnswerModeChange(nextCountAnswerMode) {
    setCountAnswerMode(nextCountAnswerMode);
    setFeedback("");
    setCountAnswerDollars("");
    setCountAnswerCents("");
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;
  const attempts = sessionRef.current.attempts;
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
  const resultTitle =
    score >= 9 ? "Money master." : score >= 7 ? "Strong counting run." : "Good practice — count it again.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="Your money run is saved with its mode, answer style, and class context. Replay the same setup or adjust the controls for a different challenge."
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Mode", value: mode === "mixed" ? "Mixed" : mode === "count" ? "Count" : "Build" },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Play Again"}
            onAction={startNewRun}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your money run and refreshing the leaderboard…"
                : feedbackTone === "miss" && feedback.includes("save")
                  ? feedback
                  : "Run saved."
            }
          />
        ) : (
          <GameStage
            eyebrow={`Round ${Math.min(roundIndex, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS}`}
            title={question.mode === "count" ? "Count The Money" : "Make The Amount"}
            status={isSaving ? "Saving run" : "Run in progress"}
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Round", value: `${Math.min(roundIndex, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="gameQuestion moneyGameQuestion">
              {question.mode === "count" ? (
                <>
                  <p className="gameQuestionPrompt">How much money is shown?</p>
                  <div className="moneyDisplayRow">
                    {DENOMINATIONS.map((denomination) =>
                      question.pile[denomination.key] > 0 ? (
                        <div key={denomination.key} className="moneyTile">
                          {renderSpreadMoneyVisuals(denomination, question.pile[denomination.key])}
                          <strong>{denomination.name}</strong>
                        </div>
                      ) : null
                    )}
                  </div>
                  {countAnswerMode === "fill" ? (
                    <div className="list moneyCenteredControls">
                      <p>Write the total amount shown.</p>
                      <div className="moneyAnswerRow">
                        <span className="moneyAnswerDollar">$</span>
                        <input
                          className="input moneyAnswerInput"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={countAnswerDollars}
                          onChange={(event) => setCountAnswerDollars(event.target.value.replace(/\D/g, ""))}
                          placeholder="0"
                        />
                        <span className="moneyAnswerDot">.</span>
                        <input
                          className="input moneyAnswerInput"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={countAnswerCents}
                          onChange={(event) => setCountAnswerCents(event.target.value.replace(/\D/g, "").slice(0, 2))}
                          placeholder="00"
                        />
                      </div>
                      <button className="btn primary" type="button" onClick={answerCountFillMode}>
                        Check Total
                      </button>
                    </div>
                  ) : (
                    <div className="gameReviewChoices">
                      {choices.map((choice) => (
                        <button
                          key={choice}
                          className="gameReviewChoice"
                          type="button"
                          onClick={() => answerCountMode(choice)}
                        >
                          {formatMoney(choice)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="moneyBuildChallenge">
                  <p className="gameQuestionPrompt">
                    Build exactly <strong>{formatMoney(question.total)}</strong>.
                  </p>
                  <div className="pillRow moneyCenteredRow">
                    <span className="pill">Target: {formatMoney(question.total)}</span>
                    {showRunningTotal ? <span className="pill">Your Total: {formatMoney(builtTotal)}</span> : null}
                    {showRunningTotal ? (
                      <span className={`pill moneyDeltaPill ${buildDelta === 0 ? "exact" : buildDelta > 0 ? "under" : "over"}`}>
                        {describeDifference(-buildDelta)}
                      </span>
                    ) : (
                      <span className="pill">Total hidden</span>
                    )}
                  </div>
                  <div className="moneyQuickActions">
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setPlayerPile(EMPTY_PILE)}
                      disabled={builtTotal === 0}
                    >
                      Clear Amount
                    </button>
                    <span className="moneyHelperText">
                      {showRunningTotal ? "Build the target exactly before you check." : "Count your pile as you build."}
                    </span>
                  </div>
                  <div className="moneyDisplayRow">
                    {DENOMINATIONS.map((denomination) => {
                      const denominationCount = playerPile[denomination.key];
                      const denominationTotal = denomination.cents * denominationCount;
                      return (
                        <div key={denomination.key} className="moneyAdjustCard">
                          {renderMoneyVisual(denomination, denominationCount, false)}
                          <strong>{denomination.name}</strong>
                          <span>{denomination.label} each</span>
                          <span>Count: {denominationCount}</span>
                          <span>{showRunningTotal ? `Total: ${formatMoney(denominationTotal)}` : "Total hidden"}</span>
                          <div className="ctaRow">
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() =>
                                setPlayerPile((current) => ({
                                  ...current,
                                  [denomination.key]: Math.max(0, current[denomination.key] - 1),
                                }))
                              }
                              disabled={denominationCount === 0}
                            >
                              −
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() =>
                                setPlayerPile((current) => ({
                                  ...current,
                                  [denomination.key]: current[denomination.key] + 1,
                                }))
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="btn primary" type="button" onClick={answerMakeMode}>
                    Check Amount
                  </button>
                </div>
              )}
              <p className={`gameFeedback ${feedbackTone === "miss" ? "is-miss" : ""}`}>
                {feedback || "Count carefully and submit when you are ready."}
              </p>
            </div>
          </GameStage>
        )}
      </div>

      <div className="gameWorkspaceRail">
        <GameSidePanel eyebrow="Setup" title="Choose the challenge">
          <p className="gameSetupSummary">
            {(mode === "mixed" ? "Mixed mode" : mode === "count" ? "Count the money" : "Make the amount")} · {courseSummary}
          </p>
          <div className="gameSetupOptions">
            <label>
              Game mode
              <select
                className="input"
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value;
                  setMode(nextMode);
                  resetRun(nextMode, courseId);
                }}
              >
                <option value="mixed">Mixed</option>
                <option value="count">Count The Money</option>
                <option value="make">Make The Amount</option>
              </select>
            </label>
            <div>
              <p className="gameSetupLabel">Count answers</p>
              <div className="gameSetupChoiceRow moneyAnswerChoices">
                <button
                  className={"btn " + (countAnswerMode === "fill" ? "primary" : "")}
                  type="button"
                  onClick={() => handleCountAnswerModeChange("fill")}
                >
                  Fill In
                </button>
                {[2, 3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    className={"btn " + (countAnswerMode === "multiple_choice" && choiceCount === count ? "primary" : "")}
                    type="button"
                    onClick={() => {
                      handleCountAnswerModeChange("multiple_choice");
                      handleChoiceCountChange(count);
                    }}
                  >
                    {count} MP
                  </button>
                ))}
              </div>
            </div>
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
            <label className="moneyToggleControl">
              Running total
              <button
                className={`btn ${showRunningTotal ? "primary" : "ghost"}`}
                type="button"
                onClick={() => setShowRunningTotal((current) => !current)}
              >
                {showRunningTotal ? "Shown" : "Hidden"}
              </button>
            </label>
            <button className="btn primary" type="button" onClick={startNewRun}>
              Reset Run
            </button>
          </div>
        </GameSidePanel>

        <GameSidePanel eyebrow="Progress" title="Your stats">
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
          <p>No saved runs yet.</p>
        )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to compare with classmates.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No class scores yet. Finish a run to get it started.</p>
              ) : null}
              {leaderboardRows.map((row, index) => (
                <div key={row.player_id} className="gameLeaderboardRow">
                  <strong>#{index + 1}</strong>
                  <span>{row.display_name}</span>
                  <strong>{formatScore(row.best_score)}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>
      </div>
    </GameWorkspace>
  );
}
