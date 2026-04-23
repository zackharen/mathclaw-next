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
    turnOrder: Array.isArray(session.turnOrder) ? session.turnOrder : [],
    reviewItems: Array.isArray(session.reviewItems) ? session.reviewItems : [],
    answerHistoryByUser:
      session.answerHistoryByUser && typeof session.answerHistoryByUser === "object"
        ? session.answerHistoryByUser
        : {},
    answerMode: session.answerMode === "multiple_choice" ? "multiple_choice" : "typed",
    playMode: session.playMode === "one_at_a_time" ? "one_at_a_time" : "free_for_all",
    turnAdvanceMode: session.turnAdvanceMode === "one_per_turn" ? "one_per_turn" : "until_wrong",
    freeForAllTimerSeconds: Math.max(1, Number(session.freeForAllTimerSeconds || 10)),
    startCountdownEndsAt: futureTimestampOrNull(session.startCountdownEndsAt),
    activeQuestionId: typeof session.activeQuestionId === "string" ? session.activeQuestionId : null,
    activeTurnDisplayName:
      typeof session.activeTurnDisplayName === "string" ? session.activeTurnDisplayName : null,
    activeTurnUserId: typeof session.activeTurnUserId === "string" ? session.activeTurnUserId : null,
    studentSettingsEnabled: Boolean(session.studentSettingsEnabled),
    settingsVotePhase: Math.max(1, Number(session.settingsVotePhase || 1)),
    viewerVote: session.viewerVote && typeof session.viewerVote === "object" ? session.viewerVote : null,
    resolvedStudentSettings:
      session.resolvedStudentSettings && typeof session.resolvedStudentSettings === "object"
        ? session.resolvedStudentSettings
        : null,
    resolvedStudentVoteSummary:
      session.resolvedStudentVoteSummary && typeof session.resolvedStudentVoteSummary === "object"
        ? session.resolvedStudentVoteSummary
        : null,
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
    return <p className="doubleBoardEmptyNote">No students are currently in the room.</p>;
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

