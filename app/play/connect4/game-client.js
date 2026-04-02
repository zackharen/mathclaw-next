"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cellColor(value) {
  if (value === "R") return "#cd3b3b";
  if (value === "Y") return "#f1c232";
  return "#ffffff";
}

function tokenForUser(match, userId) {
  if (!match || !userId) return null;
  if (match.player_one_id === userId) return "R";
  if (match.player_two_id === userId) return "Y";
  return null;
}

function turnLabel(match, userId) {
  if (!match) return "";
  if (match.status === "waiting") return "Waiting for a second player.";
  if (match.status === "finished") {
    if (match.metadata?.draw) return "This match ended in a draw.";
    if (match.winner_id === userId) return "You won this match.";
    if (match.winner_id) return "You lost this match.";
    return "Match finished.";
  }
  if (match.current_turn_id === userId) return "Your turn.";
  return "Opponent's turn.";
}

function turnTone(match, userId) {
  if (!match) return "neutral";
  if (match.status === "waiting") return "waiting";
  if (match.status === "finished") {
    if (match.metadata?.draw) return "draw";
    if (match.winner_id === userId) return "won";
    if (match.winner_id) return "lost";
    return "neutral";
  }
  return match.current_turn_id === userId ? "yourTurn" : "theirTurn";
}

