"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ROUND_COUNT = 15;
const CHARACTER_NAME = "Nova";
const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", bonus: 8 },
  { value: "medium", label: "Medium", bonus: 12 },
  { value: "hard", label: "Hard", bonus: 18 },
];
const WORD_BANK = {
  easy: [
    "cat",
    "sun",
    "map",
    "book",
    "math",
    "glow",
    "planet",
    "rocket",
    "school",
    "pencil",
    "number",
    "garden",
    "market",
    "travel",
    "signal",
    "bright",
    "puzzle",
    "helper",
  ],
  medium: [
    "galaxy",
    "typing",
    "starlight",
    "mission",
    "velocity",
    "pattern",
    "teacher",
    "student",
    "problem",
    "fraction",
    "journey",
    "booster",
    "careful",
    "lantern",
    "science",
    "capture",
  ],
  hard: [
    "constellation",
    "navigation",
    "acceleration",
    "coordinate",
    "curriculum",
    "observation",
    "trailblazer",
    "communication",
    "mathematical",
    "interstellar",
    "adventure",
    "celebration",
  ],
};

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function randomWord(difficulty, previousWord = "") {
  const pool = WORD_BANK[difficulty] || WORD_BANK.medium;
  let nextWord = pool[Math.floor(Math.random() * pool.length)];

  if (pool.length > 1) {
    while (nextWord === previousWord) {
      nextWord = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  return nextWord;
}

function buildPrompt(difficulty, previousWord = "") {
  return {
    word: randomWord(difficulty, previousWord),
  };
}

function calculateScore(snapshot) {
  if (!snapshot) return 0;
  const difficultyBonus =
    DIFFICULTY_OPTIONS.find((option) => option.value === snapshot.difficulty)?.bonus || 10;
  const correctWords = Number(snapshot.correctWords || 0);
  const bestStreak = Number(snapshot.bestStreak || 0);
  const accuracy = Number(snapshot.accuracy || 0);
  const timePenalty = Math.round(Number(snapshot.elapsedSeconds || 0) / 2);

  if (snapshot.result === "finished") {
    return Math.max(
      0,
      correctWords * 18 + bestStreak * 10 + Math.round(accuracy * 40) + difficultyBonus * 6 - timePenalty
    );
  }

  return correctWords * 12 + bestStreak * 8 + difficultyBonus * 2;
}

export default function CometTypingClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [difficulty, setDifficulty] = useState("medium");
  const [roundIndex, setRoundIndex] = useState(1);
  const [prompt, setPrompt] = useState(() => buildPrompt("medium"));
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState(`Help ${CHARACTER_NAME} deliver every word packet.`);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runState, setRunState] = useState("active");
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    difficulty: "medium",
    attempts: 0,
    correctWords: 0,
    bestStreak: 0,
    elapsedSeconds: 0,
    accuracy: 0,
    result: "active",
  });

  const accuracy = useMemo(() => {
    const attempts = sessionRef.current.attempts || 0;
    if (attempts <= 0) return 0;
    return correctWords / attempts;
  }, [correctWords, roundIndex]);
  const progressPercent = Math.round(((roundIndex - 1) / ROUND_COUNT) * 100);
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=comet_typing&courseId=${encodeURIComponent(nextCourseId)}`
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
      const sessionScore = calculateScore(snapshot);

      const response = await fetch("/api/play/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: options.keepalive === true,
        body: JSON.stringify({
          gameSlug: "comet_typing",
          score: sessionScore,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            attempts: snapshot.attempts,
            correctWords: snapshot.correctWords,
            bestStreak: snapshot.bestStreak,
            elapsedSeconds: snapshot.elapsedSeconds,
            difficulty: snapshot.difficulty,
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
    if (runState !== "active") {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }

    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => {
        const nextValue = current + 1;
        sessionRef.current = {
          ...sessionRef.current,
          elapsedSeconds: nextValue,
        };
        return nextValue;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [runState]);

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
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [prompt.word, runState]);

  function resetRun(nextDifficulty = difficulty, nextCourseId = courseId) {
    savedRunRef.current = false;
    const nextPrompt = buildPrompt(nextDifficulty);
    setDifficulty(nextDifficulty);
    setRoundIndex(1);
    setPrompt(nextPrompt);
    setEntry("");
    setFeedback(`Help ${CHARACTER_NAME} deliver every word packet.`);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectWords(0);
    setElapsedSeconds(0);
    setRunState("active");
    sessionRef.current = {
      courseId: nextCourseId,
      difficulty: nextDifficulty,
      attempts: 0,
      correctWords: 0,
      bestStreak: 0,
      elapsedSeconds: 0,
      accuracy: 0,
      result: "active",
    };
  }

  async function startNewRun(resultToSave = "reset", nextDifficulty = difficulty, nextCourseId = courseId) {
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

    resetRun(nextDifficulty, nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startNewRun("switched_class", difficulty, nextCourseId);
  }

  function updateSessionSnapshot(nextAttempts, nextCorrectWords, nextBestStreak, result = "active") {
    const nextAccuracy = nextAttempts > 0 ? nextCorrectWords / nextAttempts : 0;
    sessionRef.current = {
      courseId,
      difficulty,
      attempts: nextAttempts,
      correctWords: nextCorrectWords,
      bestStreak: nextBestStreak,
      elapsedSeconds,
      accuracy: nextAccuracy,
      result,
    };
    setScore(calculateScore(sessionRef.current));
  }

  async function submitWord(event) {
    event.preventDefault();
    if (runState !== "active") return;

    const cleanedEntry = entry.trim();
    if (!cleanedEntry) {
      setFeedback(`Type the word before sending ${CHARACTER_NAME} onward.`);
      return;
    }

    const correct = cleanedEntry.toLowerCase() === prompt.word.toLowerCase();
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextCorrectWords = correct ? correctWords + 1 : correctWords;
    const nextStreak = correct ? streak + 1 : 0;
    const nextBestStreak = Math.max(bestStreak, nextStreak);
    const finished = nextAttempts >= ROUND_COUNT;

    setCorrectWords(nextCorrectWords);
    setStreak(nextStreak);
    setBestStreak(nextBestStreak);

    if (correct) {
      setFeedback(`${CHARACTER_NAME} blasted forward. Clean delivery.`);
    } else {
      setFeedback(`Close, but ${CHARACTER_NAME} needed "${prompt.word}".`);
    }

    updateSessionSnapshot(
      nextAttempts,
      nextCorrectWords,
      nextBestStreak,
      finished ? "finished" : "active"
    );

    if (finished) {
      setRunState("finished");
      try {
        await saveSession({
          ...sessionRef.current,
          result: "finished",
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that run.");
      }
      return;
    }

    setRoundIndex(nextAttempts + 1);
    setPrompt(buildPrompt(difficulty, prompt.word));
    setEntry("");
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Flight Controls</h2>
              <p>
                {DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label || "Medium"} route · {courseSummary}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <label>
              Route difficulty
              <select
                className="input"
                value={difficulty}
                onChange={async (event) => {
                  const nextDifficulty = event.target.value;
                  await startNewRun("switched_difficulty", nextDifficulty, courseId);
                }}
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
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
            <button className="btn primary" type="button" onClick={() => startNewRun("reset")}>
              Start New Run
            </button>
          </div>
        </details>
      </section>

      <section className="card cometTypingCard" style={{ background: "#fff" }}>
        <h2>{CHARACTER_NAME}'s Star Lane</h2>
        <div className="pillRow" style={{ marginTop: "0.75rem" }}>
          <span className="pill">Round: {Math.min(roundIndex, ROUND_COUNT)}/{ROUND_COUNT}</span>
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Accuracy: {Math.round(accuracy * 100)}%</span>
          <span className="pill">Time: {elapsedSeconds}s</span>
        </div>

        <div className="cometLane">
          <div className="cometLaneTrack" />
          <div className="cometLaneProgress" style={{ width: `${progressPercent}%` }} />
          <div className="cometRider" style={{ left: `calc(${progressPercent}% - 1.2rem)` }}>
            <span className="cometAvatar">☄</span>
            <strong>{CHARACTER_NAME}</strong>
          </div>
          <div className="cometFinish">Mailbox</div>
        </div>

        <div className="cometPromptCard">
          <p className="cometPromptLabel">Type this word packet</p>
          <div className="cometPromptWord">{prompt.word}</div>
          <p className="cometPromptHint">Stay sharp and keep the streak alive.</p>
        </div>

        <form className="list" style={{ marginTop: "1rem" }} onSubmit={submitWord}>
          <input
            ref={inputRef}
            className="input cometTypingInput"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            placeholder="Type the word exactly"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            disabled={runState !== "active"}
          />
          <div className="ctaRow">
            <button className="btn primary" type="submit" disabled={runState !== "active"}>
              Send Word
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setEntry("")}
              disabled={runState !== "active" || entry.length === 0}
            >
              Clear
            </button>
          </div>
        </form>

        {feedback ? (
          <div className={`minesweeperStatusBanner ${runState === "finished" ? "won" : "active"}`} style={{ marginTop: "0.9rem" }}>
            <strong>{feedback}</strong>
          </div>
        ) : null}
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
          {!courseId ? <p>Select a class to compare typing runs with classmates.</p> : null}
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
