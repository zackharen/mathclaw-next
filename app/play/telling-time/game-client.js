"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildTellingTimeChoices,
  buildTellingTimeQuestion,
} from "@/lib/question-engine/telling-time";
import {
  GameResults,
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const TOTAL_ROUNDS = 10;
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);
const READ_FILL_MINUTE_OPTIONS = MINUTE_OPTIONS;
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const CLOCK_FACE_NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CLOCK_FACE_ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
const HOUR_TIP_OFFSET = -4.8;
const MINUTE_TIP_OFFSET = -6.6;

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatMinute(minute) {
  return String(minute).padStart(2, "0");
}

function formatTimeLabel(hour, minute) {
  return `${hour}:${formatMinute(minute)}`;
}

function angleFromPointer(event, rect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (degrees < 0) degrees += 360;
  return degrees;
}

function hourFromAngle(angle) {
  const normalized = Math.round(angle / 30) % 12;
  return normalized === 0 ? 12 : normalized;
}

function minuteFromAngle(angle) {
  return (Math.round(angle / 30) % 12) * 5;
}

function stepHour(hour, delta) {
  const normalized = (((hour - 1 + delta) % 12) + 12) % 12;
  return normalized + 1;
}

function stepMinute(minute, delta) {
  const normalized = (((minute + delta) % 60) + 60) % 60;
  return normalized;
}

