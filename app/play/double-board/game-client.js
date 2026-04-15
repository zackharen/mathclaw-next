"use client";

import { Component, useCallback, useEffect, useMemo, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import { buildIntegerNode } from "@/lib/math-display";
import {
  DOUBLE_BOARD_COLUMN_PATTERNS,
  DOUBLE_BOARD_NUMBER_MODES,
  DOUBLE_BOARD_ROW_PATTERNS,
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
    answerHistoryByUser:
      session.answerHistoryByUser && typeof session.answerHistoryByUser === "object"
        ? session.answerHistoryByUser
        : {},
    answerMode: session.answerMode === "multiple_choice" ? "multiple_choice" : "typed",
    playMode: session.playMode === "one_at_a_time" ? "one_at_a_time" : "free_for_all",
    activeQuestionId: typeof session.activeQuestionId === "string" ? session.activeQuestionId : null,
    activeTurnDisplayName:
      typeof session.activeTurnDisplayName === "string" ? session.activeTurnDisplayName : null,
    activeTurnUserId: typeof session.activeTurnUserId === "string" ? session.activeTurnUserId : null,
    isViewerTurn: Boolean(session.isViewerTurn),
  };
}

class DoubleBoardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Double Board render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="card doubleBoardErrorCard">
          <h2>Double Board Hit A Page Error</h2>
          <p>
            The game data loaded, but part of the page crashed while rendering. Refresh once more,
            and if it happens again I need the browser console message to pinpoint the exact line.
          </p>
        </section>
      );
    }

    return this.props.children;
  }
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

function Leaderboard({ leaderboard, viewerId, selectedUserId, onSelect }) {
  if (!leaderboard.length) {
    return <p className="doubleBoardEmptyNote">No players have joined this game yet.</p>;
  }

  return (
    <div className="doubleBoardLeaderboard">
      {leaderboard.map((player) => (
        <button
          key={player.id}
          type="button"
          className={`doubleBoardLeaderboardRow ${player.userId === viewerId ? "you" : ""} ${
            selectedUserId === player.userId ? "selected" : ""
          }`}
          onClick={() => onSelect?.(player.userId)}
        >
          <span>
            {player.rank}. {player.displayName}
          </span>
          <strong>{player.score}</strong>
        </button>
      ))}
    </div>
  );
}

