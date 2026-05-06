"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function cellColor(value) {
  if (value === "R") return "#cd3b3b";
  if (value === "Y") return "#f1c232";
  return "#ffffff";
}

function courseTitle(courses, courseId) {
  return courses.find((course) => course.id === courseId)?.title || "Selected class";
}

function canManageCourse(courses, courseId) {
  const course = courses.find((item) => item.id === courseId);
  return course?.relationship === "owner" || course?.relationship === "co_teacher";
}

function matchPlayerName(match, slot) {
  if (slot === "one") return match.playerOneName || "TBD";
  return match.playerTwoName || "TBD";
}

function statusLabel(match) {
  if (match.status === "finished") {
    return match.winnerName ? `${match.winnerName} advances` : "Finished";
  }
  if (match.status === "active") return "Live";
  if (match.playerOneId && !match.playerTwoId) return "Bye";
  return "Waiting";
}

function BoardPreview({ match }) {
  const board = match?.connect4Match?.board || [];

  return (
    <div className="tournamentBoardPreview" aria-label="Connect 4 board preview">
      {board.map((row, rowIndex) =>
        row.map((value, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            className="tournamentBoardCell"
            style={{ background: cellColor(value) }}
          />
        ))
      )}
    </div>
  );
}

function Bracket({ tournament, matches }) {
  const rounds = tournament?.bracket?.rounds || [];
  const matchesByRound = new Map();

  for (const match of matches || []) {
    if (!matchesByRound.has(match.roundIndex)) matchesByRound.set(match.roundIndex, []);
    matchesByRound.get(match.roundIndex).push(match);
  }

  if (!tournament) {
    return (
      <section className="card tournamentBracket">
        <h2>Bracket</h2>
        <p>Open a tournament lobby to start gathering players.</p>
      </section>
    );
  }

  if (tournament.status === "waiting") {
    return (
      <section className="card tournamentBracket">
        <h2>Bracket</h2>
        <p>The bracket will appear here after the teacher generates it.</p>
      </section>
    );
  }

  return (
    <section className="card tournamentBracket">
      <div className="tournamentBracketHeader">
        <div>
          <h2>Bracket</h2>
          <p>{tournament.championName ? `${tournament.championName} wins the tournament.` : "Winners advance automatically."}</p>
        </div>
        <span className={`pill tournamentStatus ${tournament.status}`}>{tournament.status}</span>
      </div>
      <div className="tournamentBracketScroller">
        <div
          className="tournamentBracketGrid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, rounds.length)}, minmax(13rem, 1fr))` }}
        >
          {rounds.map((round) => (
            <div key={round.roundIndex} className="tournamentRound">
              <h3>{round.name}</h3>
              <div className="tournamentRoundMatches">
                {(matchesByRound.get(round.roundIndex) || []).map((match) => (
                  <article key={match.id} className={`tournamentBracketMatch status-${match.status}`}>
                    <div className={match.winnerId === match.playerOneId ? "winner" : ""}>
                      {matchPlayerName(match, "one")}
                    </div>
                    <div className={match.winnerId === match.playerTwoId ? "winner" : ""}>
                      {matchPlayerName(match, "two")}
                    </div>
                    <span>{statusLabel(match)}</span>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MatchCard({ match, viewerId, canManage }) {
  const viewerCanPlay = match.playerOneId === viewerId || match.playerTwoId === viewerId;
  const href = match.connect4MatchId ? `/play/connect4?match=${match.connect4MatchId}` : "";

  return (
    <article className={`card tournamentMatchCard status-${match.status}`}>
      <div className="tournamentMatchHeader">
        <div>
          <h3>{match.playerOneName || "TBD"} vs. {match.playerTwoName || "TBD"}</h3>
          <p>{statusLabel(match)}</p>
        </div>
        {match.status === "active" ? <span className="pill">Live</span> : null}
      </div>
      {match.connect4Match ? <BoardPreview match={match} /> : null}
      <div className="ctaRow">
        {viewerCanPlay && href ? (
          <Link className="btn primary" href={href}>
            Start Game
          </Link>
        ) : null}
        {canManage && href ? (
          <Link className="btn" href={href}>
            Open Full Board
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default function TournamentClient({ courses, userId, initialCourseId = "" }) {
  const [courseId, setCourseId] = useState(initialCourseId || courses[0]?.id || "");
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const tournament = payload?.tournament || null;
  const matches = payload?.matches || [];
  const participants = payload?.participants || [];
  const canManage = canManageCourse(courses, courseId);
  const presentParticipants = participants.filter((participant) => participant.isPresent);
  const viewerMatches = matches.filter(
    (match) => match.status === "active" && (match.playerOneId === userId || match.playerTwoId === userId)
  );
  const liveMatches = matches
    .filter((match) => match.status === "active")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const completedMatches = matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const fetchTournament = useCallback(async () => {
    if (!courseId) return;
    const query = tournament?.id
      ? `tournamentId=${encodeURIComponent(tournament.id)}`
      : `courseId=${encodeURIComponent(courseId)}`;
    const response = await fetch(`/api/play/connect4-tournaments?${query}`);
    const data = await response.json();
    if (response.ok) {
      setPayload(data.tournament === null ? null : data);
    }
  }, [courseId, tournament?.id]);

  async function postAction(action) {
    if (!courseId || busy) return;
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/play/connect4-tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        courseId,
        tournamentId: tournament?.id || null,
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setStatus(data.error || "Tournament action failed.");
      return;
    }
    setPayload(data);
    if (action === "create_lobby") setStatus("Tournament lobby is open.");
    if (action === "generate") setStatus("Bracket generated.");
  }

  useEffect(() => {
    setPayload(null);
    setStatus("");
  }, [courseId]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  useEffect(() => {
    if (!courseId) return undefined;
    const interval = window.setInterval(fetchTournament, 2500);
    return () => window.clearInterval(interval);
  }, [courseId, fetchTournament]);

  useEffect(() => {
    if (!tournament?.id || canManage || tournament.status !== "waiting") return undefined;

    async function touch() {
      const response = await fetch("/api/play/connect4-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "touch",
          courseId,
          tournamentId: tournament.id,
        }),
      });
      const data = await response.json();
      if (response.ok) setPayload(data);
    }

    touch();
    const interval = window.setInterval(touch, 3000);
    return () => window.clearInterval(interval);
  }, [canManage, courseId, tournament?.id, tournament?.status]);

  if (courses.length === 0) {
    return (
      <section className="card">
        <h2>No tournament classes yet</h2>
        <p>Join a class or ask a teacher to enable Connect 4 for your class.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card tournamentControls">
        <div>
          <h2>{courseTitle(courses, courseId)}</h2>
          <p>Connect 4 tournament mode is class-scoped for this first version.</p>
        </div>
        <div className="ctaRow">
          <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          {canManage ? (
            <>
              <button className="btn" type="button" onClick={() => postAction("create_lobby")} disabled={busy}>
                Open Lobby
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => postAction("generate")}
                disabled={busy || !tournament || tournament.status !== "waiting" || presentParticipants.length < 2}
              >
                Generate Bracket
              </button>
            </>
          ) : null}
        </div>
        {status ? <p className="tournamentStatusLine">{status}</p> : null}
      </section>

      <div className="tournamentStickyBracket">
        <Bracket tournament={tournament} matches={matches} />
      </div>

      {!tournament ? (
        <section className="card">
          <h2>{canManage ? "Open the lobby" : "Waiting for the teacher"}</h2>
          <p>
            {canManage
              ? "Open a tournament lobby when students are ready to join from their screens."
              : "Your teacher has not opened a Connect 4 tournament lobby for this class yet."}
          </p>
        </section>
      ) : null}

      {tournament?.status === "waiting" ? (
        <section className="card">
          <h2>Players In The Lobby</h2>
          <p>{presentParticipants.length} present student{presentParticipants.length === 1 ? "" : "s"}</p>
          <div className="tournamentParticipantGrid">
            {participants.map((participant) => (
              <div key={participant.id} className={`tournamentParticipant ${participant.isPresent ? "present" : "absent"}`}>
                <i aria-hidden="true" />
                <span>{participant.displayName}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!canManage && tournament?.status === "active" ? (
        <section className="card">
          <h2>Your Tournament Games</h2>
          {viewerMatches.length === 0 ? (
            <p>Waiting for your next matchup. It will appear here automatically when both players are ready.</p>
          ) : (
            <div className="tournamentGameGrid">
              {viewerMatches.map((match) => (
                <MatchCard key={match.id} match={match} viewerId={userId} canManage={false} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {canManage && tournament?.status !== "waiting" ? (
        <>
          <section className="card">
            <h2>Live Games</h2>
            {liveMatches.length === 0 ? (
              <p>No live games right now. The next games will appear as soon as their matchups are known.</p>
            ) : (
              <div className="tournamentGameGrid">
                {liveMatches.map((match) => (
                  <MatchCard key={match.id} match={match} viewerId={userId} canManage />
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <h2>Finished Games</h2>
            {completedMatches.length === 0 ? (
              <p>Finished games will move here with the newest results first.</p>
            ) : (
              <div className="tournamentGameGrid">
                {completedMatches.map((match) => (
                  <MatchCard key={match.id} match={match} viewerId={userId} canManage />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