function ClockFace({
  hour,
  minute,
  label,
  faceStyle = "numbers",
  interactive = false,
  activeHand = "minute",
  onClockPointerDown,
  onHandPointerDown,
}) {
  const minuteRotation = minute * 6;
  const hourRotation = ((hour % 12) + minute / 60) * 30;
  const markers = faceStyle === "roman" ? CLOCK_FACE_ROMAN : CLOCK_FACE_NUMBERS;

  return (
    <div className="timeClockWrap" aria-label={label}>
      <div
        className={`timeClock ${interactive ? "isInteractive" : ""} ${interactive ? `active-${activeHand}` : ""}`}
        onPointerDown={interactive ? onClockPointerDown : undefined}
      >
        {Array.from({ length: 12 }, (_, index) =>
          faceStyle === "ticks" ? (
            <span
              key={index}
              className="timeClockTickWrap"
              style={{ transform: `rotate(${index * 30}deg)` }}
            >
              <span className="timeClockTick" />
            </span>
          ) : (
            <span
              key={index}
              className="timeClockNumber"
              style={{
                transform: `rotate(${index * 30}deg) translateY(-6rem) rotate(${-index * 30}deg)`,
              }}
            >
              {markers[index]}
            </span>
          )
        )}
        <div className="timeClockHand hourHand" style={{ transform: `rotate(${hourRotation}deg)` }} />
        <div className="timeClockHand minuteHand" style={{ transform: `rotate(${minuteRotation}deg)` }} />
        {interactive ? (
          <>
            <button
              type="button"
              className="timeClockHandTip hourTip"
              style={{ transform: `rotate(${hourRotation}deg) translateY(${HOUR_TIP_OFFSET}rem)` }}
              onPointerDown={(event) => onHandPointerDown?.(event, "hour")}
              aria-label="Move the hour hand"
            />
            <button
              type="button"
              className="timeClockHandTip minuteTip"
              style={{ transform: `rotate(${minuteRotation}deg) translateY(${MINUTE_TIP_OFFSET}rem)` }}
              onPointerDown={(event) => onHandPointerDown?.(event, "minute")}
              aria-label="Move the minute hand"
            />
          </>
        ) : null}
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
  initialQuestion,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [mode, setMode] = useState("mixed");
  const [faceStyle, setFaceStyle] = useState("numbers");
  const [readAnswerMode, setReadAnswerMode] = useState("multiple_choice");
  const [choiceCount, setChoiceCount] = useState(4);
  const [activeSetHand, setActiveSetHand] = useState("minute");
  const [roundIndex, setRoundIndex] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [question, setQuestion] = useState(initialQuestion);
  const [selectedHour, setSelectedHour] = useState(initialQuestion.setting.hour);
  const [selectedMinute, setSelectedMinute] = useState(initialQuestion.setting.minute);
  const [readAnswerHour, setReadAnswerHour] = useState(initialQuestion.hour);
  const [readAnswerMinute, setReadAnswerMinute] = useState(initialQuestion.minute);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const draggingHandRef = useRef(null);
  const clockFaceRef = useRef(null);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    attempts: 0,
    score: 0,
    mode: "mixed",
  });
  const savedRunRef = useRef(false);

  const choices = question.choices;
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";

  const updateClockFromPointer = useCallback((event, handToMove) => {
    const clockElement = clockFaceRef.current;
    if (!clockElement) return;
    const angle = angleFromPointer(event, clockElement.getBoundingClientRect());

    if (handToMove === "hour") {
      setSelectedHour(hourFromAngle(angle));
      return;
    }

    setSelectedMinute(minuteFromAngle(angle));
  }, []);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!draggingHandRef.current) return;
      updateClockFromPointer(event, draggingHandRef.current);
    }

    function handlePointerUp() {
      draggingHandRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [updateClockFromPointer]);

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

  function resetRun(nextMode = mode, nextCourseId = courseId, nextReadAnswerMode = readAnswerMode) {
    savedRunRef.current = false;
    const nextQuestion = buildTellingTimeQuestion(nextMode, nextReadAnswerMode, choiceCount);
    const nextSetting = nextQuestion.setting;
    setQuestion(nextQuestion);
    setSelectedHour(nextSetting.hour);
    setSelectedMinute(nextSetting.minute);
    setReadAnswerHour(nextQuestion.hour);
    setReadAnswerMinute(nextQuestion.minute ?? READ_FILL_MINUTE_OPTIONS[0]);
    setRoundIndex(1);
    setScore(0);
    setFeedback("");
    setFeedbackTone("");
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

    resetRun(mode, courseId, readAnswerMode);
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
    resetRun(mode, nextCourseId, readAnswerMode);
  }

  async function advanceRun(correct, nextMode = mode) {
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
      setFeedbackTone(correct ? "correct" : "miss");
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

    const nextQuestion = buildTellingTimeQuestion(nextMode, readAnswerMode, choiceCount);
    const nextSetting = nextQuestion.setting;
    setQuestion(nextQuestion);
    setSelectedHour(nextSetting.hour);
    setSelectedMinute(nextSetting.minute);
    setReadAnswerHour(nextQuestion.hour);
    setReadAnswerMinute(nextQuestion.minute ?? READ_FILL_MINUTE_OPTIONS[0]);
    setRoundIndex(nextAttempts + 1);
  }

  function answerReadMode(choice) {
    const correct = choice === question.label;
    setFeedback(correct ? "Nice read." : `Not quite. That clock shows ${question.label}.`);
    setFeedbackTone(correct ? "correct" : "miss");
    advanceRun(correct);
  }

  function answerReadFillMode() {
    const guess = formatTimeLabel(readAnswerHour, readAnswerMinute);
    const correct = guess === question.label;
    setFeedback(correct ? "Nice read." : `Not quite. That clock shows ${question.label}.`);
    setFeedbackTone(correct ? "correct" : "miss");
    advanceRun(correct);
  }

  function answerSetMode() {
    const guess = formatTimeLabel(selectedHour, selectedMinute);
    const correct = guess === question.label;
    setFeedback(correct ? "Clock matched." : `Not quite. The target time was ${question.label}.`);
    setFeedbackTone(correct ? "correct" : "miss");
    advanceRun(correct);
  }

  const runComplete = sessionRef.current.attempts >= TOTAL_ROUNDS;
  const attempts = sessionRef.current.attempts;
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
  const resultTitle =
    score >= 9 ? "Right on time." : score >= 7 ? "Strong clock work." : "Good practice — try another round.";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        {runComplete ? (
          <GameResults
            title={resultTitle}
            message="Your clock run is saved with its mode and class context. Replay the same setup or change the face and answer style for a fresh challenge."
            stats={[
              { label: "Correct", value: `${score}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: `${accuracy}%` },
              { label: "Mode", value: mode === "mixed" ? "Mixed" : mode === "read" ? "Read" : "Set" },
            ]}
            actionLabel={isSaving ? "Saving Run…" : "Play Again"}
            onAction={startNewRun}
            actionDisabled={isSaving}
            statusMessage={
              isSaving
                ? "Saving your clock run and refreshing the leaderboard…"
                : feedbackTone === "miss" && feedback.includes("save")
                  ? feedback
                  : "Run saved."
            }
          />
        ) : (
          <GameStage
            eyebrow={`Round ${Math.min(roundIndex, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS}`}
            title={question.mode === "read" ? "Read The Clock" : "Set The Clock"}
            status={isSaving ? "Saving run" : "Run in progress"}
            progress={(attempts / TOTAL_ROUNDS) * 100}
            progressLabel={`${attempts} of ${TOTAL_ROUNDS} answered`}
            stats={[
              { label: "Score", value: score },
              { label: "Round", value: `${Math.min(roundIndex, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}` },
              { label: "Accuracy", value: attempts ? `${accuracy}%` : "—" },
            ]}
          >
            <div className="gameQuestion timeGameQuestion">
              <ClockFace
                hour={question.mode === "read" ? question.hour : selectedHour}
                minute={question.mode === "read" ? question.minute : selectedMinute}
                label={question.mode === "read" ? question.label : `Current setting ${formatTimeLabel(selectedHour, selectedMinute)}`}
                faceStyle={faceStyle}
                interactive={question.mode === "set"}
                activeHand={activeSetHand}
                onClockPointerDown={(event) => {
                  clockFaceRef.current = event.currentTarget;
                  if (question.mode !== "set") return;
                  updateClockFromPointer(event, activeSetHand);
                  draggingHandRef.current = activeSetHand;
                }}
                onHandPointerDown={(event, hand) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clockFaceRef.current = event.currentTarget.closest(".timeClock");
                  setActiveSetHand(hand);
                  updateClockFromPointer(event, hand);
                  draggingHandRef.current = hand;
                }}
              />
              {question.mode === "read" ? (
                readAnswerMode === "fill" ? (
                  <div className="list timeCenteredControls">
                    <p>Write the time shown on the clock.</p>
                    <div className="timeAnswerRow">
                      <select
                        className="input"
                        aria-label="Answer hour"
                        value={readAnswerHour}
                        onChange={(event) => setReadAnswerHour(Number(event.target.value))}
                      >
                        {HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={hour}>{hour}</option>
                        ))}
                      </select>
                      <span className="timeAnswerColon">:</span>
                      <select
                        className="input"
                        aria-label="Answer minute"
                        value={readAnswerMinute}
                        onChange={(event) => setReadAnswerMinute(Number(event.target.value))}
                      >
                        {READ_FILL_MINUTE_OPTIONS.map((minute) => (
                          <option key={minute} value={minute}>{formatMinute(minute)}</option>
                        ))}
                      </select>
                    </div>
                    <button className="btn primary" type="button" onClick={answerReadFillMode}>
                      Check Time
                    </button>
                  </div>
                ) : (
                  <div className="gameReviewChoices">
                    {choices.map((choice) => (
                      <button
                        key={choice}
                        className="gameReviewChoice"
                        type="button"
                        onClick={() => answerReadMode(choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="timeSetControls">
                  <p className="gameQuestionPrompt">
                    Set the clock to <strong>{question.label}</strong>.
                  </p>
                  <div className="gameSetupChoiceRow">
                    <button
                      className={`btn ${activeSetHand === "hour" ? "primary" : "ghost"}`}
                      type="button"
                      onClick={() => setActiveSetHand("hour")}
                    >
                      Move Hour Hand
                    </button>
                    <button
                      className={`btn ${activeSetHand === "minute" ? "primary" : "ghost"}`}
                      type="button"
                      onClick={() => setActiveSetHand("minute")}
                    >
                      Move Minute Hand
                    </button>
                  </div>
                  <div className="pillRow timeCenteredRow">
                    <span className="pill">Target: {question.label}</span>
                    <span className="pill">Your Clock: {formatTimeLabel(selectedHour, selectedMinute)}</span>
                  </div>
                  <div className="timeStepControls">
                    <button className="btn ghost" type="button" onClick={() => setSelectedHour((current) => stepHour(current, -1))}>
                      Hour −1
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setSelectedHour((current) => stepHour(current, 1))}>
                      Hour +1
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setSelectedMinute((current) => stepMinute(current, -5))}>
                      Minute −5
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setSelectedMinute((current) => stepMinute(current, 5))}>
                      Minute +5
                    </button>
                  </div>
                  <p className="timeInstruction">
                    Drag the hand tips, or tap the clock while <strong>{activeSetHand === "hour" ? "Hour Hand" : "Minute Hand"}</strong> is selected.
                  </p>
                  <button className="btn primary" type="button" onClick={answerSetMode}>
                    Check Clock
                  </button>
                </div>
              )}
              <p className={`gameFeedback ${feedbackTone === "miss" ? "is-miss" : ""}`}>
                {feedback || "Read the face carefully and submit when you are ready."}
              </p>
            </div>
          </GameStage>
        )}
      </div>

      <div className="gameWorkspaceRail">
        <GameSidePanel eyebrow="Setup" title="Choose the clock">
          <p className="gameSetupSummary">
            {(mode === "mixed" ? "Mixed mode" : mode === "read" ? "Read the clock" : "Set the clock")} · {courseSummary}
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
                <option value="read">Read The Clock</option>
                <option value="set">Set The Clock</option>
              </select>
            </label>
            <label>
              Read answers
              <select
                className="input"
                value={readAnswerMode}
                onChange={(event) => {
                  const nextReadAnswerMode = event.target.value;
                  setReadAnswerMode(nextReadAnswerMode);
                  resetRun(mode, courseId, nextReadAnswerMode);
                }}
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="fill">Fill In</option>
              </select>
            </label>
            {readAnswerMode === "multiple_choice" ? (
              <label>
                Multiple choice answers
                <select
                  className="input"
                value={choiceCount}
                  onChange={(event) => {
                    const nextChoiceCount = Number(event.target.value);
                    setChoiceCount(nextChoiceCount);
                    setQuestion((current) => ({
                      ...current,
                      choices: buildTellingTimeChoices(current, nextChoiceCount),
                    }));
                  }}
                >
                  {[2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Clock face
              <select
                className="input"
                value={faceStyle}
                onChange={(event) => setFaceStyle(event.target.value)}
              >
                <option value="numbers">Numbers</option>
                <option value="ticks">Tick Marks</option>
                <option value="roman">Roman Numerals</option>
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
