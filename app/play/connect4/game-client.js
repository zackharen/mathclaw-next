"use client";

import { useEffect, useState } from "react";

function cellColor(value) {
  if (value === "R") return "#cd3b3b";
  if (value === "Y") return "#f1c232";
  return "#ffffff";
}

export default function Connect4Client({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [inviteCode, setInviteCode] = useState("");
  const [match, setMatch] = useState(null);
  const [status, setStatus] = useState("");

  async function createMatch() {
    setStatus("Creating match...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", courseId: courseId || null }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Could not create match.");
      return;
    }
    setMatch(data.match);
    setInviteCode(data.match.invite_code);
    setStatus("Match created. Share the code.");
  }

  async function joinMatch() {
    setStatus("Joining...");
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", inviteCode }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Could not join match.");
      return;
    }
    setMatch(data.match);
    setStatus("Joined match.");
  }

  async function makeMove(column) {
    if (!match) return;
    const response = await fetch("/api/play/connect4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", matchId: match.id, column }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Could not make move.");
      return;
    }
    setMatch(data.match);
  }

  useEffect(() => {
    if (!match?.id) return undefined;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/play/connect4?id=${match.id}`);
      const data = await response.json();
      if (response.ok) setMatch(data.match);
    }, 2000);
    return () => clearInterval(interval);
  }, [match?.id]);

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Lobby</h2>
        <div className="ctaRow">
          <select className="input" style={{ maxWidth: "16rem" }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">No class selected</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
          <button className="btn primary" type="button" onClick={createMatch}>
            Create Match
          </button>
        </div>
        <div className="ctaRow">
          <input className="input" placeholder="Enter invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} />
          <button className="btn" type="button" onClick={joinMatch}>
            Join By Code
          </button>
        </div>
        {inviteCode ? <p>Your code: <strong>{inviteCode}</strong></p> : null}
        {status ? <p style={{ marginTop: "0.75rem" }}>{status}</p> : null}
      </section>
      <section className="card" style={{ background: "#fff" }}>
        <h2>Board</h2>
        {!match ? (
          <p>Create or join a match to start.</p>
        ) : (
          <>
            <p>Status: {match.status}{match.winner_id ? " · Winner decided" : ""}</p>
            <div className="connect4Board">
              {(match.board || []).map((row, rowIndex) =>
                row.map((value, colIndex) => (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    type="button"
                    className="connect4Cell"
                    style={{ background: cellColor(value) }}
                    onClick={() => makeMove(colIndex)}
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
