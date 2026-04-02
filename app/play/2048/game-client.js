"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function randomEmptyCell(board) {
  const cells = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) cells.push([r, c]);
    });
  });
  if (cells.length === 0) return null;
  return cells[Math.floor(Math.random() * cells.length)];
}

function spawnTile(board) {
  const next = board.map((row) => [...row]);
  const cell = randomEmptyCell(next);
  if (!cell) return next;
  const [r, c] = cell;
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function freshBoard() {
  return spawnTile(spawnTile(Array.from({ length: 4 }, () => Array(4).fill(0))));
}

function slideLine(line) {
  const compact = line.filter(Boolean);
  let score = 0;
  const merged = [];

  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] && compact[i] === compact[i + 1]) {
      const value = compact[i] * 2;
      merged.push(value);
      score += value;
      i += 1;
    } else {
      merged.push(compact[i]);
    }
  }

  while (merged.length < 4) merged.push(0);
  return { line: merged, score };
}

function rotateLeft(board) {
  return board[0].map((_, idx) => board.map((row) => row[3 - idx]));
}

function rotateRight(board) {
  return board[0].map((_, idx) => board.map((row) => row[idx]).reverse());
}

function moveBoard(board, direction) {
  let working = board.map((row) => [...row]);

  if (direction === "up") working = rotateLeft(working);
  if (direction === "down") working = rotateRight(working);
  if (direction === "right") working = working.map((row) => [...row].reverse());

  let delta = 0;
  const slidden = working.map((row) => {
    const result = slideLine(row);
    delta += result.score;
    return result.line;
  });

  let restored = slidden;
  if (direction === "up") restored = rotateRight(slidden);
  if (direction === "down") restored = rotateLeft(slidden);
  if (direction === "right") restored = slidden.map((row) => [...row].reverse());

  const changed = JSON.stringify(restored) !== JSON.stringify(board);
  return { board: changed ? spawnTile(restored) : board, changed, scoreDelta: delta };
}

function gameOver(board) {
  return ["left", "right", "up", "down"].every((dir) => !moveBoard(board, dir).changed);
}

function bestTileValue(board) {
  return Math.max(...board.flat());
}

