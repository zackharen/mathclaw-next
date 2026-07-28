"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSeededRandom } from "@/lib/student-games/seeded-random";
import {
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

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

function buildBoard(boardSize, mineCount, safeCell = null, random = Math.random) {
  const board = createEmptyBoard(boardSize);
  const mineSpots = new Set();
  const safeKey = safeCell ? `${safeCell.row}:${safeCell.col}` : null;

  while (mineSpots.size < mineCount) {
    const spot = `${Math.floor(random() * boardSize)}:${Math.floor(random() * boardSize)}`;
    if (spot === safeKey) continue;
    mineSpots.add(spot);
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

function progressPercent(revealedSafeCells, boardSize, mineCount) {
  const safeSquares = boardSize * boardSize - mineCount;
  if (safeSquares <= 0) return 0;
  return Math.round((revealedSafeCells / safeSquares) * 100);
}

export default function MinesweeperClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  initialSeed,
}) {
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [board, setBoard] = useState(() =>
    buildBoard(
      DEFAULT_BOARD_SIZE,
      mineCountForSize(DEFAULT_BOARD_SIZE),
      null,
      createSeededRandom(initialSeed)
    )
  );
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

    let activeBoard = boardRef.current;
    let cell = activeBoard[row][col];
    if (cell.revealed || cell.flagged) return;

    if (sessionRef.current.moves === 0 && cell.mine) {
      activeBoard = buildBoard(boardSize, mineCount, { row, col });
      boardRef.current = activeBoard;
      setBoard(activeBoard);
      cell = activeBoard[row][col];
      setStatus("First move is always safe. Keep going.");
    }

    if (cell.mine) {
      const nextBoard = revealAllMines(cloneBoard(activeBoard));
      await finishRun(nextBoard, "lost", "Boom. You hit a mine.");
      return;
    }

    const result = revealCascade(activeBoard, row, col);
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
  const minesRemaining = Math.max(0, mineCount - flagsUsed);
  const progress = progressPercent(sessionRef.current.revealedSafeCells, boardSize, mineCount);
  const statusTone = runState === "won" ? "won" : runState === "lost" ? "lost" : "active";
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class leaderboard";

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        <GameStage
          eyebrow={`${boardSize} × ${boardSize} board`}
          title="Minefield"
          status={runState === "won" ? "Board cleared" : runState === "lost" ? "Mine hit" : `${mode === "flag" ? "Flag" : "Reveal"} mode`}
          progress={progress}
          progressLabel={`${sessionRef.current.revealedSafeCells} safe squares revealed`}
          stats={[
            { label: "Mines left", value: minesRemaining },
            { label: "Time", value: `${elapsedSeconds}s` },
            { label: "Moves", value: moveCount },
          ]}
        >
          <div className="minesweeperPlayfield">
            <div className="minesweeperModeBar">
              <div className="gameSetupChoiceRow">
            <button
              className={`btn ${mode === "reveal" ? "primary" : "ghost"}`}
              type="button"
              onClick={() => setMode("reveal")}
            >
                  Reveal
            </button>
            <button
              className={`btn ${mode === "flag" ? "primary" : "ghost"}`}
              type="button"
              onClick={() => setMode("flag")}
            >
                  Flag
            </button>
              </div>
              <span>{flagsUsed}/{mineCount} flags placed</span>
            </div>

            <div className="minesweeperBoardViewport">
              <div
                className="minesweeperBoard"
                style={{
                  gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                  width: boardSize <= 10 ? "min(100%, 32rem)" : `${boardSize * 30}px`,
                  maxWidth: boardSize <= 10 ? "32rem" : "none",
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
                        aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}${label ? `, ${label}` : ""}`}
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <p className="minesweeperHelp">
              Tap to reveal. Right-click to flag on desktop, or switch to Flag mode on touch screens.
            </p>
            {status ? (
              <div className={`minesweeperStatusBanner ${statusTone}`} aria-live="polite">
                <strong>{status}</strong>
              </div>
            ) : null}
          </div>
        </GameStage>
      </div>

      <div className="gameWorkspaceRail">
        <GameSidePanel eyebrow="Setup" title="Choose the minefield">
          <p className="gameSetupSummary">{boardSize} × {boardSize} · {mineCount} mines · {courseSummary}</p>
          <div className="gameSetupOptions">
            <label>
              Board size
              <select className="input" value={String(boardSize)} onChange={(event) => handleBoardSizeChange(Number(event.target.value))}>
                {BOARD_SIZE_OPTIONS.map((sizeOption) => (
                  <option key={sizeOption} value={sizeOption}>{sizeOption} × {sizeOption}</option>
                ))}
              </select>
            </label>
            <label>
              Class context
              <select className="input" value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                <option value="">No class leaderboard</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" type="button" onClick={() => startNewBoard("reset")}>
              New Board
            </button>
          </div>
        </GameSidePanel>

        <GameSidePanel eyebrow="Progress" title="Your stats">
          {savedStats ? (
            <div className="gameSideStats">
              <div><span>Games</span><strong>{savedStats.sessions_played}</strong></div>
              <div><span>Average</span><strong>{formatScore(savedStats.average_score)}</strong></div>
              <div><span>Last 10</span><strong>{formatScore(savedStats.last_10_average)}</strong></div>
              <div><span>Best</span><strong>{savedStats.best_score}</strong></div>
            </div>
          ) : <p>No saved boards yet.</p>}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to compare boards.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? <p>No class scores yet.</p> : null}
              {leaderboardRows.map((row, index) => (
                <div key={row.player_id} className="gameLeaderboardRow">
                  <strong>#{index + 1}</strong><span>{row.display_name}</span><strong>{formatScore(row.best_score)}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>
      </div>
    </GameWorkspace>
  );
}
