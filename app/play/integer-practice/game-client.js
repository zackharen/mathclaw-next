"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function makeProblem(level, twoDigit) {
  const limit = twoDigit ? Math.min(99, Math.max(10, 9 + level * 6)) : 9;
  const a = randomInt(limit * 2 + 1) - limit;
  const b = randomInt(limit * 2 + 1) - limit;
  const op = Math.random() > 0.5 ? "+" : "-";
  const answer = op === "+" ? a + b : a - b;
  return { a, b, op, answer };
}

function choices(answer, count) {
  const set = new Set([answer]);
  while (set.size < count) {
    const offset = Math.floor(Math.random() * 13) - 6 || 1;
    set.add(answer + offset);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatInteger(value) {
  return value < 0 ? `(${value})` : String(value);
}

export default function IntegerPracticeClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [twoDigit, setTwoDigit] = useState(false);
  const [choiceCount, setChoiceCount] = useState(4);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [feedback, setFeedback] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [problem, setProblem] = useState(() => makeProblem(1, false));
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const sessionRef = useRef({
    score: 0,
    attempts: 0,
    level: 1,
    streak: 0,
    courseId: initialCourseId || "",
    twoDigit: false,
    multipleChoice: true,
    choiceCount: 4,
  });

  const multipleChoice = choiceCount > 0;

  const options = useMemo(
    () => (multipleChoice ? choices(problem.answer, choiceCount) : []),
    [multipleChoice, problem, choiceCount]
  );

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=integer_practice&courseId=${encodeURIComponent(nextCourseId)}`
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
        gameSlug: "integer_practice",
        score: sessionSnapshot.score,
        result: sessionSnapshot.score > 0 ? "correct" : "incorrect",
        courseId: sessionSnapshot.courseId || null,
        metadata: {
          skillRating: sessionSnapshot.level,
          streak: sessionSnapshot.streak,
          attempts: sessionSnapshot.attempts,
          twoDigit: sessionSnapshot.twoDigit,
          multipleChoice: sessionSnapshot.multipleChoice,
          choiceCount: sessionSnapshot.choiceCount,
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
      score,
      level,
      streak,
      courseId,
      twoDigit,
      multipleChoice,
      choiceCount,
    };
  }, [choiceCount, courseId, level, multipleChoice, score, streak, twoDigit]);

  useEffect(() => {
    function handlePageHide() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.attempts <= 0) return;
      saveSession(snapshot, { keepalive: true }).catch(() => {});
      sessionRef.current = {
        ...sessionRef.current,
        score: 0,
        attempts: 0,
        streak: 0,
      };
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  async function handleCourseChange(nextCourseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0) {
      try {
        await saveSession(previousSnapshot);
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
      streak: 0,
      courseId: nextCourseId,
    };
    setScore(0);
    setLevel(1);
    setStreak(0);
    setFeedback("");
    setCourseId(nextCourseId);
    setProblem(makeProblem(1, twoDigit));
  }

  async function startNewRun() {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0) {
      try {
        await saveSession(previousSnapshot);
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
      streak: 0,
      courseId,
      twoDigit,
      multipleChoice,
      choiceCount,
    };
    setScore(0);
    setLevel(1);
    setStreak(0);
    setFeedback("");
    setAnswerText("");
    setProblem(makeProblem(1, twoDigit));
  }

  async function submitAnswer(value) {
    const guess = Number(value);
    const correct = guess === problem.answer;
    const nextStreak = correct ? streak + 1 : 0;
    const nextLevel = correct ? Math.min(level + (nextStreak >= 3 ? 1 : 0), 10) : Math.max(level - 1, 1);
    setFeedback(correct ? "Correct!" : `Not quite. The answer was ${formatInteger(problem.answer)}.`);
    setStreak(nextStreak);
    setLevel(nextLevel);
    if (correct) setScore((current) => current + 1);
    setProblem(makeProblem(nextLevel, twoDigit));
    setAnswerText("");

    sessionRef.current = {
      ...sessionRef.current,
      score: score + (correct ? 1 : 0),
      attempts: sessionRef.current.attempts + 1,
      level: nextLevel,
      streak: nextStreak,
      courseId,
      twoDigit,
      multipleChoice,
      choiceCount,
    };
  }

  function handleTwoDigitChange(nextTwoDigit) {
    setTwoDigit(nextTwoDigit);
    setFeedback("");
    setProblem(makeProblem(level, nextTwoDigit));
  }

  function handleChoiceCountChange(nextChoiceCount) {
    setChoiceCount(nextChoiceCount);
    setFeedback("");
    setAnswerText("");
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
          <div>
            <p style={{ fontWeight: 700, marginBottom: "0.45rem" }}>Number Size</p>
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
              <button
                className={`btn ${twoDigit ? "" : "primary"}`}
                type="button"
                onClick={() => handleTwoDigitChange(false)}
              >
                Single Digit
              </button>
              <button
                className={`btn ${twoDigit ? "primary" : ""}`}
                type="button"
                onClick={() => handleTwoDigitChange(true)}
              >
                Double Digit
              </button>
            </div>
          </div>
          <div>
            <p style={{ fontWeight: 700, marginBottom: "0.45rem" }}>Answer Mode</p>
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
              {[0, 2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  className={`btn ${choiceCount === count ? "primary" : ""}`}
                  type="button"
                  onClick={() => handleChoiceCountChange(count)}
                >
                  {count === 0 ? "None" : `${count} MP`}
                </button>
              ))}
            </div>
          </div>
          <label>
            Class context
            <select className="input" value={courseId} onChange={(e) => handleCourseChange(e.target.value)}>
              <option value="">No class selected</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <button className="btn primary" type="button" onClick={startNewRun}>
            Start New Run
          </button>
        </div>
      </section>
      <section className="card" style={{ background: "#fff" }}>
        <h2>Practice</h2>
        <div className="pillRow">
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Level: {level}</span>
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Keep a streak going to raise the level. Start a new run any time if you want a clean scoreboard entry.
        </p>
        <div className="mathPrompt">
          {formatInteger(problem.a)} {problem.op} {formatInteger(problem.b)} = ?
        </div>
        {multipleChoice ? (
          <div className="choiceGrid">
            {options.map((option) => (
              <button key={option} className="btn" type="button" onClick={() => submitAnswer(option)}>
                {formatInteger(option)}
              </button>
            ))}
          </div>
        ) : (
          <div className="ctaRow">
            <input className="input" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            <button className="btn primary" type="button" onClick={() => submitAnswer(answerText)}>
              Submit
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
          <p>No saved practice yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>
          {courseId ? "Class Leaderboard" : "Leaderboard"}
        </h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to see your classmates here.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Answer a few problems to get the leaderboard started.</p>
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
