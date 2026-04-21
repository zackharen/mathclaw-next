"use client";

import { Component, useCallback, useEffect, useMemo, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import { buildLabelNode } from "@/lib/math-display";
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

function futureTimestampOrNull(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function secondsRemaining(endTime, nowMs = Date.now()) {
  const endMs = Date.parse(String(endTime || ""));
  if (!Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
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
    freeForAllTimerSeconds: Math.max(1, Number(session.freeForAllTimerSeconds || 10)),
    startCountdownEndsAt: futureTimestampOrNull(session.startCountdownEndsAt),
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
    parts.push(`Solved with answer ${question.answerDisplay}.`);
  } else if (question.everMissed) {
    parts.push(`Missed ${question.attemptCount} time${question.attemptCount === 1 ? "" : "s"} so far.`);
  } else {
    parts.push("Unanswered.");
  }

  return parts.join(" ");
}

function buildMultipleChoiceOptions(question) {
  if (!question) return [];

  const metadata = question.metadata || {};

  if (metadata.answerFormat === "multiplier_hundredths") {
    const percentValue = Number(metadata.percentValue || 0);
    const correct = Number(question.correctAnswer || 0);
    const oppositeDirection =
      metadata.direction === "decrease" ? 100 + percentValue : 100 - percentValue;
    const rawDecimal = percentValue;
    const reversedDigits = percentValue < 10 ? 100 + percentValue * 10 : 100 + (percentValue % 10);
    const ordered = [correct, oppositeDirection, rawDecimal, reversedDigits];
    const values = [];

    for (const value of ordered) {
      if (Number.isFinite(value) && value > 0 && !values.includes(value)) {
        values.push(value);
      }
    }

    while (values.length < 4) {
      const fallback = Math.max(1, 100 + percentValue + values.length);
      if (!values.includes(fallback)) {
        values.push(fallback);
      }
    }

    return values.slice(0, 4);
  }

  const numericAnswer = Number(question.correctAnswer);
  if (!Number.isFinite(numericAnswer)) {
    return [];
  }

  return [numericAnswer];
}

function buildAnswerNode(value) {
  return buildLabelNode(String(value ?? ""));
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
          <div
            key={item.id}
            className={`doubleBoardReviewItem ${item.isCorrect ? "is-correct" : "is-incorrect"}`}
          >
            <strong className="doubleBoardReviewExpression">
              <MathInlineText text={item.expressionText} />
            </strong>
            <span className="doubleBoardReviewAnswer">
              Answer given: <MathText node={buildAnswerNode(item.submittedAnswerDisplay)} />
            </span>
            <span className={`doubleBoardReviewMeta ${item.isCorrect ? "is-correct" : "is-incorrect"}`}>
              {item.isCorrect ? "Correct" : "Incorrect"}
            </span>
            <span className="doubleBoardReviewMeta">
              {formatBoardLocation(item.boardKey, item.rowIndex, item.colIndex)}
            </span>
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
  viewerId,
  currentTimeMs,
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
              const claimSecondsLeft = secondsRemaining(question.claim?.expiresAt, currentTimeMs);
              const isClaimedByOther =
                playMode === "free_for_all" &&
                claimSecondsLeft > 0 &&
                question.claim?.userId &&
                question.claim.userId !== viewerId;
              const disabled =
                !canAnswer ||
                question.solved ||
                (sessionStatus === "live" && !isPlayableQuestion) ||
                isClaimedByOther;
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
                  <span className="doubleBoardTileBody">
                    <span className="doubleBoardTileValue"><MathInlineText text={tileLabel} /></span>
                    {!question.solved && question.claim && claimSecondsLeft > 0 ? (
                      <span className="doubleBoardTileClaim">
                        <strong>{question.claim.firstName}</strong>
                        <small>{claimSecondsLeft}s left</small>
                      </span>
                    ) : null}
                    {!question.solved && question.everMissed ? (
                      <span className="doubleBoardTileBadge">X</span>
                    ) : null}
                    {question.solved ? (
                      <span className="doubleBoardTileSolvedState">
                        <span className="doubleBoardTileSolution">
                          <MathText
                            node={{
                              kind: "equation",
                              segments: [
                                { kind: "symbol", value: "=" },
                                buildAnswerNode(question.answerDisplay),
                              ],
                            }}
                          />
                        </span>
                        <span className="doubleBoardTileMeta" aria-hidden="true">✓</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="doubleBoardTileValueBadge">{question.pointValue}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function StartCountdownOverlay({ countdownValue }) {
  if (!countdownValue) return null;

  return (
    <div className="doubleBoardCountdownOverlay" aria-live="assertive">
      <div className="doubleBoardCountdownValue">{countdownValue}</div>
    </div>
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
  const isMultiplierQuestion = question.metadata?.answerFormat === "multiplier_hundredths";
  const answerPrompt = isMultiplierQuestion
    ? "Enter the decimal multiplier for that percent change."
    : "Enter one whole-number answer. Wrong answers do not reveal the solution.";
  const answerPlaceholder = question.metadata?.answerPlaceholder || "Type your answer";

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
            : answerPrompt}
        </p>
        {answerMode === "multiple_choice" ? (
          <div className="doubleBoardChoiceGrid">
            {multipleChoiceOptions.map((choice) => (
              <button
                key={`${question.id}-${choice}`}
                className="btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  onSubmit(
                    isMultiplierQuestion ? (Number(choice) / 100).toFixed(2) : String(choice)
                  )
                }
              >
                <MathText
                  node={buildAnswerNode(
                    isMultiplierQuestion ? (Number(choice) / 100).toFixed(2) : String(choice)
                  )}
                  className="mathChoiceContent"
                />
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
              inputMode={isMultiplierQuestion ? "decimal" : "numeric"}
              pattern={isMultiplierQuestion ? "^(?:\\d+|\\d*\\.\\d{1,2})$" : "-?[0-9]*"}
              autoFocus
              value={answerValue}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder={answerPlaceholder}
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
            <strong className="doubleBoardReviewExpression">
              <MathInlineText text={item.expressionText} />
            </strong>
            <span className="doubleBoardReviewAnswer">
              Answer: <MathText node={buildAnswerNode(item.correctAnswerDisplay)} />
            </span>
            <span className="doubleBoardReviewMeta">{`Board ${item.boardKey}`}</span>
            <span className="doubleBoardReviewMeta">{`${item.wrongAttemptCount} wrong attempt${
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
  const [freeForAllTimerSeconds, setFreeForAllTimerSeconds] = useState(10);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashMessage, setFlashMessage] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [answerValue, setAnswerValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedHistoryUserId, setSelectedHistoryUserId] = useState(null);
  const [hostSetupOpen, setHostSetupOpen] = useState(true);
  const [clockNow, setClockNow] = useState(Date.now());

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
      if (!options.quiet) {
        setFlashMessage(
          error?.message === "Failed to fetch"
            ? "The page lost contact with Double Board for a moment. Try Refresh."
            : error?.message || "Could not load Double Board."
        );
      } else {
        console.warn("Double Board background refresh failed", error);
      }
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
          freeForAllTimerSeconds,
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

  useEffect(() => {
    if (session?.freeForAllTimerSeconds) {
      setFreeForAllTimerSeconds(session.freeForAllTimerSeconds);
    }
  }, [session?.freeForAllTimerSeconds]);

  const boards = session?.boards || {};

  useEffect(() => {
    const now = Date.now();
    const hasCountdown = secondsRemaining(session?.startCountdownEndsAt, now) > 0;
    const hasClaims = [boards.A, boards.B]
      .flatMap((board) => boardQuestions(board).flat())
      .some((question) => question?.claim && secondsRemaining(question.claim.expiresAt, now) > 0);

    if (!hasCountdown && !hasClaims) return undefined;

    const interval = window.setInterval(() => {
      setClockNow(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [boards.A, boards.B, session?.startCountdownEndsAt]);

  const countdownValue = secondsRemaining(session?.startCountdownEndsAt, clockNow);
  const countdownActive = countdownValue > 0;
  const currentCourseLabel = courseTitle(courseOptions, session?.courseId ?? courseId);
  const liveTone = statusTone(session?.status);
  const canAnswer = Boolean(
    session?.status === "live" &&
      !countdownActive &&
      session?.isJoined &&
      (session?.playMode !== "one_at_a_time" || session?.isViewerTurn)
  );

  useEffect(() => {
    if (!selectedQuestion) return;

    const allQuestions = [...boardQuestions(boards.A).flat(), ...boardQuestions(boards.B).flat()].filter(Boolean);
    const freshQuestion = allQuestions.find((question) => question.id === selectedQuestion.id);
    const claimSecondsLeft = secondsRemaining(freshQuestion?.claim?.expiresAt, clockNow);

    if (
      !freshQuestion ||
      freshQuestion.solved ||
      !canAnswer ||
      ((session?.playMode || playMode) === "free_for_all" &&
        (!freshQuestion.claim || freshQuestion.claim.userId !== userId || claimSecondsLeft <= 0))
    ) {
      setSelectedQuestion(null);
      setAnswerValue("");
    }
  }, [boards.A, boards.B, canAnswer, clockNow, playMode, selectedQuestion, session?.playMode, userId]);
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

  async function handleSelect(question) {
    if (!canAnswer || !question || question.solved) return;

    if ((session?.playMode || playMode) === "free_for_all") {
      const payload = await postAction("claim_question", {
        questionId: question.id,
      });

      if (!payload?.result?.claimed) {
        return;
      }
    }

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
          <StartCountdownOverlay countdownValue={countdownActive ? countdownValue : 0} />
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
            <p className="doubleBoardIntro">
              Choose between the original integer-operation board and the new percent-change multiplier board.
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
              viewerId={userId}
              currentTimeMs={clockNow}
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
                          Board type
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
                        <label>
                          Question timer (seconds)
                          <input
                            className="input"
                            type="number"
                            min="1"
                            max="120"
                            value={freeForAllTimerSeconds}
                            onChange={(event) => setFreeForAllTimerSeconds(event.target.value)}
                            disabled={busy || session?.status === "live" || playMode !== "free_for_all"}
                          />
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
                    <span>Joined Students</span>
                    <strong>{session.joinedCount}</strong>
                  </div>
                  <div className="doubleBoardStatCard">
                    <span>Missed But Open</span>
                    <strong>{session.missedCount}</strong>
                  </div>
                  <div className="doubleBoardStatCard">
                    <span>Your Score</span>
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

                {session?.playMode === "free_for_all" ? (
                  <div className="doubleBoardWaitingCard">
                    <h3>Question Timer</h3>
                    <p>
                      Each tile stays claimed for {session.freeForAllTimerSeconds} second
                      {session.freeForAllTimerSeconds === 1 ? "" : "s"} once a player clicks in.
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
              viewerId={userId}
              currentTimeMs={clockNow}
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