export default function Connect4Client({ courses, userId, initialCourseId = "" }) {
  const [courseId, setCourseId] = useState(initialCourseId || courses[0]?.id || "");
  const [inviteCode, setInviteCode] = useState("");
  const [match, setMatch] = useState(null);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [nowTick, setNowTick] = useState(0);

  const yourToken = useMemo(() => tokenForUser(match, userId), [match, userId]);
  const liveTurnMessage = useMemo(() => turnLabel(match, userId), [match, userId]);
  const liveTurnTone = useMemo(() => turnTone(match, userId), [match, userId]);
  const canMove =
    !!match &&
    match.status === "active" &&
    match.current_turn_id === userId &&
    !!yourToken;
  const canRematch =
    !!match &&
    match.status === "finished" &&
    !!match.player_one_id &&
    !!match.player_two_id &&
    (match.player_one_id === userId || match.player_two_id === userId);
  const winningCells = useMemo(
    () =>
      new Set(
        Array.isArray(match?.metadata?.winningCells)
          ? match.metadata.winningCells.map((cell) => `${cell[0]}:${cell[1]}`)
          : []
      ),
    [match]
  );
  const gameStartedAt = match?.metadata?.gameStartedAt
    ? new Date(match.metadata.gameStartedAt).getTime()
    : null;
  const elapsedSeconds = useMemo(() => {
    if (!match || !gameStartedAt) return 0;
    const endTime =
      match.status === "finished"
        ? new Date(match.updated_at || match.metadata?.gameStartedAt).getTime()
        : nowTick;
    return Math.max(0, Math.round((endTime - gameStartedAt) / 1000));
  }, [gameStartedAt, match, nowTick]);
  const averageSecondsPerMove = useMemo(() => {
    const moves = Number(match?.move_count || 0);
    if (!moves || !elapsedSeconds) return 0;
    return elapsedSeconds / moves;
  }, [elapsedSeconds, match?.move_count]);

  const refreshMatch = useCallback(async (matchId) => {
    if (!matchId) return;
    const response = await fetch(`/api/play/connect4?id=${matchId}`);
    const data = await response.json();
    if (response.ok) {
      setMatch(data.match);
    }
  }, []);

  async function createMatch() {
    setIsBusy(true);
    setStatus("Creating match...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", courseId: courseId || null }),
    });
    const data = await response.json();
    setIsBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Could not create match.");
      return;
    }
    setMatch(data.match);
    setInviteCode(data.match.invite_code);
    setStatus("Match created. Share the code with another player.");
  }

  async function joinMatch() {
    setIsBusy(true);
    setStatus("Joining...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", inviteCode }),
    });
    const data = await response.json();
    setIsBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Could not join match.");
      return;
    }
    setMatch(data.match);
    setInviteCode(data.match.invite_code);
    setStatus("Joined match.");
  }

  async function makeMove(column) {
    if (!match || !canMove || isBusy) return;
    setIsBusy(true);
    setStatus("Dropping token...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", matchId: match.id, column }),
    });
    const data = await response.json();
    setIsBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Could not make move.");
      return;
    }
    setMatch(data.match);
    setStatus("");
  }

  async function startRematch() {
    if (!match?.id || !canRematch || isBusy) return;
    setIsBusy(true);
    setStatus("Starting rematch...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rematch", matchId: match.id }),
    });
    const data = await response.json();
    setIsBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Could not start rematch.");
      return;
    }
    setMatch(data.match);
    setInviteCode(data.match.invite_code);
    setStatus("Rematch ready. Same code, fresh board.");
  }

  async function copyCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setStatus("Invite code copied.");
    } catch {
      setStatus("Could not copy invite code.");
    }
  }

  useEffect(() => {
    if (!match?.id) return undefined;
    const interval = setInterval(() => {
      refreshMatch(match.id);
    }, 1500);
    return () => clearInterval(interval);
  }, [match?.id, refreshMatch]);

  useEffect(() => {
    if (!match || match.status !== "active" || !gameStartedAt) return undefined;
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [gameStartedAt, match]);

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Lobby</h2>
        <p style={{ marginBottom: "0.75rem" }}>
          Create a match to get an invite code, then share that code with another MathClaw player.
          If you are joining, paste the code first and then hit Join.
        </p>
        <div className="ctaRow">
          <select
            className="input"
            style={{ maxWidth: "16rem" }}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">No class selected</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button className="btn primary" type="button" onClick={createMatch} disabled={isBusy}>
            Create Invite Code
          </button>
        </div>

        <div className="ctaRow">
          <input
            className="input"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          <button className="btn" type="button" onClick={joinMatch} disabled={isBusy || !inviteCode}>
            Join Match
          </button>
          <button className="btn" type="button" onClick={() => refreshMatch(match?.id)} disabled={!match?.id}>
            Refresh Board
          </button>
        </div>

        {inviteCode ? (
          <div className="connect4InfoCard">
            <p>
              Invite code: <strong>{inviteCode}</strong>
            </p>
            <div className="ctaRow" style={{ marginTop: "0.5rem" }}>
              <button className="btn" type="button" onClick={copyCode}>
                Copy Code
              </button>
            </div>
          </div>
        ) : null}

        {match ? (
          <div className="connect4InfoCard">
            <p>
              Your token:{" "}
              <strong>{yourToken === "R" ? "Red" : yourToken === "Y" ? "Yellow" : "Viewer"}</strong>
            </p>
            <p>{liveTurnMessage}</p>
            <p>Moves played: {match.move_count || 0}</p>
            {gameStartedAt ? (
              <>
                <p>Game time: {formatDuration(elapsedSeconds)}</p>
                <p>Average per move: {formatDuration(averageSecondsPerMove)}</p>
              </>
            ) : (
              <p>Game timer starts when the second player joins.</p>
            )}
            {canRematch ? (
              <div className="ctaRow" style={{ marginTop: "0.5rem" }}>
                <button className="btn primary" type="button" onClick={startRematch} disabled={isBusy}>
                  Play Again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {status ? <p style={{ marginTop: "0.75rem", fontWeight: 700 }}>{status}</p> : null}
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Board</h2>
        {!match ? (
          <p>Create or join a match to start. The board will appear here once a match is active.</p>
        ) : (
          <>
            <div className={`connect4TurnBanner ${liveTurnTone}`}>
              <strong>
                {liveTurnTone === "yourTurn"
                  ? "Your Turn"
                  : liveTurnTone === "theirTurn"
                    ? "Their Turn"
                    : liveTurnTone === "won"
                      ? "You Won"
                      : liveTurnTone === "lost"
                        ? "They Won"
                        : liveTurnTone === "draw"
                          ? "Draw"
                          : "Waiting"}
              </strong>
              <span>{liveTurnMessage}</span>
            </div>
            <div className="pillRow">
              <span className="pill">Status: {match.status}</span>
              {match.metadata?.draw ? <span className="pill">Draw</span> : null}
              {match.winner_id ? (
                <span className="pill">
                  Winner: {match.winner_id === userId ? "You" : "Opponent"}
                </span>
              ) : null}
            </div>
            {canRematch ? (
              <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
                <button className="btn primary" type="button" onClick={startRematch} disabled={isBusy}>
                  Play Again With Same Players
                </button>
              </div>
            ) : null}

            <div className="connect4DropRow">
              {Array.from({ length: 7 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className="btn connect4DropBtn"
                  onClick={() => makeMove(index)}
                  disabled={!canMove || isBusy}
                >
                  Drop
                </button>
              ))}
            </div>

            <div className="connect4Board">
              {(match.board || []).map((row, rowIndex) =>
                row.map((value, colIndex) => (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    type="button"
                    className={`connect4Cell ${
                      canMove ? "isClickable" : ""
                    } ${
                      winningCells.has(`${rowIndex}:${colIndex}`) ? "isWinner" : ""
                    }`}
                    aria-label={`Drop token in column ${colIndex + 1}`}
                    style={{ background: cellColor(value) }}
                    onClick={() => makeMove(colIndex)}
                    disabled={!canMove || isBusy}
                  />
                ))
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
