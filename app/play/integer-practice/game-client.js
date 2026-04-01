"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [multipleChoice, setMultipleChoice] = useState(true);
  const [choiceCount, setChoiceCount] = useState(4);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [feedback, setFeedback] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [problem, setProblem] = useState(() => makeProblem(1, false));
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);

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

  async function saveAttempt(correct, nextLevel, nextStreak) {
    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "integer_practice",
        score: score + (correct ? 1 : 0),
        result: correct ? "correct" : "incorrect",
        courseId: courseId || null,
        metadata: {
          skillRating: nextLevel,
          streak: nextStreak,
          twoDigit,
          multipleChoice,
          choiceCount,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not save score.");
    }
    setSavedStats((current) => ({
      ...current,
      ...payload.stats,
    }));
    await loadLeaderboard(courseId);
  }

  async function submitAnswer(value) {
    const guess = Number(value);
    const correct = guess === problem.answer;
    const nextStreak = correct ? streak + 1 : 0;
    const nextLevel = correct ? Math.min(level + (nextStreak >= 3 ? 1 : 0), 10) : Math.max(level - 1, 1);
    setFeedback(correct ? "Correct!" : `Not quite. The answer was ${problem.answer}.`);
    setStreak(nextStreak);
    setLevel(nextLevel);
    if (correct) setScore((current) => current + 1);
    setProblem(makeProblem(nextLevel, twoDigit));
    setAnswerText("");

    try {
      await saveAttempt(correct, nextLevel, nextStreak);
    } catch (error) {
      setFeedback(error.message || "Could not save score.");
    }
  }

  function handleTwoDigitChange(checked) {
    setTwoDigit(checked);
    setFeedback("");
    setProblem(makeProblem(level, checked));
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
          <label className="toggleRow"><input type="checkbox" checked={twoDigit} onChange={(e) => handleTwoDigitChange(e.target.checked)} /> Two-digit numbers</label>
          <label className="toggleRow"><input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} /> Multiple choice</label>
          {multipleChoice ? (
            <label>
              Answer choices
              <select className="input" value={choiceCount} onChange={(e) => setChoiceCount(Number(e.target.value))}>
                {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            Class context
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">No class selected</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="card" style={{ background: "#fff" }}>
        <h2>Practice</h2>
        <div className="pillRow">
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Level: {level}</span>
        </div>
        <div className="mathPrompt">
          {problem.a} {problem.op} ({problem.b}) = ?
        </div>
        {multipleChoice ? (
          <div className="choiceGrid">
            {options.map((option) => (
              <button key={option} className="btn" type="button" onClick={() => submitAnswer(option)}>
                {option}
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
