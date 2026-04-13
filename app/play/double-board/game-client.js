"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DOUBLE_BOARD_NUMBER_MODES,
  formatBoardLocation,
} from "@/lib/question-engine/double-board";

function courseTitle(courses, courseId) {
  if (!courseId) return "Practice room";
  return courses.find((course) => course.id === courseId)?.title || "Selected class";
}

function boardQuestions(board) {
  return Array.isArray(board) ? board : [];
}

function normalizeBoardRows(board) {
  if (!Array.isArray(board)) return [];
  return board.map((row) => (Array.isArray(row) ? row : []));
}

function normalizeSessionPayload(session) {
  if (!session || typeof session !== "object") return null;

  const boards = session.boards && typeof session.boards === "object" ? session.boards : {};

  return {
    ...session,
    boards: {
      A: normalizeBoardRows(boards.A),
      B: normalizeBoardRows(boards.B),
    },
    leaderboard: Array.isArray(session.leaderboard) ? session.leaderboard : [],
    reviewItems: Array.isArray(session.reviewItems) ? session.reviewItems : [],
    answerMode: session.answerMode === "multiple_choice" ? "multiple_choice" : "typed",
  };
}

function statusTone(status) {
  if (status === "live") return "live";
  if (status === "ended") return "ended";
  return "waiting";
}

function tileTooltip(question) {
  const parts = [formatBoardLocation(question.boardKey, question.rowIndex, question.colIndex)];

  if (question.solved) {
    parts.push(`Solved with answer ${question.displayValue}.`);
  } else if (question.everMissed) {
    parts.push(`Missed ${question.attemptCount} time${question.attemptCount === 1 ? "" : "s"} so far.`);
  } else {
    parts.push("Unanswered.");
  }

  return parts.join(" ");
}

function buildMultipleChoiceOptions(question) {
  if (!question) return [];

  const absOne = Math.abs(Number(question.operand1 || 0));
  const absTwo = Math.abs(Number(question.operand2 || 0));
  const absoluteSum = absOne + absTwo;
  const absoluteDifference = Math.abs(absOne - absTwo);
  const ordered = [absoluteSum, -absoluteSum, absoluteDifference, -absoluteDifference];
  const values = [];

  for (const value of ordered) {
    if (!values.includes(value)) {
      values.push(value);
    }
  }

  // Keep four choices even when the absolute difference is 0.
  while (values.length < 4) {
    const fallback = values.length % 2 === 0 ? absoluteSum + values.length : -(absoluteSum + values.length);
    if (!values.includes(fallback)) {
      values.push(fallback);
    }
  }

  return values.slice(0, 4);
}

function Leaderboard({ leaderboard, viewerId }) {
  if (!leaderboard.length) {
    return <p className="doubleBoardEmptyNote">No players have joined this game yet.</p>;
  }

  return (
    <div className="doubleBoardLeaderboard">
      {leaderboard.map((player) => (
        <div
          key={player.id}
          className={`doubleBoardLeaderboardRow ${player.userId === viewerId ? "you" : ""}`}
        >
          <span>
            {player.rank}. {player.displayName}
            {player.role === "teacher" ? " (Host)" : ""}
          </span>
          <strong>{player.score}</strong>
        </div>
      ))}
    </div>
  );
}