function AnswerHistoryPanel({ title, items }) {
  if (!items?.length) {
    return (
      <div className="doubleBoardWaitingCard">
        <h3>{title}</h3>
        <p>No submitted answers yet.</p>
      </div>
    );
  }

  return (
    <section className="card doubleBoardReviewCard">
      <h3>{title}</h3>
      <div className="doubleBoardReviewList">
        {items.map((item) => (
          <div key={item.id} className="doubleBoardReviewItem">
            <strong><MathInlineText text={item.expressionText} /></strong>
            <span>
              Answer given: <MathText node={buildIntegerNode(item.submittedAnswer)} />
            </span>
            <span>{item.isCorrect ? "Correct" : "Incorrect"}</span>
            <span>{formatBoardLocation(item.boardKey, item.rowIndex, item.colIndex)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardPanel({
  boardKey,
  board,
  selectedQuestionId,
  canAnswer,
  canManage,
  sessionStatus,
  playMode,
  activeQuestionId,
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
              const isPlayableQuestion =
                playMode !== "one_at_a_time" || !activeQuestionId || question.id === activeQuestionId;
              const disabled =
                !canAnswer || question.solved || (sessionStatus === "live" && !isPlayableQuestion);
              const highValue = question.attemptCount >= 2;
              const tileLabel =
                sessionStatus === "waiting" && !canManage
                  ? "Waiting"
                  : question.solved
                    ? question.expressionText
                    : question.expressionText;
              const ariaDescription =
                sessionStatus === "waiting" && !canManage
                  ? `${formatBoardLocation(
                      question.boardKey,
                      question.rowIndex,
                      question.colIndex
                    )}. Hidden until the teacher starts the game.`
                  : `${formatBoardLocation(
                      question.boardKey,
                      question.rowIndex,
                      question.colIndex
                    )}. ${question.expressionText}`;

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
                  aria-label={ariaDescription}
                >
                  <span className="doubleBoardTileValue"><MathInlineText text={tileLabel} /></span>
                  {!question.solved && question.everMissed ? (
                    <span className="doubleBoardTileBadge">X</span>
                  ) : null}
                  {question.solved ? (
                    <span className="doubleBoardTileMeta" aria-hidden="true">✓</span>
                  ) : null}
                  {question.solved ? (
                    <span className="doubleBoardTileSolution">
                      <MathText node={{ kind: "equation", segments: [{ kind: "symbol", value: "=" }, buildIntegerNode(question.correctAnswer)] }} />
                    </span>
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
        <h3 id="double-board-answer-title"><MathInlineText text={question.expressionText} /></h3>
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
                <MathText node={buildIntegerNode(choice)} className="mathChoiceContent" />
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
  const [playMode, setPlayMode] = useState("free_for_all");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashMessage, setFlashMessage] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [answerValue, setAnswerValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedHistoryUserId, setSelectedHistoryUserId] = useState(null);
  const [hostSetupOpen, setHostSetupOpen] = useState(true);

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
      params.set("includeWaiting", "1");
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
  }, [courseId]);

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
          playMode,
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
        setPlayMode(normalizedSession?.playMode || "free_for_all");
        setSelectedHistoryUserId((current) => {
          if (current && normalizedSession?.answerHistoryByUser?.[current]) {
            return current;
          }
          if (normalizedSession?.answerHistoryByUser?.[userId]) {
            return userId;
          }
          return normalizedSession?.leaderboard?.[0]?.userId || null;
        });
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

    const delay = session?.status === "live" ? 1200 : 2200;
    const interval = window.setInterval(() => {
      loadSession(courseId, { quiet: true });
    }, delay);

    return () => window.clearInterval(interval);
  }, [canHost, courseId, loadSession, session?.status]);

  useEffect(() => {
    function refreshOnFocus() {
      loadSession(courseId, { quiet: true });
    }

    function refreshOnVisible() {
      if (document.visibilityState === "visible") {
        loadSession(courseId, { quiet: true });
      }
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [courseId, loadSession]);

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

  useEffect(() => {
    if (session?.playMode) {
      setPlayMode(session.playMode);
    }
  }, [session?.playMode]);

  useEffect(() => {
    if (!canHost) return;
    setHostSetupOpen(!session || session.status !== "live");
  }, [canHost, session]);

  const currentCourseLabel = courseTitle(courseOptions, session?.courseId ?? courseId);
  const liveTone = statusTone(session?.status);
  const boards = session?.boards || {};
  const canAnswer = Boolean(
    session?.status === "live" &&
      session?.isJoined &&
      (session?.playMode !== "one_at_a_time" || session?.isViewerTurn)
  );

  useEffect(() => {
    if (!selectedQuestion) return;

    const allQuestions = [...boardQuestions(boards.A).flat(), ...boardQuestions(boards.B).flat()].filter(Boolean);
    const freshQuestion = allQuestions.find((question) => question.id === selectedQuestion.id);

    if (!freshQuestion || freshQuestion.solved || !canAnswer) {
      setSelectedQuestion(null);
      setAnswerValue("");
    }
  }, [boards.A, boards.B, canAnswer, selectedQuestion]);
  const selectedHistoryItems =
    session?.answerHistoryByUser?.[
      canHost ? selectedHistoryUserId : userId
    ] || [];

  function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    setSelectedQuestion(null);
    setAnswerValue("");
    setReviewOpen(false);
    setSelectedHistoryUserId(null);
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
    <DoubleBoardErrorBoundary>
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
              canManage={Boolean(session?.canManage)}
              sessionStatus={session?.status}
              playMode={session?.playMode || playMode}
              activeQuestionId={session?.activeQuestionId}
              onSelect={handleSelect}
            />

            <section className={`card doubleBoardCenterCard tone-${liveTone}`}>
              <div className="doubleBoardStatusBanner">
                <strong>
                  {session?.status === "live"
                    ? session?.playMode === "one_at_a_time" && session?.activeTurnDisplayName
                      ? `${session.activeTurnDisplayName}'s Turn`
                      : "Live Game"
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
                {session?.status !== "live" ? (
                  <div className="doubleBoardHostSetupCard">
                    <button
                      className="doubleBoardHostSetupToggle"
                      type="button"
                      onClick={() => setHostSetupOpen((current) => !current)}
                      aria-expanded={hostSetupOpen}
                    >
                      <span>
                        <strong>Game setup</strong>
                        <small>Choose how the next board set should play.</small>
                      </span>
                      <span className={`doubleBoardHostSetupChevron ${hostSetupOpen ? "open" : ""}`} aria-hidden="true">
                        ▾
                      </span>
                    </button>

                    {hostSetupOpen ? (
                      <div className="doubleBoardHostSetupFields">
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
                        <label>
                          Play mode
                          <select
                            className="input"
                            value={playMode}
                            onChange={(event) => setPlayMode(event.target.value)}
                            disabled={busy || session?.status === "live"}
                          >
                            <option value="free_for_all">Free for all</option>
                            <option value="one_at_a_time">One at a time</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="ctaRow doubleBoardHostActionRow">
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

                {!session.isJoined && (session.status === "live" || session.status === "waiting") ? (
                  <button className="btn primary doubleBoardJoinButton" type="button" onClick={() => postAction("join")}>
                    {session.status === "waiting" ? "Join Lobby" : "Join Game"}
                  </button>
                ) : null}

                {session.status === "waiting" && !canHost ? (
                  <div className="doubleBoardWaitingCard">
                    <h3>Waiting for the host</h3>
                    <p>
                      {session.isJoined
                        ? "You are in the room. The questions will appear once your teacher starts the game."
                        : "Your teacher has generated the boards. Join now, and the questions will appear once the game starts."}
                    </p>
                  </div>
                ) : null}

                {session?.playMode === "one_at_a_time" && session?.status === "live" ? (
                  <div className="doubleBoardWaitingCard">
                    <h3>{session?.activeTurnDisplayName ? `${session.activeTurnDisplayName}'s Turn` : "Waiting For A Turn"}</h3>
                    <p>
                      {session?.activeTurnDisplayName
                        ? "That student can choose any open question, submit one answer, and then the turn moves to the next student in join order."
                        : "Students will rotate in the order they joined once at least one student is in the game."}
                    </p>
                  </div>
                ) : null}

                <div className="doubleBoardLeaderboardWrap">
                  <h3>{canHost ? "Live Leaderboard" : "Class Leaderboard"}</h3>
                  <Leaderboard
                    leaderboard={session.leaderboard}
                    viewerId={userId}
                    selectedUserId={canHost ? selectedHistoryUserId : userId}
                    onSelect={setSelectedHistoryUserId}
                  />
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
              canManage={Boolean(session?.canManage)}
              sessionStatus={session?.status}
              playMode={session?.playMode || playMode}
              activeQuestionId={session?.activeQuestionId}
              onSelect={handleSelect}
            />
          </div>
        </section>

        {reviewOpen && session?.status === "ended" ? (
          <ReviewPanel reviewItems={session.reviewItems || []} />
        ) : null}

        {session ? (
          <AnswerHistoryPanel
            title={
              canHost
                ? selectedHistoryUserId
                  ? `${session.leaderboard.find((player) => player.userId === selectedHistoryUserId)?.displayName || "Student"} Answer History`
                  : "Student Answer History"
                : "Your Answer History"
            }
            items={selectedHistoryItems}
          />
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
    </DoubleBoardErrorBoundary>
  );
}
