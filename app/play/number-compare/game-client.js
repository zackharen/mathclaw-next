"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function fractionValue() {
  const numerator = Math.floor(Math.random() * 19) - 9 || 1;
  const denominator = Math.floor(Math.random() * 8) + 2;
  const divisor = gcd(numerator, denominator);
  return {
    label: `${numerator / divisor}/${denominator / divisor}`,
    value: numerator / denominator,
  };
}

function squareRootValue() {
  const inside = Math.floor(Math.random() * 90) + 2;
  return {
    label: `√${inside}`,
    value: Math.sqrt(inside),
  };
}

function decimalValue(places) {
  const raw = Math.random() * 40 - 20;
  const value = roundTo(raw, places);
  return { label: value.toFixed(places), value };
}

function integerValue(allowNegative) {
  const value = allowNegative ? Math.floor(Math.random() * 41) - 20 : Math.floor(Math.random() * 21);
  return { label: String(value), value };
}

function buildNumber(settings) {
  const pool = [];
  if (settings.decimals.length > 0) pool.push("decimal");
  if (settings.positiveNegative) pool.push("integer");
  if (settings.fractions) pool.push("fraction");
  if (settings.squareRoots) pool.push("root");
  const choice = pool[Math.floor(Math.random() * pool.length)] || "integer";
  if (choice === "decimal") {
    const places = settings.decimals[Math.floor(Math.random() * settings.decimals.length)];
    return decimalValue(places);
  }
  if (choice === "fraction") return fractionValue();
  if (choice === "root") return squareRootValue();
  return integerValue(settings.positiveNegative);
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function NumberCompareClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [settings, setSettings] = useState({
    decimals: [1, 2],
    positiveNegative: true,
    fractions: true,
    squareRoots: false,
  });
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [pair, setPair] = useState(() => [buildNumber(settings), buildNumber(settings)]);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const sessionRef = useRef({
    score: 0,
    attempts: 0,
    level: 1,
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
      score,
      attempts: sessionRef.current.attempts,
      level,
      courseId,
      settings,
    };
  }, [courseId, level, score, settings]);

  useEffect(() => {
    function handlePageHide() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.attempts <= 0) return;
      saveSession(snapshot, { keepalive: true }).catch(() => {});
      sessionRef.current = {
        ...sessionRef.current,
        score: 0,
        attempts: 0,
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
      courseId: nextCourseId,
      settings,
    };
    setScore(0);
    setLevel(1);
    setFeedback("");
    setCourseId(nextCourseId);
    setPair([buildNumber(settings), buildNumber(settings)]);
  }

  async function startNewRun() {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0) {
      try {
        await saveSession({ ...previousSnapshot, result: "reset" });
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
      courseId,
      settings,
    };
    setScore(0);
    setLevel(1);
    setFeedback("");
    setPair([buildNumber(settings), buildNumber(settings)]);
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
    const values = [pair[0].value, pair[1].value];
    const winner = values[0] === values[1] ? null : values[0] > values[1] ? 0 : 1;
    const correct = winner === null || winner === index;
    const nextLevel = correct ? Math.min(level + 1, 10) : Math.max(level - 1, 1);
    if (correct) setScore((current) => current + 1);
    setLevel(nextLevel);
    setFeedback(correct ? "Nice!" : "Try the next one.");

    sessionRef.current = {
      ...sessionRef.current,
      score: score + (correct ? 1 : 0),
      attempts: sessionRef.current.attempts + 1,
      level: nextLevel,
      courseId,
      settings,
    };
    setPair([buildNumber(settings), buildNumber(settings)]);
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
          <div className="ctaRow">
            {[1, 2, 3, 4].map((place) => (
              <button
                key={place}
                type="button"
                className={`btn ${settings.decimals.includes(place) ? "primary" : ""}`}
                onClick={() => toggleDecimal(place)}
              >
                {place === 1 ? "Tenths" : place === 2 ? "Hundredths" : place === 3 ? "Thousandths" : "Ten-Thousandths"}
              </button>
            ))}
          </div>
          <label className="toggleRow"><input type="checkbox" checked={settings.positiveNegative} onChange={(e) => setSettings((current) => ({ ...current, positiveNegative: e.target.checked }))} /> Positive / negative integers</label>
          <label className="toggleRow"><input type="checkbox" checked={settings.fractions} onChange={(e) => setSettings((current) => ({ ...current, fractions: e.target.checked }))} /> Fractions</label>
          <label className="toggleRow"><input type="checkbox" checked={settings.squareRoots} onChange={(e) => setSettings((current) => ({ ...current, squareRoots: e.target.checked }))} /> Square roots</label>
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
        <h2>Pick The Bigger Number</h2>
        <div className="pillRow">
          <span className="pill">Score: {score}</span>
          <span className="pill">Level: {level}</span>
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Tap the larger value. If both values are exactly equal, either button counts as correct.
        </p>
        <div className="choiceGrid" style={{ marginTop: "1rem" }}>
          {pair.map((entry, index) => (
            <button key={`${entry.label}-${index}`} className="btn bigChoice" type="button" onClick={() => answer(index)}>
              {entry.label}
            </button>
          ))}
        </div>
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
          <p>No saved rounds yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>
          {courseId ? "Class Leaderboard" : "Leaderboard"}
        </h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to see your classmates here.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Play a few rounds to get the leaderboard started.</p>
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
