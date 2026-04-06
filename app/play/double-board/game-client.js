"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countSolvedCells,
  createDoubleBoardState,
  pairedCell,
  resolveBoardCell,
  scoreDoubleBoard,
  updateDoubleBoardAfterAnswer,
} from "@/lib/question-engine/double-board";
import { buildSpiralReviewQuestion } from "@/lib/question-engine/spiral-review";

const TOTAL_CELLS = 18;
const SCAFFOLD_OPTIONS = [
  { slug: "hidden", label: "Hide X marks" },
  { slug: "visible", label: "Show X marks" },
  { slug: "hover", label: "Reveal X marks on hover" },
];
const PARTICIPATION_OPTIONS = [
  { slug: "devices", label: "Student devices open" },
  { slug: "projected", label: "Project only / no-tech" },
];

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function boardScore(boardState, boardKey) {
  const rows = boardKey === "left" ? boardState.leftBoard : boardState.rightBoard;
  return rows
    .flat()
    .filter((cell) => cell.status === "correct")
    .reduce((sum, cell) => sum + cell.points + cell.inspirationBonus, 0);
}

function buildPracticePrompt() {
  return buildSpiralReviewQuestion("mixed");
}

function scaffoldLabelForCell(cell, scaffoldMode) {
  if (cell.status === "correct") return cell.answer;
  if (cell.status !== "wrong") return `${cell.points}`;
  if (scaffoldMode === "visible") return "X";
  if (scaffoldMode === "hover") return "Hover";
  return `${cell.points}`;
}

