"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MIN_BOARD_SIZE = 6;
const MAX_BOARD_SIZE = 22;
const DEFAULT_BOARD_SIZE = 9;
const BOARD_SIZE_OPTIONS = Array.from(
  { length: MAX_BOARD_SIZE - MIN_BOARD_SIZE + 1 },
  (_, index) => MIN_BOARD_SIZE + index
);

function mineCountForSize(boardSize) {
  return Math.min(boardSize * boardSize - 1, Math.max(5, Math.round(boardSize * boardSize * 0.12)));
}

function createEmptyBoard(boardSize) {
  return Array.from({ length: boardSize }, () =>
    Array.from({ length: boardSize }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );
}

function neighbors(row, col, boardSize) {
  const cells = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (
        nextRow >= 0 &&
        nextRow < boardSize &&
        nextCol >= 0 &&
        nextCol < boardSize
      ) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function buildBoard(boardSize, mineCount) {
  const board = createEmptyBoard(boardSize);
  const mineSpots = new Set();

  while (mineSpots.size < mineCount) {
    mineSpots.add(`${Math.floor(Math.random() * boardSize)}:${Math.floor(Math.random() * boardSize)}`);
  }

  mineSpots.forEach((spot) => {
    const [row, col] = spot.split(":").map(Number);
    board[row][col].mine = true;
  });

  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      board[row][col].adjacent = neighbors(row, col, boardSize).filter(
        ([neighborRow, neighborCol]) => board[neighborRow][neighborCol].mine
      ).length;
    }
  }

  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function revealCascade(board, startRow, startCol) {
  const nextBoard = cloneBoard(board);
  const boardSize = nextBoard.length;
  const queue = [[startRow, startCol]];
  let revealedCount = 0;

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const cell = nextBoard[row][col];
    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealedCount += 1;

    if (cell.adjacent === 0 && !cell.mine) {
      neighbors(row, col, boardSize).forEach(([neighborRow, neighborCol]) => {
        const neighbor = nextBoard[neighborRow][neighborCol];
        if (!neighbor.revealed && !neighbor.mine) {
          queue.push([neighborRow, neighborCol]);
        }
      });
    }
  }

  return { board: nextBoard, revealedCount };
}

function revealAllMines(board) {
  return board.map((row) =>
    row.map((cell) => (cell.mine ? { ...cell, revealed: true } : cell))
  );
}

function countRevealedSafeCells(board) {
  return board.flat().filter((cell) => cell.revealed && !cell.mine).length;
}

function countFlags(board) {
  return board.flat().filter((cell) => cell.flagged).length;
}

