"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildRaceBoard,
  createPlayState,
  formatRaceTime,
  restorePlayState,
} from "@/lib/student-games/minesweeper-race";

const PEEK_POLL_MS = 2500;

// Teacher-only: a read-only, live look at one player's board.
export default function PeekBoard({ courseId, playerId, onClose }) {
  const [peek, setPeek] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/play/minesweeper-race?courseId=${encodeURIComponent(courseId)}&view=peek&playerId=${encodeURIComponent(playerId)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Could not load that board.");
        setPeek(payload.peek || null);
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load that board.");
      }
    }

    load();
    const interval = window.setInterval(load, PEEK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [courseId, playerId]);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const seed = peek?.seed || "";
  const boardSize = peek?.boardSize || 0;
  const board = useMemo(() => (seed ? buildRaceBoard(seed, boardSize) : null), [seed, boardSize]);
  const cells = useMemo(() => {
    if (!board) return null;
    return (peek?.cells && restorePlayState(board, peek.cells)) || createPlayState(board);
  }, [board, peek?.cells]);

  let statusText = "";
  if (peek) {
    if (peek.status === "finished") statusText = `Finished in ${formatRaceTime(peek.elapsedMs)}`;
    else if (peek.status === "out") statusText = `Out at ${peek.progress}%`;
    else statusText = `${peek.progress}% cleared`;
    if (peek.mineHits > 0) statusText += ` · 💥${peek.mineHits}`;
    if (peek.restarts > 0) statusText += ` · ${peek.restarts} restart${peek.restarts === 1 ? "" : "s"}`;
  }

  return (
    <div className="racePeekOverlay" role="dialog" aria-modal="true" aria-label="Student board" onClick={onClose}>
      <div className="racePeekPanel" onClick={(event) => event.stopPropagation()}>
        <div className="racePeekHeader">
          <div>
            <p className="gameSidePanelEyebrow">Student board · live</p>
            <h2>{peek?.displayName || "Loading..."}</h2>
            {statusText ? <p className="racePeekStatus">{statusText}</p> : null}
          </div>
          <button className="btn" type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>

        {error ? <p className="racePeekNote">{error}</p> : null}
        {peek && !board ? <p className="racePeekNote">The round has not started yet.</p> : null}

        {board && cells ? (
          <>
            <div className="minesweeperBoardViewport">
              <div
                className="minesweeperBoard raceBoard isLocked"
                style={{
                  gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                  width: boardSize <= 10 ? "min(100%, 30rem)" : `${boardSize * 30}px`,
                  maxWidth: boardSize <= 10 ? "30rem" : "none",
                }}
              >
                {board.cells.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const playCell = cells[rowIndex][colIndex];
                    let label = "";
                    if (playCell.exploded) label = "💥";
                    else if (playCell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
                    else if (playCell.flagged) label = "🚩";
                    const countClass =
                      playCell.revealed && !cell.mine && cell.adjacent > 0 ? `isCount${cell.adjacent}` : "";

                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        className={`minesweeperCell racePeekCell ${playCell.revealed ? "isRevealed" : ""} ${
                          playCell.exploded ? "isMine" : ""
                        } ${playCell.flagged ? "isFlagged" : ""} ${countClass}`}
                      >
                        {label}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <p className="racePeekNote">
              {peek.hasBoard
                ? "This is exactly what the student sees. It updates every few seconds."
                : "No moves have reached the server yet, so this shows the starting board."}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
