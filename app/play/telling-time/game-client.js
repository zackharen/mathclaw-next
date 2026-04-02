"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TOTAL_ROUNDS = 10;
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatMinute(minute) {
  return String(minute).padStart(2, "0");
}

function formatTimeLabel(hour, minute) {
  return `${hour}:${formatMinute(minute)}`;
}

function randomQuestionMode(selectedMode) {
  if (selectedMode === "read" || selectedMode === "set") return selectedMode;
  return Math.random() > 0.5 ? "read" : "set";
}

function buildQuestion(selectedMode) {
  const hour = HOUR_OPTIONS[Math.floor(Math.random() * HOUR_OPTIONS.length)];
  const minute = MINUTE_OPTIONS[Math.floor(Math.random() * MINUTE_OPTIONS.length)];
  return {
    mode: randomQuestionMode(selectedMode),
    hour,
    minute,
    label: formatTimeLabel(hour, minute),
  };
}

function buildChoices(question) {
  const choices = new Set([question.label]);

  while (choices.size < 4) {
    const hour = HOUR_OPTIONS[Math.floor(Math.random() * HOUR_OPTIONS.length)];
    const minute = MINUTE_OPTIONS[Math.floor(Math.random() * MINUTE_OPTIONS.length)];
    choices.add(formatTimeLabel(hour, minute));
  }

  return [...choices].sort(() => Math.random() - 0.5);
}

function ClockFace({ hour, minute, label }) {
  const minuteRotation = minute * 6;
  const hourRotation = ((hour % 12) + minute / 60) * 30;

  return (
    <div className="timeClockWrap" aria-label={label}>
      <div className="timeClock">
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className="timeClockNumber"
            style={{
              transform: `rotate(${index * 30}deg) translateY(-4.8rem) rotate(${-index * 30}deg)`,
            }}
          >
            {index + 1}
          </span>
        ))}
        <div className="timeClockHand hourHand" style={{ transform: `rotate(${hourRotation}deg)` }} />
        <div className="timeClockHand minuteHand" style={{ transform: `rotate(${minuteRotation}deg)` }} />
        <div className="timeClockCenter" />
      </div>
    </div>
  );
}

export default function TellingTimeClient({
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
  const [selectedHour, setSelectedHour] = useState(question.hour);
  const [selectedMinute, setSelectedMinute] = useState(question.minute);
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

  const choices = useMemo(() => buildChoices(question), [question]);

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=telling_time&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: "telling_time",
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
    setSelectedHour(nextQuestion.hour);
    setSelectedMinute(nextQuestion.minute);
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

  function advanceRun(correct, nextMode = mode) {
    const nextAttempts = sessionRef.current.attempts + 1;
    const nextScore = sessionRef.current.score + (correct ? 1 : 0);
    const finished = nextAttempts >= TOTAL_ROUNDS;

    sessionRef.current = {
      courseId,
      attempts: nextAttempts,
      score: nextScore,
      mode: nextMode,
    };

    setScore(nextScore);

    if (finished) {
      setFeedback(correct ? "Run finished strong." : "Run finished. Start another one.");
      saveSession({
        ...sessionRef.current,
        result: "finished",
      }).catch((error) => {
        setFeedback(error.message || "Could not save that run.");
      });
      return;
    }

    const nextQuestion = buildQuestion(nextMode);
    setQuestion(nextQuestion);
    setSelectedHour(nextQuestion.hour);
    setSelectedMinute(nextQuestion.minute);
    setRoundIndex(nextAttempts + 1);
  }

  function answerReadMode(choice) {
    const correct = choice === question.label;
    setFeedback(correct ? "Nice read." : `Not quite. That clock shows ${question.label}.`);
    advanceRun(correct);
  }

  function answerSetMode() {
    const guess = formatTimeLabel(selectedHour, selectedMinute);
    const correct = guess === question.label;
    setFeedback(correct ? "Clock matched." : `Not quite. The target time was ${question.label}.`);
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
              <option value="read">Read The Clock</option>
              <option value="set">Set The Clock</option>
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
        <h2>{question.mode === "read" ? "Read The Clock" : "Set The Clock"}</h2>
        <div className="pillRow">
          <span className="pill">Round: {Math.min(roundIndex, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}</span>
          <span className="pill">Score: {score}</span>
        </div>
        <ClockFace
          hour={question.mode === "read" ? question.hour : selectedHour}
          minute={question.mode === "read" ? question.minute : selectedMinute}
          label={question.mode === "read" ? question.label : `Current setting ${formatTimeLabel(selectedHour, selectedMinute)}`}
        />
        {question.mode === "read" ? (
          <div className="choiceGrid">
            {choices.map((choice) => (
              <button
                key={choice}
                className="btn bigChoice"
                type="button"
                onClick={() => answerReadMode(choice)}
                disabled={runComplete}
              >
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <div className="list" style={{ marginTop: "1rem" }}>
            <p>Set the clock to <strong>{question.label}</strong>.</p>
            <div className="timeSetControls">
              <label>
                Hour
                <select
                  className="input"
                  value={selectedHour}
                  onChange={(event) => setSelectedHour(Number(event.target.value))}
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minute
                <select
                  className="input"
                  value={selectedMinute}
                  onChange={(event) => setSelectedMinute(Number(event.target.value))}
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={minute}>
                      {formatMinute(minute)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn primary" type="button" onClick={answerSetMode} disabled={runComplete}>
              Check Clock
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