function TurnOrderPanel({
  items,
  canManage,
  busy,
  selectedUserId,
  onSelect,
  onReorder,
}) {
  const [draggingUserId, setDraggingUserId] = useState(null);

  if (!items?.length) {
    return (
      <div className="doubleBoardWaitingCard">
        <h3>Turn Order</h3>
        <p>Students will appear here after they join.</p>
      </div>
    );
  }

  function moveUser(targetUserId) {
    if (!draggingUserId || draggingUserId === targetUserId) return;
    const draggedIndex = items.findIndex((item) => item.userId === draggingUserId);
    const targetIndex = items.findIndex((item) => item.userId === targetUserId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const nextItems = [...items];
    const [draggedItem] = nextItems.splice(draggedIndex, 1);
    nextItems.splice(targetIndex, 0, draggedItem);
    onReorder(nextItems.map((item) => item.userId));
  }

  return (
    <div className="doubleBoardWaitingCard">
      <h3>Turn Order</h3>
      <p>Drag students to change who goes next after the current turn finishes.</p>
      <div className="doubleBoardTurnOrderList">
        {items.map((item, index) => (
          <button
            key={item.userId}
            type="button"
            className={`doubleBoardTurnOrderRow ${item.isActiveTurn ? "isActive" : ""} ${
              selectedUserId === item.userId ? "selected" : ""
            } ${draggingUserId === item.userId ? "isDragging" : ""}`}
            draggable={canManage && !busy}
            onClick={() => onSelect?.(item.userId)}
            onDragStart={() => setDraggingUserId(item.userId)}
            onDragEnd={() => setDraggingUserId(null)}
            onDragOver={(event) => {
              if (!canManage || busy) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveUser(item.userId);
              setDraggingUserId(null);
            }}
          >
            <span className="doubleBoardTurnOrderNumber">{index + 1}</span>
            <span className="doubleBoardTurnOrderName">
              {item.displayName}
              {item.isActiveTurn ? <small>Current turn</small> : null}
              {!item.isPresent ? <small>Not in room</small> : null}
            </span>
            <span className="doubleBoardTurnOrderMeta">
              <strong>{item.score}</strong>
              {canManage ? <small>Drag</small> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StudentSettingsSummary({ summary }) {
  if (!summary?.totalVotes) return null;

  const labels = {
    numberMode: "Board type",
    answerMode: "Answer mode",
    playMode: "Play mode",
    turnAdvanceMode: "Turn advances",
    freeForAllTimerSeconds: "Question timer",
  };
  const valueLabels = {
    numberMode: Object.fromEntries(
      Object.values(DOUBLE_BOARD_NUMBER_MODES).map((mode) => [mode.slug, mode.label])
    ),
    answerMode: {
      typed: "Typed answer",
      multiple_choice: "Multiple choice",
    },
    playMode: {
      free_for_all: "Free for all",
      one_at_a_time: "One at a time",
    },
    turnAdvanceMode: {
      until_wrong: "Keep going until wrong",
      one_per_turn: "One question per turn",
    },
  };

  return (
    <div className="doubleBoardWaitingCard">
      <h3>Student Vote Summary</h3>
      <p>{summary.totalVotes} student vote{summary.totalVotes === 1 ? "" : "s"} counted.</p>
      <div className="doubleBoardVoteSummaryList">
        {Object.entries(labels).map(([key, label]) => {
          const setting = summary.settings?.[key];
          if (!setting) return null;
          const winnerLabel =
            key === "freeForAllTimerSeconds"
              ? `${setting.winner} seconds`
              : valueLabels[key]?.[setting.winner] || String(setting.winner || "");

          return (
            <div key={key} className="doubleBoardVoteSummaryRow">
              <span>{label}</span>
              <strong>{winnerLabel}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudentVoteOverlay({
  open,
  busy,
  settings,
  onChange,
  onSubmit,
}) {
  if (!open) return null;

  return (
    <div className="doubleBoardVoteOverlay" role="dialog" aria-modal="true" aria-labelledby="double-board-vote-title">
      <div className="doubleBoardVoteCard">
        <p className="doubleBoardEyebrow">Double Board</p>
        <h2 id="double-board-vote-title">Vote For The Next Settings</h2>
        <p>Your teacher is letting the class choose how the next round should play.</p>
        <form
          className="doubleBoardVoteForm"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label>
            Board type
            <select
              className="input"
              value={settings.numberMode}
              onChange={(event) => onChange("numberMode", event.target.value)}
              disabled={busy}
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
              value={settings.answerMode}
              onChange={(event) => onChange("answerMode", event.target.value)}
              disabled={busy}
            >
              <option value="typed">Typed answer</option>
              <option value="multiple_choice">Multiple choice</option>
            </select>
          </label>
          <label>
            Play mode
            <select
              className="input"
              value={settings.playMode}
              onChange={(event) => onChange("playMode", event.target.value)}
              disabled={busy}
            >
              <option value="free_for_all">Free for all</option>
              <option value="one_at_a_time">One at a time</option>
            </select>
          </label>
          <label>
            Turn advances
            <select
              className="input"
              value={settings.turnAdvanceMode}
              onChange={(event) => onChange("turnAdvanceMode", event.target.value)}
              disabled={busy}
            >
              <option value="until_wrong">Keep going until wrong</option>
              <option value="one_per_turn">One question per turn</option>
            </select>
          </label>
          <label>
            Question timer (seconds)
            <input
              className="input"
              type="number"
              min="1"
              max="120"
              value={settings.freeForAllTimerSeconds}
              onChange={(event) => onChange("freeForAllTimerSeconds", event.target.value)}
              disabled={busy}
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            Submit Vote
          </button>
        </form>
      </div>
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
              const claimSecondsLeft = secondsRemaining(question.claim?.expiresAt, currentTimeMs);
              const isClaimedByOther =
                playMode === "free_for_all" &&
                claimSecondsLeft > 0 &&
                question.claim?.userId &&
                question.claim.userId !== viewerId;
              const isLockedForViewer =
                playMode === "free_for_all" && question.lockoutUserIds?.includes(viewerId);
              const disabled =
                !canAnswer ||
                question.solved ||
                isClaimedByOther ||
                isLockedForViewer;
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
                  } ${!question.solved && question.claim && claimSecondsLeft > 0 ? "engaged" : ""} ${
                    isLockedForViewer ? "lockedOut" : ""
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
  claimSecondsLeft,
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
  const hasClaimTimer = claimSecondsLeft > 0;

  return (
    <div className="doubleBoardModalBackdrop" role="presentation">
      <div
        className="doubleBoardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="double-board-answer-title"
      >
        <button
          type="button"
          className="doubleBoardModalClose"
          onClick={onCancel}
          disabled={busy}
          aria-label="Exit question"
        >
          X
        </button>
        <p className="doubleBoardEyebrow">
          {formatBoardLocation(question.boardKey, question.rowIndex, question.colIndex)}
        </p>
        <h3 id="double-board-answer-title"><MathInlineText text={question.expressionText} /></h3>
        {hasClaimTimer ? (
          <div className="doubleBoardModalTimer" aria-live="polite">
            <span>Time left</span>
            <strong>{claimSecondsLeft}s</strong>
          </div>
        ) : null}
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
  const [turnAdvanceMode, setTurnAdvanceMode] = useState("until_wrong");
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [studentSettingsEnabled, setStudentSettingsEnabled] = useState(false);
  const [voteOverlayOpen, setVoteOverlayOpen] = useState(false);
  const [voteSettings, setVoteSettings] = useState({
    numberMode: "single_digit",
    answerMode: "typed",
    playMode: "free_for_all",
    turnAdvanceMode: "until_wrong",
    freeForAllTimerSeconds: 10,
  });

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
      setClockNow(Date.now());
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
          turnAdvanceMode,
          studentSettingsEnabled,
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
        setClockNow(Date.now());
        setAnswerMode(normalizedSession?.answerMode || "typed");
        setPlayMode(normalizedSession?.playMode || "free_for_all");
        setTurnAdvanceMode(normalizedSession?.turnAdvanceMode || "until_wrong");
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

    const delay = session?.status === "live" ? 700 : 2200;
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
    if (session?.numberMode) {
      setNumberMode(session.numberMode);
    }
  }, [session?.numberMode]);

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
    if (session?.turnAdvanceMode) {
      setTurnAdvanceMode(session.turnAdvanceMode);
    }
  }, [session?.turnAdvanceMode]);

  useEffect(() => {
    if (!canHost || session?.status !== "live") return;
    setHostSetupOpen(false);
  }, [canHost, session?.status]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (session?.freeForAllTimerSeconds) {
      setFreeForAllTimerSeconds(session.freeForAllTimerSeconds);
    }
  }, [session?.freeForAllTimerSeconds]);

  useEffect(() => {
    setStudentSettingsEnabled(Boolean(session?.studentSettingsEnabled));
  }, [session?.studentSettingsEnabled]);

  useEffect(() => {
    if (!session) return;

    setVoteSettings({
      numberMode: session.viewerVote?.numberMode || session.numberMode || "single_digit",
      answerMode: session.viewerVote?.answerMode || session.answerMode || "typed",
      playMode: session.viewerVote?.playMode || session.playMode || "free_for_all",
      turnAdvanceMode: session.viewerVote?.turnAdvanceMode || session.turnAdvanceMode || "until_wrong",
      freeForAllTimerSeconds:
        session.viewerVote?.freeForAllTimerSeconds || session.freeForAllTimerSeconds || 10,
    });
  }, [
    session,
    session?.answerMode,
    session?.freeForAllTimerSeconds,
    session?.numberMode,
    session?.playMode,
    session?.turnAdvanceMode,
    session?.viewerVote?.answerMode,
    session?.viewerVote?.freeForAllTimerSeconds,
    session?.viewerVote?.numberMode,
    session?.viewerVote?.playMode,
    session?.viewerVote?.turnAdvanceMode,
  ]);

  useEffect(() => {
    if (
      !canHost &&
      session?.isJoined &&
      session?.studentSettingsEnabled &&
      (session.status === "waiting" || session.status === "ended") &&
      session.viewerVote?.phase !== session.settingsVotePhase
    ) {
      setVoteOverlayOpen(true);
    }
  }, [
    canHost,
    session?.isJoined,
    session?.settingsVotePhase,
    session?.status,
    session?.studentSettingsEnabled,
    session?.viewerVote?.phase,
  ]);

  useEffect(() => {
    if (
      canHost ||
      !session?.studentSettingsEnabled ||
      !session?.isJoined ||
      (session?.status !== "waiting" && session?.status !== "ended")
    ) {
      setVoteOverlayOpen(false);
    }
  }, [canHost, session?.isJoined, session?.status, session?.studentSettingsEnabled]);

  const boards = session?.boards || {};

  useEffect(() => {
    const now = Date.now();
    const hasCountdown = secondsRemaining(session?.startCountdownEndsAt, now) > 0;
    const hasClaims = [boards.A, boards.B]
      .flatMap((board) => boardQuestions(board).flat())
      .some((question) => question?.claim && secondsRemaining(question.claim.expiresAt, now) > 0);

    if (!hasCountdown && !hasClaims) return undefined;

    setClockNow(now);
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
  const activeSelectedQuestion = selectedQuestion
    ? [...boardQuestions(boards.A).flat(), ...boardQuestions(boards.B).flat()]
        .filter(Boolean)
        .find((question) => question.id === selectedQuestion.id) || selectedQuestion
    : null;
  const selectedQuestionClaimSecondsLeft = secondsRemaining(
    activeSelectedQuestion?.claim?.expiresAt,
    clockNow
  );
  const selectedHistoryItems =
    session?.answerHistoryByUser?.[
      canHost ? selectedHistoryUserId : userId
    ] || [];
  const turnOrderItems = session?.turnOrder || [];

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

  async function handleTurnOrderReorder(orderedUserIds) {
    if (!session || !canHost || session.playMode !== "one_at_a_time") return;
    await postAction("reorder_turns", {
      orderedUserIds,
    });
  }

  function handleVoteSettingChange(key, value) {
    setVoteSettings((current) => ({
      ...current,
      [key]: key === "freeForAllTimerSeconds" ? Math.max(1, Number(value || 1)) : value,
    }));
  }

  async function handleVoteSubmit() {
    const payload = await postAction("submit_vote", voteSettings);
    if (payload) {
      setVoteOverlayOpen(false);
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
        <section className={`card doubleBoardShell ${isFullscreen ? "isFullscreen" : ""}`}>
          <StartCountdownOverlay countdownValue={countdownActive ? countdownValue : 0} />
          {!isFullscreen ? (
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
          ) : (
            <div className="doubleBoardFullscreenBar">
              <button className="btn" type="button" onClick={handleFullscreen}>
                Exit Fullscreen
              </button>
            </div>
          )}

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
                        {playMode === "one_at_a_time" ? (
                          <label>
                            Turn advances
                            <select
                              className="input"
                              value={turnAdvanceMode}
                              onChange={(event) => setTurnAdvanceMode(event.target.value)}
                              disabled={busy || session?.status === "live"}
                            >
                              <option value="until_wrong">Keep going until wrong</option>
                              <option value="one_per_turn">One question per turn</option>
                            </select>
                          </label>
                        ) : null}
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
                        <label className="doubleBoardCheckboxRow">
                          <input
                            type="checkbox"
                            checked={studentSettingsEnabled}
                            onChange={(event) => setStudentSettingsEnabled(event.target.checked)}
                            disabled={busy || session?.status === "live"}
                          />
                          <span>Let students choose settings</span>
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
                    <span>Students In Room</span>
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
                        ? session?.turnAdvanceMode === "one_per_turn"
                          ? "That student can choose any open question, submit one answer, and then the turn moves to the next student in join order."
                          : "That student keeps choosing questions until they get one wrong, then the turn moves to the next student in join order."
                        : "Students will rotate in the order they joined once at least one student is in the game."}
                    </p>
                  </div>
                ) : null}

                {canHost && session?.playMode === "one_at_a_time" ? (
                  <TurnOrderPanel
                    items={turnOrderItems}
                    canManage={Boolean(session?.canManage)}
                    busy={busy}
                    selectedUserId={selectedHistoryUserId}
                    onSelect={setSelectedHistoryUserId}
                    onReorder={handleTurnOrderReorder}
                  />
                ) : null}

                {canHost && session?.resolvedStudentVoteSummary ? (
                  <StudentSettingsSummary summary={session.resolvedStudentVoteSummary} />
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
          question={activeSelectedQuestion}
          claimSecondsLeft={selectedQuestionClaimSecondsLeft}
          answerMode={session?.answerMode || answerMode}
          answerValue={answerValue}
          onAnswerChange={setAnswerValue}
          onCancel={() => setSelectedQuestion(null)}
          onSubmit={handleSubmitAnswer}
          busy={busy}
        />
        <StudentVoteOverlay
          open={voteOverlayOpen}
          busy={busy}
          settings={voteSettings}
          onChange={handleVoteSettingChange}
          onSubmit={handleVoteSubmit}
        />
      </div>
    </DoubleBoardErrorBoundary>
  );
}
