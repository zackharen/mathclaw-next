"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BOARD_SIZE = 9;
const MINE_COUNT = 10;

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );
}

function neighbors(row, col) {
  const cells = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (
        nextRow >= 0 &&
        nextRow < BOARD_SIZE &&
        nextCol >= 0 &&
        nextCol < BOARD_SIZE
      ) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function buildBoard() {
  const board = createEmptyBoard();
  const mineSpots = new Set();

  while (mineSpots.size < MINE_COUNT) {
    mineSpots.add(`${Math.floor(Math.random() * BOARD_SIZE)}:${Math.floor(Math.random() * BOARD_SIZE)}`);
  }

  mineSpots.forEach((spot) => {
    const [row, col] = spot.split(":").map(Number);
    board[row][col].mine = true;
  });

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      board[row][col].adjacent = neighbors(row, col).filter(
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
  const queue = [[startRow, startCol]];
  let revealedCount = 0;

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const cell = nextBoard[row][col];
    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealedCount += 1;

    if (cell.adjacent === 0 && !cell.mine) {
      neighbors(row, col).forEach(([neighborRow, neighborCol]) => {
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

function isWin(board) {
  return countRevealedSafeCells(board) === BOARD_SIZE * BOARD_SIZE - MINE_COUNT;
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

export default function MinesweeperClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [board, setBoard] = useState(buildBoard);
  const [status, setStatus] = useState("Reveal every safe square and flag the mines.");
  const [runState, setRunState] = useState("active");
  const [mode, setMode] = useState("reveal");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);

  const timerRef = useRef(null);
  const boardRef = useRef(board);
  const sessionRef = useRef({
    courseId: initialCourseId || "",
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
            boardSize: BOARD_SIZE,
            mineCount: MINE_COUNT,
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
    if (runState !== "active" || sessionRef.current.moves <= 0) {
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
  }, [runState]);

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
    setBoard(buildBoard());
    setRunState("active");
    setElapsedSeconds(0);
    setMode("reveal");
    setStatus("Fresh board ready. Reveal every safe square and flag the mines.");
    sessionRef.current = {
      courseId,
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
    setBoard(buildBoard());
    setRunState("active");
    setElapsedSeconds(0);
    setStatus("Class updated. Start a fresh board.");
    sessionRef.current = {
      courseId: nextCourseId,
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
      moves: sessionRef.current.moves + 1,
      revealedSafeCells: nextRevealedSafeCells,
      elapsedSeconds,
      result: "active",
    };

    setBoard(nextBoard);
    setStatus(result.revealedCount > 1 ? "Nice clear." : "Safe move.");

    if (isWin(nextBoard)) {
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
      moves: sessionRef.current.moves + 1,
      revealedSafeCells: countRevealedSafeCells(nextBoard),
      elapsedSeconds,
      result: "active",
    };

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

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Board</h2>
          <div className="ctaRow" style={{ marginTop: 0 }}>
            <button className="btn" type="button" onClick={() => setMode("reveal")}>
              Reveal Mode
            </button>
            <button className="btn ghost" type="button" onClick={() => setMode("flag")}>
              Flag Mode
            </button>
            <button className="btn primary" type="button" onClick={() => startNewBoard("reset")}>
              New Board
            </button>
          </div>
        </div>
        <div className="pillRow" style={{ marginTop: "0.75rem" }}>
          <span className="pill">Mode: {mode === "flag" ? "Flag" : "Reveal"}</span>
          <span className="pill">Flags: {flagsUsed}/{MINE_COUNT}</span>
          <span className="pill">Time: {elapsedSeconds}s</span>
          <span className="pill">Safe Squares: {sessionRef.current.revealedSafeCells}</span>
        </div>
        <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
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
        <div className="minesweeperBoard" style={{ marginTop: "1rem" }}>
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              let label = "";
              if (cell.revealed && cell.mine) label = "X";
              else if (cell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
              else if (cell.flagged) label = "F";

              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={`minesweeperCell ${cell.revealed ? "isRevealed" : ""} ${
                    cell.mine && cell.revealed ? "isMine" : ""
                  } ${cell.flagged ? "isFlagged" : ""}`}
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