function BoardPanel({
  boardKey,
  board,
  selectedQuestionId,
  canAnswer,
  onSelect,
}) {
  const rows = boardQuestions(board);

  return (
    <section className="card doubleBoardPanel">
      <div className="doubleBoardPanelHeader">
        <h2>Board {boardKey}</h2>
      </div>
      <div className="doubleBoardGrid">
        {rows.map((row, rowIndex) => (
          <div className="doubleBoardGridRow" key={`${boardKey}-row-${rowIndex}`}>
            {boardQuestions(row).map((question, columnIndex) => {
              if (!question) {
                return (
                  <div
                    key={`${boardKey}-${rowIndex}-${columnIndex}-empty`}
                    className="doubleBoardTile empty"
                  />
                );
              }

              const isSelected = selectedQuestionId === question.id;
              const disabled = !canAnswer || question.solved;
              const highValue = question.attemptCount >= 2;

              return (
                <button
                  key={question.id}
                  type="button"
                  className={`doubleBoardTile state-${question.state} ${isSelected ? "selected" : ""} ${
                    highValue ? "highValue" : ""
                  }`}
                  onClick={() => onSelect(question)}
                  disabled={disabled}
                  title={tileTooltip(question)}
                  aria-label={`${formatBoardLocation(
                    question.boardKey,
                    question.rowIndex,
                    question.colIndex
                  )}. ${question.expressionText}`}
                >
                  <span className="doubleBoardTileValue">
                    {question.solved ? question.displayValue || " " : question.expressionText}
                  </span>
                  {!question.solved && question.everMissed ? (
                    <span className="doubleBoardTileBadge">X</span>
                  ) : null}
                  {question.solved ? (
                    <span className="doubleBoardTileMeta">Solved</span>
                  ) : null}
                  <span className="doubleBoardTileValueBadge">{question.retryValue}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function AnswerModal({
  open,
  question,
  answerMode,
  answerValue,
  onAnswerChange,
  onCancel,
  onSubmit,
  busy,
}) {
  if (!open || !question) return null;

  const multipleChoiceOptions = answerMode === "multiple_choice"
    ? buildMultipleChoiceOptions(question)
    : [];

  return (
    <div className="doubleBoardModalBackdrop" role="presentation" onClick={onCancel}>
      <div
        className="doubleBoardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="double-board-answer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="doubleBoardEyebrow">
          {formatBoardLocation(question.boardKey, question.rowIndex, question.colIndex)}
        </p>
        <h3 id="double-board-answer-title">{question.expressionText}</h3>
        <p>
          {answerMode === "multiple_choice"
            ? "Pick one of the four answer choices."
            : "Enter one whole-number answer. Wrong answers do not reveal the solution."}
        </p>
        {answerMode === "multiple_choice" ? (
          <div className="doubleBoardChoiceGrid">
            {multipleChoiceOptions.map((choice) => (
              <button
                key={`${question.id}-${choice}`}
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => onSubmit(String(choice))}
              >
                {choice}
              </button>
            ))}
            <div className="ctaRow">
              <button className="btn" type="button" onClick={onCancel} disabled={busy}>
                Back to board
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(answerValue);
            }}
            className="doubleBoardAnswerForm"
          >
            <input
              className="input"
              inputMode="numeric"
              pattern="-?[0-9]*"
              autoFocus
              value={answerValue}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Type an integer"
              aria-label="Answer"
            />
            <div className="ctaRow">
              <button className="btn primary" type="submit" disabled={busy || !String(answerValue).trim()}>
                Submit Answer
              </button>
              <button className="btn" type="button" onClick={onCancel} disabled={busy}>
                Back to board
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ reviewItems }) {
  if (!reviewItems.length) {
    return (
      <section className="card doubleBoardReviewCard">
        <h2>Perfect Game</h2>
        <p>No question on either board was missed. There is nothing to review.</p>
      </section>
    );
  }

  return (
    <section className="card doubleBoardReviewCard">
      <h2>End-of-Game Review</h2>
      <p>These were the questions that were missed at least once before the game ended.</p>
      <div className="doubleBoardReviewList">
        {reviewItems.map((item) => (
          <div key={item.id} className="doubleBoardReviewItem">
            <strong>{item.expressionText}</strong>
            <span>{`Answer: ${item.correctAnswer}`}</span>
            <span>{`Board ${item.boardKey}`}</span>
            <span>{`${item.wrongAttemptCount} wrong attempt${
              item.wrongAttemptCount === 1 ? "" : "s"
            } before solve`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DoubleBoardClient({
  courses,
  initialCourseId,
  userId,
  viewerAccountType,
}) {
  const canHost = viewerAccountType !== "student";
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [numberMode, setNumberMode] = useState("single_digit");
  const [answerMode, setAnswerMode] = useState("typed");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashMessage, setFlashMessage] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [answerValue, setAnswerValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  const courseOptions = useMemo(() => {
    if (!canHost) return courses;
    return [
      {
        id: "",
        title: "Practice room (no class)",
        relationship: "owner",
      },
      ...courses,
    ];
  }, [canHost, courses]);

  const loadSession = useCallback(async (nextCourseId = courseId, options = {}) => {
    if (!options.quiet) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (nextCourseId) params.set("courseId", nextCourseId);
      if (canHost) params.set("includeWaiting", "1");
      const response = await fetch(`/api/play/double-board?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load Double Board.");
      }
      setSession(normalizeSessionPayload(payload.session));
      if (!options.quiet) {
        setFlashMessage("");
      }
    } catch (error) {
      setFlashMessage(error.message || "Could not load Double Board.");
    } finally {
      if (!options.quiet) {
        setLoading(false);
      }
    }
  }, [canHost, courseId]);

  async function postAction(action, extra = {}) {
    setBusy(true);
    try {
      const response = await fetch("/api/play/double-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          courseId: courseId || null,
          numberMode,
          answerMode,
          sessionId: session?.id || null,
          ...extra,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Double Board request failed.");
      }
      if (payload.session) {
        const normalizedSession = normalizeSessionPayload(payload.session);
        setSession(normalizedSession);
        setAnswerMode(normalizedSession?.answerMode || "typed");
      }
      if (payload.result?.message) {
        setFlashMessage(payload.result.message);
      }
      if (payload.session?.status === "ended") {
        setReviewOpen(true);
      }
      return payload;
    } catch (error) {
      setFlashMessage(error.message || "Double Board request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadSession(initialCourseId || "");
  }, [initialCourseId, loadSession]);

  useEffect(() => {
    if (!courseId && !canHost) return undefined;

    const delay = session?.status === "live" ? 2000 : 4500;
    const interval = window.setInterval(() => {
      loadSession(courseId, { quiet: true });
    }, delay);

    return () => window.clearInterval(interval);
  }, [canHost, courseId, loadSession, session?.status]);

  useEffect(() => {
    if (session?.status === "ended") {
      setReviewOpen(true);
    }
  }, [session?.status]);

  useEffect(() => {
    if (session?.answerMode) {
      setAnswerMode(session.answerMode);
    }
  }, [session?.answerMode]);

  const currentCourseLabel = courseTitle(courseOptions, session?.courseId ?? courseId);
  const liveTone = statusTone(session?.status);
  const canAnswer = Boolean(session?.status === "live" && session?.isJoined);
  const boards = session?.boards || {};

  function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    setSelectedQuestion(null);
    setAnswerValue("");
    setReviewOpen(false);
    loadSession(nextCourseId);
  }

  function handleSelect(question) {
    if (!canAnswer || !question || question.solved) return;
    setSelectedQuestion(question);
    setAnswerValue("");
  }

  async function handleSubmitAnswer(nextAnswer = answerValue) {
    if (!selectedQuestion) return;
    const payload = await postAction("answer", {
      questionId: selectedQuestion.id,
      answer: nextAnswer,
    });
    if (payload) {
      setSelectedQuestion(null);
      setAnswerValue("");
    }
  }

  async function handleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFlashMessage("Fullscreen is not available in this browser.");
    }
  }

  return (
    <div className="stack">
      <section className="card doubleBoardShell">
        <div className="doubleBoardTopRow">
          <div>
            <p className="doubleBoardEyebrow">Live classroom review game</p>
            <h2>Double Board Arena</h2>
            <p className="doubleBoardIntro">
              {session
                ? `${currentCourseLabel} · ${session.status === "waiting"
                    ? "Boards generated and waiting for start."
                    : session.status === "live"
                      ? "Game is live."
                      : "Game is finished."
                  }`
                : `${currentCourseLabel} · No active game right now.`}
            </p>
          </div>
          <div className="ctaRow">
            {canHost ? (
              <select
                className="input"
                value={courseId}
                onChange={(event) => handleCourseChange(event.target.value)}
              >
                {courseOptions.map((course) => (
                  <option key={course.id || "practice-room"} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="input"
                value={courseId}
                onChange={(event) => handleCourseChange(event.target.value)}
              >
                <option value="">Select a class</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            )}
            <button className="btn" type="button" onClick={handleFullscreen}>
              Project / Fullscreen
            </button>
            <button className="btn" type="button" onClick={() => loadSession(courseId)}>
              Refresh
            </button>
          </div>
        </div>

        {flashMessage ? <div className="doubleBoardFlash">{flashMessage}</div> : null}

        <div className="doubleBoardArena">
          <BoardPanel
            boardKey="A"
            board={boards.A}
            selectedQuestionId={selectedQuestion?.id}
            canAnswer={canAnswer}
            onSelect={handleSelect}
          />

          <section className={`card doubleBoardCenterCard tone-${liveTone}`}>
            <div className="doubleBoardStatusBanner">
              <strong>
                {session?.status === "live"
                  ? "Live Game"
                  : session?.status === "ended"
                    ? "Game Ended"
                    : "Waiting"}
              </strong>
              <span>
                {session
                  ? `${session.totalSolvedCount} solved · ${session.totalRemainingCount} left`
                  : "No active session"}
              </span>
            </div>

            {canHost ? (
              <div className="doubleBoardHostControls">
                <label>
                  Number mode
                  <select
                    className="input"
                    value={numberMode}
                    onChange={(event) => setNumberMode(event.target.value)}
                    disabled={busy || session?.status === "live"}
                  >
                    {Object.values(DOUBLE_BOARD_NUMBER_MODES).map((mode) => (
                      <option key={mode.slug} value={mode.slug}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Answer mode
                  <select
                    className="input"
                    value={answerMode}
                    onChange={(event) => setAnswerMode(event.target.value)}
                    disabled={busy || session?.status === "live"}
                  >
                    <option value="typed">Typed answer</option>
                    <option value="multiple_choice">Multiple choice</option>
                  </select>
                </label>
                <div className="ctaRow">
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy || loading}
                    onClick={() => postAction(session ? "reset" : "create")}
                  >
                    {session ? "Generate New Boards" : "Create New Game"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || !session || session.status !== "waiting"}
                    onClick={() => postAction("start")}
                  >
                    Start Game
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || !session || session.status !== "live"}
                    onClick={() => postAction("end")}
                  >
                    End Game
                  </button>
                </div>
              </div>
            ) : null}

            {!session && !loading ? (
              <div className="doubleBoardEmptyState">
                <h3>No live game yet</h3>
                <p>
                  {canHost
                    ? "Create a new Double Board game for this class, or use the practice room to test the flow."
                    : "Your teacher has not started Double Board yet. Keep this page open and the Join button will appear when the game goes live."}
                </p>
              </div>
            ) : null}

            {session ? (
              <>
                <div className="doubleBoardScoreStats">
                  <div className="doubleBoardStatCard">
                    <span>Joined students</span>
                    <strong>{session.joinedCount}</strong>
                  </div>
                  <div className="doubleBoardStatCard">
                    <span>Missed but open</span>
                    <strong>{session.missedCount}</strong>
                  </div>
                  <div className="doubleBoardStatCard">
                    <span>Your score</span>
                    <strong>{session.viewerScore}</strong>
                  </div>
                </div>

                {!session.isJoined && session.status === "live" ? (
                  <button className="btn primary doubleBoardJoinButton" type="button" onClick={() => postAction("join")}>
                    Join Game
                  </button>
                ) : null}

                {session.status === "waiting" && !canHost ? (
                  <div className="doubleBoardWaitingCard">
                    <h3>Waiting for the host</h3>
                    <p>Your teacher has generated the boards. You will be able to join once the game starts.</p>
                  </div>
                ) : null}

                <div className="doubleBoardLeaderboardWrap">
                  <h3>Live Leaderboard</h3>
                  <Leaderboard leaderboard={session.leaderboard} viewerId={userId} />
                </div>

                <details className="doubleBoardPatternHelp">
                  <summary>Quick pattern help</summary>
                  <div className="doubleBoardPatternHelpGrid">
                    <div>
                      <h4>Rows</h4>
                      {DOUBLE_BOARD_ROW_PATTERNS.map((row) => (
                        <p key={row.rowIndex}>
                          <strong>{`R${row.rowIndex + 1}`}</strong> {row.description}
                        </p>
                      ))}
                    </div>
                    <div>
                      <h4>Columns</h4>
                      {DOUBLE_BOARD_COLUMN_PATTERNS.map((column) => (
                        <p key={column.colIndex}>
                          <strong>{`C${column.colIndex + 1}`}</strong> {column.description}
                        </p>
                      ))}
                    </div>
                  </div>
                </details>
              </>
            ) : null}
          </section>

          <BoardPanel
            boardKey="B"
            board={boards.B}
            selectedQuestionId={selectedQuestion?.id}
            canAnswer={canAnswer}
            onSelect={handleSelect}
          />
        </div>
      </section>

      {reviewOpen && session?.status === "ended" ? (
        <ReviewPanel reviewItems={session.reviewItems || []} />
      ) : null}

      <AnswerModal
        open={Boolean(selectedQuestion)}
        question={selectedQuestion}
        answerMode={session?.answerMode || answerMode}
        answerValue={answerValue}
        onAnswerChange={setAnswerValue}
        onCancel={() => setSelectedQuestion(null)}
        onSubmit={handleSubmitAnswer}
        busy={busy}
      />
    </div>
  );
}
