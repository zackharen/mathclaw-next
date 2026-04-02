"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TOTAL_ROUNDS = 10;
const DENOMINATIONS = [
  { key: "one", label: "$1", cents: 100 },
  { key: "quarter", label: "25c", cents: 25 },
  { key: "dime", label: "10c", cents: 10 },
  { key: "nickel", label: "5c", cents: 5 },
  { key: "penny", label: "1c", cents: 1 },
];

function randomCount(limit) {
  return Math.floor(Math.random() * (limit + 1));
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildMoneyPile() {
  const pile = {
    one: randomCount(3),
    quarter: randomCount(4),
    dime: randomCount(4),
    nickel: randomCount(4),
    penny: randomCount(4),
  };

  const total = DENOMINATIONS.reduce(
    (sum, denomination) => sum + denomination.cents * pile[denomination.key],
    0
  );

  if (total === 0) {
    pile.quarter = 1;
    return {
      pile,
      total: 25,
    };
  }

  return { pile, total };
}

function buildQuestion(mode) {
  const selectedMode = mode === "mixed" ? (Math.random() > 0.5 ? "count" : "make") : mode;
  const generated = buildMoneyPile();
  return {
    mode: selectedMode,
    pile: generated.pile,
    total: generated.total,
  };
}

function buildChoices(total) {
  const options = new Set([total]);
  while (options.size < 4) {
    const shift = (Math.floor(Math.random() * 8) - 3) * 5;
    const next = Math.max(0, total + shift);
    options.add(next);
  }
  return [...options].sort(() => Math.random() - 0.5);
}

function pileTotal(pile) {
  return DENOMINATIONS.reduce(
    (sum, denomination) => sum + denomination.cents * Number(pile[denomination.key] || 0),
    0
  );
}

export default function MoneyCountingClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [mode, setMode] = useState("mixed");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [question, setQuestion] = useState(() => buildQuestion("mixed"));
  const [playerPile, setPlayerPile] = useState({
    one: 0,
    quarter: 0,
    dime: 0,
    nickel: 0,
    penny: 0,
  });
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    attempts: 0,
    score: 0,
    mode: "mixed",
  });
  const savedRunRef = useRef(false);

  const choices = useMemo(() => buildChoices(question.total), [question.total]);
  const builtTotal = useMemo(() => pileTotal(playerPile), [playerPile]);

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
    const nextQuestion = buildQuestion(nextMode);
    setQuestion(nextQuestion);
    setPlayerPile({ one: 0, quarter: 0, dime: 0, nickel: 0, penny: 0 });
    setRoundIndex(1);
    setScore(0);
    setFeedback("");
    sessionRef.current = {
      courseId: nextCourseId,
      attempts: 0,
      score: 0,
      mode: nextMode,
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

  function advanceRun(correct) {
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = sessionRef.current.score + (correct ? 1 : 0);
    const finished = nextAttempts >= TOTAL_ROUNDS;

    sessionRef.current = {
      courseId,
      attempts: nextAttempts,
      score: nextScore,
      mode,
    };

    setScore(nextScore);

    if (finished) {
      saveSession({
        ...sessionRef.current,
        result: "finished",
      }).catch((error) => {
        setFeedback(error.message || "Could not save that run.");
      });
      return;
    }

    const nextQuestion = buildQuestion(mode);
    setQuestion(nextQuestion);
    setPlayerPile({ one: 0, quarter: 0, dime: 0, nickel: 0, penny: 0 });
    setRoundIndex(nextAttempts + 1);
  }

  function answerCountMode(choice) {
    const correct = choice === question.total;
    setFeedback(correct ? "Correct total." : `Not quite. The money shown is ${formatMoney(question.total)}.`);
    advanceRun(correct);
  }

  function answerMakeMode() {
    const correct = builtTotal === question.total;
    setFeedback(correct ? "You built the right amount." : `Not quite. The target was ${formatMoney(question.total)}.`);
    advanceRun(correct);
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
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
          <button className="btn primary" type="button" onClick={startNewRun}>
            Start New Run
          </button>
        </div>
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>{question.mode === "count" ? "Count The Money" : "Make The Amount"}</h2>
        <div className="pillRow">
          <span className="pill">Round: {Math.min(roundIndex, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}</span>
          <span className="pill">Score: {score}</span>
        </div>

        {question.mode === "count" ? (
          <>
            <p style={{ marginTop: "1rem" }}>How much money is shown?</p>
            <div className="moneyDisplayRow">
              {DENOMINATIONS.map((denomination) =>
                question.pile[denomination.key] > 0 ? (
                  <div key={denomination.key} className="moneyTile">
                    <strong>{denomination.label}</strong>
                    <span>x {question.pile[denomination.key]}</span>
                  </div>
                ) : null
              )}
            </div>
            <div className="choiceGrid">
              {choices.map((choice) => (
                <button
                  key={choice}
                  className="btn bigChoice"
                  type="button"
                  onClick={() => answerCountMode(choice)}
                  disabled={runComplete}
                >
                  {formatMoney(choice)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="list" style={{ marginTop: "1rem" }}>
            <p>Build <strong>{formatMoney(question.total)}</strong>.</p>
            <div className="moneyDisplayRow">
              {DENOMINATIONS.map((denomination) => (
                <div key={denomination.key} className="moneyAdjustCard">
                  <strong>{denomination.label}</strong>
                  <span>Count: {playerPile[denomination.key]}</span>
                  <div className="ctaRow" style={{ marginTop: "0.4rem" }}>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() =>
                        setPlayerPile((current) => ({
                          ...current,
                          [denomination.key]: Math.max(0, current[denomination.key] - 1),
                        }))
                      }
                    >
                      -
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
              ))}
            </div>
            <p><strong>Your total:</strong> {formatMoney(builtTotal)}</p>
            <button className="btn primary" type="button" onClick={answerMakeMode} disabled={runComplete}>
              Check Amount
            </button>
          </div>
        )}
        {feedback ? <p style={{ marginTop: "0.75rem" }}>{feedback}</p> : null}
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
          <p>No saved runs yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>{courseId ? "Class Leaderboard" : "Leaderboard"}</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to compare with classmates.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Finish a run to get it started.</p>
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