function statusTone(label) {
  if (label.toLowerCase().includes("saved")) return "var(--navy)";
  if (label.toLowerCase().includes("could not")) return "var(--red)";
  return "var(--navy)";
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export default function Game2048Client({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [board, setBoard] = useState(freshBoard);
  const [score, setScore] = useState(0);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [status, setStatus] = useState("");
  const [isWon, setIsWon] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [localBest, setLocalBest] = useState(() =>
    Math.max(Number(personalStats?.best_score || 0), 0)
  );

  const touchStartRef = useRef(null);
  const savedResultsRef = useRef(new Set());
  const scoreRef = useRef(score);
  const boardRef = useRef(board);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const bestTile = useMemo(() => bestTileValue(board), [board]);

  const loadLeaderboard = useCallback(
    async (nextCourseId) => {
      if (!nextCourseId) {
        setLeaderboardRows([]);
        return;
      }

      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `/api/play/leaderboard?gameSlug=2048&courseId=${encodeURIComponent(nextCourseId)}`
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
    async (finalScore, finalBoard, result = "finished") => {
      const signature = `${result}:${finalScore}:${bestTileValue(finalBoard)}`;
      if (savedResultsRef.current.has(signature)) return;
      savedResultsRef.current.add(signature);

      try {
        setStatus("Saving score...");
        const response = await fetch("/api/play/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameSlug: "2048",
            score: finalScore,
            result,
            courseId: courseId || null,
            metadata: {
              bestTile: bestTileValue(finalBoard),
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Could not save score.");
        }

        setStatus("Score saved.");
        setLocalBest((current) => Math.max(current, Number(payload.stats?.best_score || 0)));
        await loadLeaderboard(courseId);
      } catch (error) {
        setStatus(error.message || "Could not save score.");
      }
    },
    [courseId, loadLeaderboard]
  );

  const startNewGame = useCallback(
    (resultToSave = null) => {
      if (resultToSave && scoreRef.current > 0) {
        saveSession(scoreRef.current, boardRef.current, resultToSave);
      }
      setBoard(freshBoard());
      setScore(0);
      setIsWon(false);
      setIsGameOver(false);
      setShowOverlay(false);
      savedResultsRef.current.clear();
      setStatus("");
    },
    [saveSession]
  );

  async function handleCourseChange(nextCourseId) {
    if (nextCourseId === courseId) return;
    if (scoreRef.current > 0) {
      await saveSession(scoreRef.current, boardRef.current, "switched_class");
    }
    setCourseId(nextCourseId);
    setBoard(freshBoard());
    setScore(0);
    setIsWon(false);
    setIsGameOver(false);
    setShowOverlay(false);
    savedResultsRef.current.clear();
    setStatus(nextCourseId ? "Class updated. Start a fresh board." : "Leaderboard cleared. Start a fresh board.");
  }

  const applyMove = useCallback(
    (direction) => {
      if (isGameOver) return;

      const currentBoard = boardRef.current;
      const currentScore = scoreRef.current;
      const result = moveBoard(currentBoard, direction);
      if (!result.changed) return;

      const nextScore = currentScore + result.scoreDelta;
      const nextBoard = result.board;
      const nextBestTile = bestTileValue(nextBoard);
      const reached2048 = nextBestTile >= 2048;
      const ended = gameOver(nextBoard);

      setBoard(nextBoard);
      setScore(nextScore);
      setLocalBest((current) => Math.max(current, nextScore));

      if (reached2048 && !isWon) {
        setIsWon(true);
        setShowOverlay(true);
        setStatus("You made 2048!");
        saveSession(nextScore, nextBoard, "milestone_2048");
      } else if (ended) {
        setIsGameOver(true);
        setShowOverlay(true);
        setStatus("Game over.");
        saveSession(nextScore, nextBoard, "finished");
      } else {
        setStatus("");
      }
    },
    [isGameOver, isWon, saveSession]
  );

  useEffect(() => {
    function onKeyDown(event) {
      const map = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      applyMove(direction);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyMove]);

  function handleTouchStart(event) {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      applyMove(dx > 0 ? "right" : "left");
    } else {
      applyMove(dy > 0 ? "down" : "up");
    }
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Current Game</h2>
          <div className="ctaRow" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => saveSession(score, board, "manual_save")} type="button">
              Save Now
            </button>
            <button className="btn" onClick={() => startNewGame("reset")} type="button">
              New Game
            </button>
          </div>
        </div>

        <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
          <div className="pill">Score: {score}</div>
          <div className="pill">Current Best Tile: {bestTile}</div>
          <div className="pill">Saved Best Score: {localBest}</div>
          <select
            className="input"
            style={{ maxWidth: "18rem" }}
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
          >
            <option value="">No class leaderboard</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          Swipe on mobile or use the arrow keys on desktop. Changing the class context
          starts a fresh board so scores stay tied to the right class.
        </p>

        <div
          className="game2048Wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="game2048Board">
            {board.flat().map((value, index) => (
              <div key={index} className={`game2048Tile value${value || 0}`}>
                {value || ""}
              </div>
            ))}
          </div>

          {showOverlay ? (
            <div className="game2048Overlay">
              <h3>{isGameOver ? "Game Over" : "2048 Reached!"}</h3>
              <p>
                {isGameOver
                  ? "Nice run. Start another one and keep climbing."
                  : "Huge win. You can keep playing or start a fresh board."}
              </p>
              <div className="ctaRow" style={{ justifyContent: "center" }}>
                {!isGameOver ? (
                  <button className="btn" type="button" onClick={() => setShowOverlay(false)}>
                    Keep Playing
                  </button>
                ) : null}
                <button className="btn primary" type="button" onClick={() => startNewGame(null)}>
                  Start Fresh
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="game2048Controls">
          <div />
          <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("up")}>
            Up
          </button>
          <div />
          <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("left")}>
            Left
          </button>
          <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("down")}>
            Down
          </button>
          <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("right")}>
            Right
          </button>
        </div>

        <p style={{ marginTop: "0.75rem" }}>
          Use your arrow keys or swipe on the board. Saving with a class selected lets
          teachers see your progress.
        </p>
        {status ? (
          <p style={{ marginTop: "0.4rem", color: statusTone(status), fontWeight: 700 }}>
            {status}
          </p>
        ) : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Your Stats</h2>
        {personalStats ? (
          <div className="kv compactKv">
            <div>
              <span>Games</span>
              <strong>{personalStats.sessions_played}</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{formatScore(personalStats.average_score)}</strong>
            </div>
            <div>
              <span>Last 10</span>
              <strong>{formatScore(personalStats.last_10_average)}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{personalStats.best_score}</strong>
            </div>
          </div>
        ) : (
          <p>No saved games yet.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>
          {courseId ? "Class Leaderboard" : "Leaderboard"}
        </h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to see your classmates here.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Save a run to get the leaderboard started.</p>
          ) : null}
          {leaderboardRows.map((row, index) => (
            <div key={row.player_id} className="card" style={{ background: "#f9fbfc" }}>
              <strong>
                #{index + 1} {row.display_name || `Student ${String(row.player_id).slice(0, 8)}`}
              </strong>
              <p>
                Avg: {formatScore(row.average_score)} · Last 10: {formatScore(row.last_10_average)} ·
                Best: {row.best_score}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