function isWin(board, mineCount) {
  return countRevealedSafeCells(board) === board.length * board.length - mineCount;
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function calculateScore(revealedSafeCells, elapsedSeconds, result) {
  if (result === "won") {
    return revealedSafeCells + Math.max(0, 180 - elapsedSeconds);
  }
  return revealedSafeCells;
}

function numberClassName(cell) {
  if (!cell?.revealed || cell.adjacent <= 0 || cell.mine) return "";
  return `isCount${cell.adjacent}`;
}

export default function MinesweeperClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [board, setBoard] = useState(() => buildBoard(DEFAULT_BOARD_SIZE, mineCountForSize(DEFAULT_BOARD_SIZE)));
  const [status, setStatus] = useState("Reveal every safe square and flag the mines.");
  const [runState, setRunState] = useState("active");
  const [mode, setMode] = useState("reveal");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const mineCount = useMemo(() => mineCountForSize(boardSize), [boardSize]);

  const timerRef = useRef(null);
  const boardRef = useRef(board);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
    boardSize: DEFAULT_BOARD_SIZE,
    moves: 0,
    revealedSafeCells: 0,
    elapsedSeconds: 0,
    result: "active",
  });
  const savedRunRef = useRef(false);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const score = useMemo(
    () =>
      calculateScore(
        sessionRef.current.revealedSafeCells,
        elapsedSeconds,
        runState === "won" ? "won" : "active"
      ),
    [elapsedSeconds, runState]
  );

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=minesweeper&courseId=${encodeURIComponent(nextCourseId)}`
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
      if (!snapshot || snapshot.moves <= 0 || savedRunRef.current) {
        return null;
      }

      savedRunRef.current = true;
      const sessionScore = calculateScore(
        snapshot.revealedSafeCells,
        snapshot.elapsedSeconds,
        snapshot.result
      );

      const response = await fetch("/api/play/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: options.keepalive === true,
        body: JSON.stringify({
          gameSlug: "minesweeper",
          score: sessionScore,
          result: snapshot.result,
          courseId: snapshot.courseId || null,
          metadata: {
            moves: snapshot.moves,
            revealedSafeCells: snapshot.revealedSafeCells,
            elapsedSeconds: snapshot.elapsedSeconds,
            boardSize: snapshot.boardSize,
            mineCount: mineCountForSize(snapshot.boardSize),
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
    if (runState !== "active" || moveCount <= 0) {
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
  }, [moveCount, runState]);

  useEffect(() => {
    function handlePageHide() {
      const snapshot = { ...sessionRef.current };
      if (snapshot.moves <= 0) return;
      saveSession({
        ...snapshot,
        result:
          snapshot.result === "active" ? "left_page" : snapshot.result,
      }, { keepalive: true }).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [saveSession]);

  async function startNewBoard(resultToSave = null) {
    const previousSnapshot = { ...sessionRef.current };

    if (resultToSave && previousSnapshot.moves > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? resultToSave : previousSnapshot.result,
        });
      } catch (error) {
        setStatus(error.message || "Could not save that run.");
        return;
      }
    }

    savedRunRef.current = false;
    setBoard(buildBoard(boardSize, mineCountForSize(boardSize)));
    setRunState("active");
    setElapsedSeconds(0);
    setMoveCount(0);
    setMode("reveal");
    setStatus("Fresh board ready. Reveal every safe square and flag the mines.");
    sessionRef.current = {
      courseId,
      boardSize,
      moves: 0,
      revealedSafeCells: 0,
      elapsedSeconds: 0,
      result: "active",
    };
  }

  async function handleCourseChange(nextCourseId) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.moves > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? "switched_class" : previousSnapshot.result,
        });
      } catch (error) {
        setStatus(error.message || "Could not save that run.");
        return;
      }
    }

    savedRunRef.current = false;
    setCourseId(nextCourseId);
    setBoard(buildBoard(boardSize, mineCountForSize(boardSize)));
    setRunState("active");
    setElapsedSeconds(0);
    setMoveCount(0);
    setStatus("Class updated. Start a fresh board.");
    sessionRef.current = {
      courseId: nextCourseId,
      boardSize,
      moves: 0,
      revealedSafeCells: 0,
      elapsedSeconds: 0,
      result: "active",
    };
  }

  async function handleBoardSizeChange(nextBoardSize) {
    const previousSnapshot = { ...sessionRef.current };
    if (previousSnapshot.moves > 0 && !savedRunRef.current) {
      try {
        await saveSession({
          ...previousSnapshot,
          result: previousSnapshot.result === "active" ? "switched_size" : previousSnapshot.result,
        });
      } catch (error) {
        setStatus(error.message || "Could not save that run.");
        return;
      }
    }

    savedRunRef.current = false;
    setBoardSize(nextBoardSize);
    setBoard(buildBoard(nextBoardSize, mineCountForSize(nextBoardSize)));
    setRunState("active");
    setElapsedSeconds(0);
    setMoveCount(0);
    setMode("reveal");
    setStatus(`Board size updated to ${nextBoardSize}x${nextBoardSize}.`);
    sessionRef.current = {
      courseId,
      boardSize: nextBoardSize,
      moves: 0,
      revealedSafeCells: 0,
      elapsedSeconds: 0,
      result: "active",
    };
  }

  async function finishRun(nextBoard, result, nextStatus) {
    const snapshot = {
      ...sessionRef.current,
      revealedSafeCells: countRevealedSafeCells(nextBoard),
      elapsedSeconds,
      result,
    };
    sessionRef.current = snapshot;
    setRunState(result === "won" ? "won" : "lost");
    setBoard(nextBoard);
    setStatus(nextStatus);

    try {
      await saveSession(snapshot);
    } catch (error) {
      setStatus(error.message || "Could not save that run.");
    }
  }

  async function revealCell(row, col) {
    if (runState !== "active") return;

    const cell = boardRef.current[row][col];
    if (cell.revealed || cell.flagged) return;

    if (cell.mine) {
      const nextBoard = revealAllMines(cloneBoard(boardRef.current));
      await finishRun(nextBoard, "lost", "Boom. You hit a mine.");
      return;
    }

    const result = revealCascade(boardRef.current, row, col);
    const nextBoard = result.board;
    const nextRevealedSafeCells = countRevealedSafeCells(nextBoard);

    sessionRef.current = {
      ...sessionRef.current,
      courseId,
      boardSize,
      moves: sessionRef.current.moves + 1,
      revealedSafeCells: nextRevealedSafeCells,
      elapsedSeconds,
      result: "active",
    };
    setMoveCount(sessionRef.current.moves);

    setBoard(nextBoard);
    setStatus(result.revealedCount > 1 ? "Nice clear." : "Safe move.");

    if (isWin(nextBoard, mineCount)) {
      await finishRun(nextBoard, "won", "Board cleared. You found every mine.");
    }
  }

  function toggleFlag(row, col) {
    if (runState !== "active") return;

    const nextBoard = cloneBoard(boardRef.current);
    const cell = nextBoard[row][col];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;

    sessionRef.current = {
      ...sessionRef.current,
      courseId,
      boardSize,
      moves: sessionRef.current.moves + 1,
      revealedSafeCells: countRevealedSafeCells(nextBoard),
      elapsedSeconds,
      result: "active",
    };
    setMoveCount(sessionRef.current.moves);

    setBoard(nextBoard);
    setStatus(cell.flagged ? "Flag placed." : "Flag removed.");
  }

  function handleCellAction(row, col) {
    if (mode === "flag") {
      toggleFlag(row, col);
      return;
    }
    revealCell(row, col);
  }

  const flagsUsed = countFlags(board);
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class leaderboard";

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Board</h2>
          <div className="ctaRow" style={{ marginTop: 0 }}>
            <button
              className={`btn ${mode === "reveal" ? "primary" : "ghost"}`}
              type="button"
              onClick={() => setMode("reveal")}
            >
              Reveal Mode
            </button>
            <button
              className={`btn ${mode === "flag" ? "primary" : "ghost"}`}
              type="button"
              onClick={() => setMode("flag")}
            >
              Flag Mode
            </button>
            <button className="btn primary" type="button" onClick={() => startNewBoard("reset")}>
              New Board
            </button>
          </div>
        </div>
        <div className="pillRow" style={{ marginTop: "0.75rem" }}>
          <span className="pill">Mode: {mode === "flag" ? "Flag" : "Reveal"}</span>
          <span className="pill">Board: {boardSize}x{boardSize}</span>
          <span className="pill">Flags: {flagsUsed}/{mineCount}</span>
          <span className="pill">Time: {elapsedSeconds}s</span>
          <span className="pill">Safe Squares: {sessionRef.current.revealedSafeCells}</span>
        </div>
        <details className="gameControlsDetails" style={{ marginTop: "0.75rem" }}>
          <summary className="gameControlsSummary">
            <div>
              <h2 style={{ fontSize: "1.05rem" }}>Board Controls</h2>
              <p>
                {String(boardSize) + " x " + String(boardSize) + " board · " + courseSummary}
              </p>
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
              value={String(boardSize)}
              onChange={(event) => handleBoardSizeChange(Number(event.target.value))}
            >
              {BOARD_SIZE_OPTIONS.map((sizeOption) => (
                <option key={sizeOption} value={sizeOption}>
                  {sizeOption} x {sizeOption}
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
        <div
          className="minesweeperBoard"
          style={{
            marginTop: "1rem",
            gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
            maxWidth: boardSize <= 10 ? "32rem" : boardSize <= 16 ? "40rem" : "44rem",
          }}
        >
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              let label = "";
              if (cell.revealed && cell.mine) label = "X";
              else if (cell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
              else if (cell.flagged) label = "🚩";

              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={`minesweeperCell ${cell.revealed ? "isRevealed" : ""} ${
                    cell.mine && cell.revealed ? "isMine" : ""
                  } ${cell.flagged ? "isFlagged" : ""} ${numberClassName(cell)}`}
                  onClick={() => handleCellAction(rowIndex, colIndex)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    toggleFlag(rowIndex, colIndex);
                  }}
                >
                  {label}
                </button>
              );
            })
          )}
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Tap squares to reveal them. On desktop, right-click places flags. On mobile,
          switch into Flag Mode when you want to mark mines.
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
          <p>No saved boards yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>{courseId ? "Class Leaderboard" : "Leaderboard"}</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to compare boards with classmates.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Clear a few squares to get it started.</p>
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
