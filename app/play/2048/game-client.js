"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function randomEmptyCell(board) {
  const cells = [];
  board.forEach((row, r) => row.forEach((cell, c) => { if (!cell) cells.push([r, c]); }));
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

function move(board, direction) {
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
  const dirs = ["left", "right", "up", "down"];
  return dirs.every((dir) => !move(board, dir).changed);
}

export default function Game2048Client({ courses, personalStats, leaderboard }) {
  const [board, setBoard] = useState(freshBoard);
  const [score, setScore] = useState(0);
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [status, setStatus] = useState("");
  const bestTile = useMemo(() => Math.max(...board.flat()), [board]);

  const saveSession = useCallback(async (finalScore, finalBoard, result = "finished") => {
    setStatus("Saving...");
    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "2048",
        score: finalScore,
        result,
        courseId: courseId || null,
        metadata: {
          bestTile: Math.max(...finalBoard.flat()),
        },
      }),
    });
    setStatus(response.ok ? "Saved." : "Could not save score.");
  }, [courseId]);

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
      setBoard((currentBoard) => {
        const result = move(currentBoard, direction);
        if (result.changed) {
          setScore((current) => current + result.scoreDelta);
          const nextBoard = result.board;
          if (gameOver(nextBoard)) {
            queueMicrotask(() => saveSession(score + result.scoreDelta, nextBoard));
          }
          return nextBoard;
        }
        return currentBoard;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveSession, score]);

  function resetGame() {
    if (score > 0) saveSession(score, board, "reset");
    setBoard(freshBoard());
    setScore(0);
    setStatus("");
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <div className="ctaRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Current Game</h2>
          <button className="btn" onClick={resetGame} type="button">
            Reset
          </button>
        </div>
        <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
          <div className="pill">Score: {score}</div>
          <div className="pill">Best Tile: {bestTile}</div>
          <select className="input" style={{ maxWidth: "18rem" }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">No class leaderboard</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </div>
        <div className="game2048Board">
          {board.flat().map((value, index) => (
            <div key={index} className={`game2048Tile value${value || 0}`}>{value || ""}</div>
          ))}
        </div>
        <p style={{ marginTop: "0.75rem" }}>Use your arrow keys to move.</p>
        {status ? <p style={{ marginTop: "0.4rem" }}>{status}</p> : null}
      </section>
      <section className="card" style={{ background: "#fff" }}>
        <h2>Your Stats</h2>
        {personalStats ? (
          <div className="kv compactKv">
            <div><span>Games</span><strong>{personalStats.sessions_played}</strong></div>
            <div><span>Average</span><strong>{Math.round(Number(personalStats.average_score || 0) * 10) / 10}</strong></div>
            <div><span>Last 10</span><strong>{Math.round(Number(personalStats.last_10_average || 0) * 10) / 10}</strong></div>
            <div><span>Best</span><strong>{personalStats.best_score}</strong></div>
          </div>
        ) : <p>No saved games yet.</p>}
        <h3 style={{ marginTop: "1rem" }}>Leaderboard</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {leaderboard.map((row, index) => (
            <div key={row.player_id} className="card" style={{ background: "#f9fbfc" }}>
              <strong>#{index + 1} {Array.isArray(row.profiles) ? row.profiles[0]?.display_name : row.profiles?.display_name}</strong>
              <p>Avg: {Math.round(Number(row.average_score || 0) * 10) / 10} · Last 10: {Math.round(Number(row.last_10_average || 0) * 10) / 10} · Best: {row.best_score}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
