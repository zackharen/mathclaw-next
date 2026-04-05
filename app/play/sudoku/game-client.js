"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", clues: 40, bonus: 200 },
  { value: "medium", label: "Medium", clues: 32, bonus: 400 },
  { value: "hard", label: "Hard", clues: 26, bonus: 700 },
];
const DEFAULT_DIFFICULTY = DIFFICULTY_OPTIONS[1].value;

function emptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function randomDigits() {
  const values = [...DIGITS];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function isValidMove(grid, rowIndex, colIndex, value) {
  for (let index = 0; index < 9; index += 1) {
    if (grid[rowIndex][index] === value) return false;
    if (grid[index][colIndex] === value) return false;
  }

  const boxRow = Math.floor(rowIndex / 3) * 3;
  const boxCol = Math.floor(colIndex / 3) * 3;
  for (let row = boxRow; row < boxRow + 3; row += 1) {
    for (let col = boxCol; col < boxCol + 3; col += 1) {
      if (grid[row][col] === value) return false;
    }
  }

  return true;
}

function fillSolvedBoard(grid, cellIndex = 0) {
  if (cellIndex >= 81) return true;
  const rowIndex = Math.floor(cellIndex / 9);
  const colIndex = cellIndex % 9;

  if (grid[rowIndex][colIndex] !== 0) {
    return fillSolvedBoard(grid, cellIndex + 1);
  }

  for (const value of randomDigits()) {
    if (!isValidMove(grid, rowIndex, colIndex, value)) continue;
    grid[rowIndex][colIndex] = value;
    if (fillSolvedBoard(grid, cellIndex + 1)) {
      return true;
    }
    grid[rowIndex][colIndex] = 0;
  }

  return false;
}

function buildSolvedBoard() {
  const grid = emptyGrid();
  fillSolvedBoard(grid);
  return grid;
}

function buildPuzzle(difficulty) {
  const difficultyConfig = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty) || DIFFICULTY_OPTIONS[1];
  const solution = buildSolvedBoard();
  const puzzle = cloneGrid(solution);
  const coordinates = [];

  for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
    for (let colIndex = 0; colIndex < 9; colIndex += 1) {
      coordinates.push([rowIndex, colIndex]);
    }
  }

  for (let index = coordinates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [coordinates[index], coordinates[swapIndex]] = [coordinates[swapIndex], coordinates[index]];
  }

  const cellsToRemove = 81 - difficultyConfig.clues;
  for (let index = 0; index < cellsToRemove; index += 1) {
    const [rowIndex, colIndex] = coordinates[index];
    puzzle[rowIndex][colIndex] = 0;
  }

  return { puzzle, solution, clues: difficultyConfig.clues };
}

function countCorrectCells(board, solution) {
  let total = 0;
  for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
    for (let colIndex = 0; colIndex < 9; colIndex += 1) {
      if (board[rowIndex][colIndex] !== 0 && board[rowIndex][colIndex] === solution[rowIndex][colIndex]) {
        total += 1;
      }
    }
  }
  return total;
}

function countFilledCells(board) {
  return board.flat().filter(Boolean).length;
}

function countPlayerFilledCells(board, clueCount) {
  return Math.max(0, countFilledCells(board) - clueCount);
}

function countPlayerCorrectCells(board, solution, clueCount) {
  return Math.max(0, countCorrectCells(board, solution) - clueCount);
}

function isSolved(board, solution) {
  return countCorrectCells(board, solution) === 81;
}