export default function DoubleBoardClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [boardState, setBoardState] = useState(() => createDoubleBoardState());
  const [turnBoard, setTurnBoard] = useState("left");
  const [selectedCellId, setSelectedCellId] = useState("");
  const [scaffoldMode, setScaffoldMode] = useState("hover");
  const [participationMode, setParticipationMode] = useState("devices");
  const [feedback, setFeedback] = useState(
    "Pick a square on the active board. Solve it correctly to lock it in and inspire the paired square."
  );
  const [practiceQuestion, setPracticeQuestion] = useState(() => buildPracticePrompt());
  const [practiceFeedback, setPracticeFeedback] = useState(
    "While the class waits, students can warm up here with random practice questions."
  );
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const savedRunRef = useRef(false);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    attempts: 0,
    solvedCells: 0,
    totalScore: 0,
    leftScore: 0,
    rightScore: 0,
    result: "active",
  });

  const selectedCell = useMemo(
    () => resolveBoardCell(boardState, selectedCellId),
    [boardState, selectedCellId]
  );
  const selectedPairCell = useMemo(
    () => pairedCell(boardState, selectedCell),
    [boardState, selectedCell]
  );
  const totalScore = useMemo(() => scoreDoubleBoard(boardState), [boardState]);
  const solvedCells = useMemo(() => countSolvedCells(boardState), [boardState]);
  const leftScore = useMemo(() => boardScore(boardState, "left"), [boardState]);
  const rightScore = useMemo(() => boardScore(boardState, "right"), [boardState]);
  const runComplete = solvedCells >= TOTAL_CELLS;
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const leftBoardRows = boardState.leftBoard;
  const rightBoardRows = boardState.rightBoard;

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=double_board_review&courseId=${encodeURIComponent(nextCourseId)}`
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
          gameSlug: "double_board_review",
          score: snapshot.totalScore,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            attempts: snapshot.attempts,
            solvedCells: snapshot.solvedCells,
            totalScore: snapshot.totalScore,
            leftScore: snapshot.leftScore,
            rightScore: snapshot.rightScore,
            participationMode,
            scaffoldMode,
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
    [loadLeaderboard, participationMode, scaffoldMode]
  );

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

  function refreshSessionSnapshot(nextBoardState, nextAttempts, nextResult = "active", nextCourseId = courseId) {
    sessionRef.current = {
      courseId: nextCourseId,
      attempts: nextAttempts,
      solvedCells: countSolvedCells(nextBoardState),
      totalScore: scoreDoubleBoard(nextBoardState),
      leftScore: boardScore(nextBoardState, "left"),
      rightScore: boardScore(nextBoardState, "right"),
      result: nextResult,
    };
  }

  function resetRun(nextCourseId = courseId) {
    const nextBoardState = createDoubleBoardState();
    savedRunRef.current = false;
    setBoardState(nextBoardState);
    setTurnBoard("left");
    setSelectedCellId("");
    setFeedback("Pick a square on the active board. Solve it correctly to lock it in and inspire the paired square.");
    setPracticeQuestion(buildPracticePrompt());
    setPracticeFeedback("While the class waits, students can warm up here with random practice questions.");
    refreshSessionSnapshot(nextBoardState, 0, "active", nextCourseId);
  }

  async function startNewRun(resultToSave = "reset", nextCourseId = courseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.attempts > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that board.");
        return;
      }
    }

    resetRun(nextCourseId);
  }

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    await startNewRun("switched_class", nextCourseId);
  }

  function handleSelectCell(cellIdValue) {
    const cell = resolveBoardCell(boardState, cellIdValue);
    if (!cell || cell.boardKey !== turnBoard || cell.status === "correct") return;
    setSelectedCellId(cellIdValue);
    setFeedback(
      cell.status === "wrong"
        ? "This square was missed before, so it is worth more now."
        : "Square selected. Answer it on-screen or project it for no-tech whole-class play."
    );
  }

  async function answerSelectedCell(choice) {
    if (!selectedCell) return;

    const result = updateDoubleBoardAfterAnswer(boardState, selectedCell.id, choice);
    const nextAttempts = sessionRef.current.attempts + 1;
    const finished = countSolvedCells(result.boardState) >= TOTAL_CELLS;

    setBoardState(result.boardState);
    refreshSessionSnapshot(result.boardState, nextAttempts, finished ? "finished" : "active");

    if (result.correct) {
      setFeedback(
        result.pairedSolved
          ? `Correct. ${result.pointsEarned} points, and the matching square was already solved on the other board.`
          : `Correct. ${result.pointsEarned} points earned, and the matching square picked up an inspiration bonus.`
      );
    } else {
      setFeedback(selectedCell.explanation || "Not yet. That square now carries more value for the next try.");
    }

    setSelectedCellId("");
    setTurnBoard((current) => (current === "left" ? "right" : "left"));

    if (finished) {
      try {
        await saveSession({
          ...sessionRef.current,
          result: "finished",
        });
      } catch (error) {
        setFeedback(error.message || "Could not save that board.");
      }
    }
  }

  function answerPracticeQuestion(choice) {
    const correct = practiceQuestion.checkAnswer(choice);
    setPracticeFeedback(correct ? "Practice hit. Keep students warm while the board turn finishes." : practiceQuestion.explanation);
    setPracticeQuestion(buildPracticePrompt());
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Board Controls</h2>
              <p>
                {courseSummary} · {turnBoard === "left" ? "Board A turn" : "Board B turn"}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
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
            <label>
              Scaffold visibility
              <select className="input" value={scaffoldMode} onChange={(event) => setScaffoldMode(event.target.value)}>
                {SCAFFOLD_OPTIONS.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Participation setup
              <select className="input" value={participationMode} onChange={(event) => setParticipationMode(event.target.value)}>
                {PARTICIPATION_OPTIONS.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ctaRow">
              <button className="btn" type="button" onClick={() => startNewRun("reset")}>
                Generate New Boards
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setTurnBoard((current) => (current === "left" ? "right" : "left"))}
              >
                Flip Turn
              </button>
            </div>
          </div>
        </details>

        <div className="doubleBoardScoreStrip">
          <div className={`doubleBoardScoreCard ${turnBoard === "left" ? "active" : ""}`}>
            <span>Board A</span>
            <strong>{leftScore}</strong>
          </div>
          <div className="doubleBoardScoreCard">
            <span>Total Solved</span>
            <strong>
              {solvedCells}/{TOTAL_CELLS}
            </strong>
          </div>
          <div className={`doubleBoardScoreCard ${turnBoard === "right" ? "active" : ""}`}>
            <span>Board B</span>
            <strong>{rightScore}</strong>
          </div>
        </div>

        <div className="doubleBoardGridWrap">
          {[
            ["left", "Board A", leftBoardRows],
            ["right", "Board B", rightBoardRows],
          ].map(([boardKey, boardLabel, rows]) => (
            <div key={boardKey} className={`doubleBoardCard ${turnBoard === boardKey ? "active" : ""}`}>
              <div className="doubleBoardCardHeader">
                <div>
                  <h3>{boardLabel}</h3>
                  <p>
                    {turnBoard === boardKey
                      ? "This board is live."
                      : "Waiting for the other board to finish its turn."}
                  </p>
                </div>
                <strong>{boardKey === "left" ? leftScore : rightScore} pts</strong>
              </div>
              <div className="doubleBoardBoard">
                {rows.flat().map((cell) => {
                  const isSelected = selectedCellId === cell.id;
                  const showHoverX = cell.status === "wrong" && scaffoldMode === "hover";
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      className={`doubleBoardCell status-${cell.status} ${isSelected ? "selected" : ""} ${
                        turnBoard === boardKey ? "turnActive" : ""
                      } ${showHoverX ? "hoverReveal" : ""}`}
                      onClick={() => handleSelectCell(cell.id)}
                    >
                      <span className="doubleBoardCellValue">{scaffoldLabelForCell(cell, scaffoldMode)}</span>
                      <span className="doubleBoardCellPoints">{cell.points} pts</span>
                      {cell.inspirationBonus > 0 ? (
                        <span className="doubleBoardCellBonus">Inspired +{cell.inspirationBonus}</span>
                      ) : null}
                      {showHoverX ? <span className="doubleBoardHoverText">X</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="doubleBoardCoachNote">
          <strong>{participationMode === "devices" ? "Device mode" : "Project mode"}</strong>
          <p>
            {participationMode === "devices"
              ? "Students can answer the selected board square on-screen while everyone else keeps practicing in the waiting panel."
              : "Project the board for no-tech turns. Students can still use the waiting panel later, or you can ignore devices entirely and run this as a whole-class callout game."}
          </p>
        </div>

        <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Turn Feedback</h3>
          <p style={{ marginTop: "0.5rem" }}>{feedback}</p>
          {selectedCell ? (
            <div className="doubleBoardPromptCard">
              <p className="doubleBoardPromptEyebrow">
                {selectedCell.boardKey === "left" ? "Board A" : "Board B"} · Row {selectedCell.rowIndex + 1} · Col{" "}
                {selectedCell.colIndex + 1}
              </p>
              <h4>{selectedCell.prompt}</h4>
              <div className="ctaRow" style={{ marginTop: "0.85rem" }}>
                {selectedCell.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="btn"
                    onClick={() => answerSelectedCell(choice)}
                  >
                    {selectedCell.formatChoice ? selectedCell.formatChoice(choice) : choice}
                  </button>
                ))}
              </div>
              {selectedPairCell ? (
                <p style={{ marginTop: "0.75rem", opacity: 0.85 }}>
                  Matching square on the other board: {selectedPairCell.points} pts
                  {selectedPairCell.inspirationBonus > 0 ? ` · Inspired +${selectedPairCell.inspirationBonus}` : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p style={{ marginTop: "0.75rem", opacity: 0.8 }}>
              Select a square on the active board to open the current prompt.
            </p>
          )}
        </div>

        <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Class Leaderboard</h3>
          {leaderboardLoading ? <p style={{ marginTop: "0.75rem" }}>Loading leaderboard…</p> : null}
          {!leaderboardLoading && leaderboardRows.length === 0 ? (
            <p style={{ marginTop: "0.75rem" }}>No saved class boards yet.</p>
          ) : null}
          {leaderboardRows.length > 0 ? (
            <div className="list" style={{ marginTop: "0.75rem" }}>
              {leaderboardRows.slice(0, 6).map((row, index) => (
                <div key={`${row.player_id || "player"}-${index}`} className="dataWallRow">
                  <p>
                    <strong>#{index + 1}</strong> {row.display_name || "Student"}
                  </p>
                  <strong>{formatScore(row.score)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="stack">
        <section className="card" style={{ background: "#fff" }}>
          <h2>Waiting Practice</h2>
          <p>
            Keep students moving while another answer is being discussed. This panel always serves a fresh mixed review question.
          </p>
          <div className="doubleBoardPracticeCard">
            <p className="doubleBoardPromptEyebrow">Warm-up prompt</p>
            <h3>{practiceQuestion.prompt}</h3>
            <div className="list" style={{ marginTop: "0.85rem" }}>
              {practiceQuestion.choices.map((choice) => (
                <button key={choice} type="button" className="btn" onClick={() => answerPracticeQuestion(choice)}>
                  {practiceQuestion.formatChoice ? practiceQuestion.formatChoice(choice) : choice}
                </button>
              ))}
            </div>
            <p style={{ marginTop: "0.85rem" }}>{practiceFeedback}</p>
            <div className="ctaRow" style={{ marginTop: "0.85rem" }}>
              <button className="btn" type="button" onClick={() => setPracticeQuestion(buildPracticePrompt())}>
                Skip Practice Question
              </button>
            </div>
          </div>
        </section>

        <section className="card" style={{ background: "#fff" }}>
          <h2>Board Summary</h2>
          <div className="kv compactKv" style={{ marginTop: "0.85rem" }}>
            <div>
              <span>Total Points</span>
              <strong>{totalScore}</strong>
            </div>
            <div>
              <span>Attempts</span>
              <strong>{sessionRef.current.attempts}</strong>
            </div>
            <div>
              <span>Solved Cells</span>
              <strong>
                {solvedCells}/{TOTAL_CELLS}
              </strong>
            </div>
            <div>
              <span>Current Setup</span>
              <strong>{participationMode === "devices" ? "Devices" : "Project"}</strong>
            </div>
          </div>
          {savedStats ? (
            <div className="kv compactKv" style={{ marginTop: "0.85rem" }}>
              <div>
                <span>Games Played</span>
                <strong>{savedStats.sessions_played || 0}</strong>
              </div>
              <div>
                <span>Best</span>
                <strong>{formatScore(savedStats.best_score)}</strong>
              </div>
              <div>
                <span>Average</span>
                <strong>{formatScore(savedStats.average_score)}</strong>
              </div>
              <div>
                <span>Last 10 Avg</span>
                <strong>{formatScore(savedStats.last_10_average)}</strong>
              </div>
            </div>
          ) : null}
          {runComplete ? (
            <p style={{ marginTop: "0.85rem", color: "#0a7a32", fontWeight: 700 }}>
              Board complete. Generate a new pair whenever you are ready.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