function calculateScore(snapshot) {
  if (!snapshot) return 0;
  const difficultyConfig = DIFFICULTY_OPTIONS.find((option) => option.value === snapshot.difficulty) || DIFFICULTY_OPTIONS[1];
  const playerCorrectCells = Math.max(0, Number(snapshot.playerCorrectCells || 0));
  const playerFilledCells = Math.max(0, Number(snapshot.playerFilledCells || 0));
  const progressScore = playerCorrectCells * 10;
  const filledBonus = Math.max(0, playerFilledCells - playerCorrectCells) * 2;

  if (snapshot.result === "won") {
    return Math.max(
      100,
      1000 + difficultyConfig.bonus - snapshot.elapsedSeconds * 2 - snapshot.mistakes * 30
    );
  }

  return progressScore + filledBonus;
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatDifficultyLabel(value) {
  return DIFFICULTY_OPTIONS.find((option) => option.value === value)?.label || "Medium";
}

function selectionSummary(selectedDigit) {
  if (selectedDigit === 0) return "Erase";
  return `Digit ${selectedDigit}`;
}

export default function SudokuClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const initialPuzzle = useMemo(() => buildPuzzle(DEFAULT_DIFFICULTY), []);
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [puzzle, setPuzzle] = useState(initialPuzzle.puzzle);
  const [solution, setSolution] = useState(initialPuzzle.solution);
  const [board, setBoard] = useState(initialPuzzle.puzzle);
  const [selectedCell, setSelectedCell] = useState([0, 0]);
  const [selectedDigit, setSelectedDigit] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState("Fill the grid so every row, column, and box uses digits 1 through 9.");
  const [runState, setRunState] = useState("active");
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);

  const timerRef = useRef(null);
  const boardRef = useRef(board);
  const solutionRef = useRef(solution);
  const puzzleRef = useRef(puzzle);
  const selectedCellRef = useRef(selectedCell);
  const savedRunRef = useRef(false);
  const initialClueCount = useMemo(() => countFilledCells(initialPuzzle.puzzle), [initialPuzzle]);

  const sessionRef = useRef({
    courseId: initialCourseId || "",
    difficulty: DEFAULT_DIFFICULTY,
    elapsedSeconds: 0,
    mistakes: 0,
    clueCount: initialClueCount,
    correctCells: countCorrectCells(initialPuzzle.puzzle, initialPuzzle.solution),
    filledCells: countFilledCells(initialPuzzle.puzzle),
    playerCorrectCells: countPlayerCorrectCells(initialPuzzle.puzzle, initialPuzzle.solution, initialClueCount),
    playerFilledCells: countPlayerFilledCells(initialPuzzle.puzzle, initialClueCount),
    result: "active",
  });

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    solutionRef.current = solution;
  }, [solution]);

  useEffect(() => {
    puzzleRef.current = puzzle;
  }, [puzzle]);

  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    sessionRef.current = {
      ...sessionRef.current,
      elapsedSeconds,
      mistakes,
      courseId,
      difficulty,
      correctCells: countCorrectCells(board, solution),
      filledCells: countFilledCells(board),
      playerCorrectCells: countPlayerCorrectCells(board, solution, sessionRef.current.clueCount),
      playerFilledCells: countPlayerFilledCells(board, sessionRef.current.clueCount),
      result: runState,
    };
  }, [board, solution, mistakes, elapsedSeconds, courseId, difficulty, runState]);

  const completionPercent = useMemo(() => {
    const clueCount = sessionRef.current.clueCount || 0;
    const totalOpenCells = Math.max(1, 81 - clueCount);
    return Math.round((countPlayerCorrectCells(board, solution, clueCount) / totalOpenCells) * 100);
  }, [board, solution]);

  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class leaderboard";

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=sudoku&courseId=${encodeURIComponent(nextCourseId)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load class leaderboard.");
      }
      setLeaderboardRows(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch (error) {
      setStatus(error.message || "Could not load class leaderboard.");
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

  const saveSession = useCallback(async (snapshot, options = {}) => {
    if (!snapshot || snapshot.playerFilledCells <= 0 || savedRunRef.current) {
      return null;
    }

    savedRunRef.current = true;
    const score = calculateScore(snapshot);

    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: options.keepalive === true,
      body: JSON.stringify({
        gameSlug: "sudoku",
        score,
        result: snapshot.result,
        courseId: snapshot.courseId || null,
        metadata: {
          difficulty: snapshot.difficulty,
          elapsedSeconds: snapshot.elapsedSeconds,
          mistakes: snapshot.mistakes,
          correctCells: snapshot.correctCells,
          filledCells: snapshot.filledCells,
          playerCorrectCells: snapshot.playerCorrectCells,
          playerFilledCells: snapshot.playerFilledCells,
          clueCount: snapshot.clueCount,
          completionPercent: Math.round((snapshot.playerCorrectCells / Math.max(1, 81 - snapshot.clueCount)) * 100),
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

    await loadLeaderboard(snapshot.courseId || "");
    return payload;
  }, [loadLeaderboard]);

  useEffect(() => {
    function handleBeforeUnload() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.playerFilledCells > 0 && !savedRunRef.current && snapshot.result !== "won") {
        saveSession({ ...snapshot, result: "left_page" }, { keepalive: true }).catch(() => {});
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [saveSession]);

  const startNewPuzzle = useCallback(async (nextDifficulty = difficulty, resultToSave = "reset") => {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.playerFilledCells > 0 && !savedRunRef.current && previousSnapshot.result !== "won") {
      try {
        await saveSession({ ...previousSnapshot, result: resultToSave });
      } catch (error) {
        setStatus(error.message || "Could not save that puzzle.");
      }
    }

    const nextPuzzle = buildPuzzle(nextDifficulty);
    savedRunRef.current = false;
    setDifficulty(nextDifficulty);
    setPuzzle(nextPuzzle.puzzle);
    setSolution(nextPuzzle.solution);
    setBoard(nextPuzzle.puzzle);
    setSelectedCell([0, 0]);
    setSelectedDigit(0);
    setMistakes(0);
    setElapsedSeconds(0);
    setRunState("active");
    setStatus(`New ${formatDifficultyLabel(nextDifficulty).toLowerCase()} Sudoku ready.`);
    const nextClueCount = countFilledCells(nextPuzzle.puzzle);
    sessionRef.current = {
      courseId,
      difficulty: nextDifficulty,
      elapsedSeconds: 0,
      mistakes: 0,
      clueCount: nextClueCount,
      correctCells: countCorrectCells(nextPuzzle.puzzle, nextPuzzle.solution),
      filledCells: countFilledCells(nextPuzzle.puzzle),
      playerCorrectCells: countPlayerCorrectCells(nextPuzzle.puzzle, nextPuzzle.solution, nextClueCount),
      playerFilledCells: countPlayerFilledCells(nextPuzzle.puzzle, nextClueCount),
      result: "active",
    };
  }, [courseId, difficulty, saveSession]);

  const handleCourseChange = useCallback(async (nextCourseId) => {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.playerFilledCells > 0 && !savedRunRef.current && previousSnapshot.result !== "won") {
      try {
        await saveSession({ ...previousSnapshot, result: "switched_class" });
      } catch (error) {
        setStatus(error.message || "Could not save that puzzle.");
      }
    }

    savedRunRef.current = false;
    setCourseId(nextCourseId);
    sessionRef.current = {
      ...sessionRef.current,
      courseId: nextCourseId,
    };
    loadLeaderboard(nextCourseId);
  }, [loadLeaderboard, saveSession]);

  const applyMove = useCallback(async (rowIndex, colIndex, nextValue) => {
    if (runState === "won") return;
    if (puzzleRef.current[rowIndex][colIndex] !== 0) return;

    const nextBoard = cloneGrid(boardRef.current);
    nextBoard[rowIndex][colIndex] = nextValue;
    const isWrongMove = nextValue !== 0 && nextValue !== solutionRef.current[rowIndex][colIndex];
    const nextMistakes = mistakes + (isWrongMove ? 1 : 0);
    const clueCount = sessionRef.current.clueCount || countFilledCells(puzzleRef.current);
    const nextCorrectCells = countCorrectCells(nextBoard, solutionRef.current);
    const nextFilledCells = countFilledCells(nextBoard);
    const nextPlayerCorrectCells = countPlayerCorrectCells(nextBoard, solutionRef.current, clueCount);
    const nextPlayerFilledCells = countPlayerFilledCells(nextBoard, clueCount);
    const nextSolved = isSolved(nextBoard, solutionRef.current);

    savedRunRef.current = false;
    setBoard(nextBoard);
    setMistakes(nextMistakes);
    setSelectedCell([rowIndex, colIndex]);

    sessionRef.current = {
      ...sessionRef.current,
      mistakes: nextMistakes,
      clueCount,
      correctCells: nextCorrectCells,
      filledCells: nextFilledCells,
      playerCorrectCells: nextPlayerCorrectCells,
      playerFilledCells: nextPlayerFilledCells,
      result: nextSolved ? "won" : "active",
    };

    if (nextSolved) {
      setRunState("won");
      setStatus(`Solved in ${elapsedSeconds}s with ${nextMistakes} mistake${nextMistakes === 1 ? "" : "s"}.`);
      try {
        await saveSession({
          ...sessionRef.current,
          elapsedSeconds,
          result: "won",
        });
      } catch (error) {
        setStatus(error.message || "Solved, but the score could not be saved.");
      }
      return;
    }

    if (isWrongMove) {
      setStatus(`That ${nextValue === 0 ? "erase" : "digit"} does not fit yet. Mistakes: ${nextMistakes}.`);
    } else if (nextValue === 0) {
      setStatus("Cell cleared.");
    } else {
      setStatus("Nice move.");
    }
  }, [elapsedSeconds, mistakes, runState, saveSession]);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }

      const [rowIndex, colIndex] = selectedCellRef.current;
      if (event.key >= "1" && event.key <= "9") {
        setSelectedDigit(Number(event.key));
        applyMove(rowIndex, colIndex, Number(event.key));
      }
      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        setSelectedDigit(0);
        applyMove(rowIndex, colIndex, 0);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCell(([row, col]) => [Math.max(0, row - 1), col]);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCell(([row, col]) => [Math.min(8, row + 1), col]);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedCell(([row, col]) => [row, Math.max(0, col - 1)]);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedCell(([row, col]) => [row, Math.min(8, col + 1)]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyMove]);

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Board</h2>
          <div className="ctaRow" style={{ marginTop: 0 }}>
            <button className="btn" type="button" onClick={() => startNewPuzzle(difficulty, "reset")}>
              New Puzzle
            </button>
          </div>
        </div>
        <div className="pillRow" style={{ marginTop: "0.75rem" }}>
          <span className="pill">Difficulty: {formatDifficultyLabel(difficulty)}</span>
          <span className="pill">Selected: {selectionSummary(selectedDigit)}</span>
          <span className="pill">Mistakes: {mistakes}</span>
          <span className="pill">Time: {elapsedSeconds}s</span>
          <span className="pill">Complete: {completionPercent}%</span>
          <span className="pill">Open Cells: {sessionRef.current.playerFilledCells}/{81 - sessionRef.current.clueCount}</span>
        </div>
        <details className="gameControlsDetails" style={{ marginTop: "0.75rem" }}>
          <summary className="gameControlsSummary">
            <div>
              <h2 style={{ fontSize: "1.05rem" }}>Puzzle Controls</h2>
              <p>{formatDifficultyLabel(difficulty)} puzzle · {courseSummary}</p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody ctaRow">
            <select
              className="input"
              style={{ maxWidth: "12rem" }}
              value={difficulty}
              onChange={(event) => startNewPuzzle(event.target.value, "changed_difficulty")}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ maxWidth: "18rem" }}
              value={courseId}
              onChange={(event) => handleCourseChange(event.target.value)}
            >
              <option value="">No class leaderboard</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>
        </details>
        <div className="sudokuNumberPad" style={{ marginTop: "1rem" }}>
          {DIGITS.map((digit) => (
            <button
              key={digit}
              className={`btn ${selectedDigit === digit ? "primary" : "ghost"}`}
              type="button"
              onClick={() => {
                setSelectedDigit(digit);
                applyMove(selectedCell[0], selectedCell[1], digit);
              }}
            >
              {digit}
            </button>
          ))}
          <button
            className={`btn ${selectedDigit === 0 ? "primary" : "ghost"}`}
            type="button"
            onClick={() => {
              setSelectedDigit(0);
              applyMove(selectedCell[0], selectedCell[1], 0);
            }}
          >
            Erase
          </button>
        </div>
        <div className="sudokuBoard" style={{ marginTop: "1rem" }}>
          {board.map((row, rowIndex) =>
            row.map((value, colIndex) => {
              const fixed = puzzle[rowIndex][colIndex] !== 0;
              const selected = selectedCell[0] === rowIndex && selectedCell[1] === colIndex;
              const wrong = value !== 0 && value !== solution[rowIndex][colIndex];
              const sameDigit = selectedDigit !== 0 && value === selectedDigit;
              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={`sudokuCell ${fixed ? "isFixed" : ""} ${selected ? "isSelected" : ""} ${
                    wrong ? "isWrong" : ""
                  } ${sameDigit ? "isMatching" : ""}`}
                  onClick={() => {
                    setSelectedCell([rowIndex, colIndex]);
                  }}
                >
                  {value || ""}
                </button>
              );
            })
          )}
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Select a square, then tap a digit. You can also use the keyboard numbers 1-9, arrow keys, and delete.
        </p>
        {status ? <p style={{ marginTop: "0.5rem", fontWeight: 700 }}>{status}</p> : null}
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
          <p>No saved puzzles yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>{courseId ? "Class Leaderboard" : "Leaderboard"}</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to compare Sudoku runs with classmates.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class Sudoku scores yet. Solve a few squares to get it started.</p>
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
