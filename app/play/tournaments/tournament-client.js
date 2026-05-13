"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildBoardSnapshots } from "@/lib/student-games/connect4";

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

function turnStatusText(match) {
  const liveMatch = match?.connect4Match;
  if (!match) return "";
  if (match.status === "finished") {
    if (liveMatch?.metadata?.draw) return "Finished: draw";
    return match.winnerName ? `Finished: ${match.winnerName} advances` : "Finished";
  }
  if (match.status !== "active" || !liveMatch) return statusLabel(match);
  if (liveMatch.metadata?.draw) return "Draw replay coming";
  if (liveMatch.status === "finished") {
    if (liveMatch.winner_id === match.playerOneId) return `${matchPlayerName(match, "one")} won this game`;
    if (liveMatch.winner_id === match.playerTwoId) return `${matchPlayerName(match, "two")} won this game`;
    return "Game finished";
  }
  if (liveMatch.current_turn_id === match.playerOneId) return `Turn: ${matchPlayerName(match, "one")}`;
  if (liveMatch.current_turn_id === match.playerTwoId) return `Turn: ${matchPlayerName(match, "two")}`;
  return "Waiting for turn";
}

function statusLabel(match) {
  if (match.status === "finished") {
    return match.winnerName ? `${match.winnerName} advances` : "Finished";
  }
  if (match.status === "active") return "Live";
  if (match.playerOneId && !match.playerTwoId) return "Bye";
  return "Waiting";
}

function seriesLine(match) {
  return match?.seriesSummary?.summaryText || "";
}

function seriesGameLabel(game) {
  const prefix = `Game ${game?.gameNumber || 1}`;
  if (game?.draw) return `${prefix}: draw`;
  if (game?.winnerName) return `${prefix}: ${game.winnerName} won`;
  return prefix;
}

function readOnlyGameStatus(match, game) {
  if (!game) return turnStatusText(match);
  if (game.draw) return `${seriesGameLabel(game)}.`;
  if (game.winnerName) return `${seriesGameLabel(game)}.`;
  return `Game ${game.gameNumber || 1}.`;
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

function PlayerLegend({ match }) {
  return (
    <div className="tournamentPlayerLegend">
      <span>
        <i className="red" aria-hidden="true" />
        Red: <strong>{matchPlayerName(match, "one")}</strong>
      </span>
      <span>
        <i className="yellow" aria-hidden="true" />
        Yellow: <strong>{matchPlayerName(match, "two")}</strong>
      </span>
    </div>
  );
}

function allReviewableGames(match) {
  if (match?.seriesGames?.length) return match.seriesGames;
  if (!match?.connect4Match) return [];
  return [
    {
      connect4MatchId: match.connect4Match.id,
      gameNumber: 1,
      winnerId: match.connect4Match.winner_id || null,
      winnerName: match.winnerName || "",
      board: match.connect4Match.board || [],
      snapshots: buildBoardSnapshots(match.connect4Match.metadata?.moveHistory, match.connect4Match.board),
      status: match.connect4Match.status,
      metadata: match.connect4Match.metadata || {},
      draw: Boolean(match.connect4Match.metadata?.draw),
      isCurrent: true,
      playerOneId: match.playerOneId,
      playerTwoId: match.playerTwoId,
    },
  ];
}

function ReviewGameButtons({ match, onOpenBoard }) {
  const games = allReviewableGames(match);
  if (!games.length || !onOpenBoard) return null;

  return (
    <div className="tournamentSeriesGames" aria-label="Review games">
      {games.map((game) => (
        <button
          key={game.connect4MatchId}
          type="button"
          className="btn small"
          onClick={() => onOpenBoard(match, game)}
        >
          {game.isCurrent ? "Current game" : `Game ${game.gameNumber || 1}`}
        </button>
      ))}
    </div>
  );
}

function LargeBoardModal({ match, game, onClose }) {
  if (!match) return null;
  const snapshots = game?.snapshots?.length
    ? game.snapshots
    : buildBoardSnapshots(
        (game?.metadata || match.connect4Match?.metadata)?.moveHistory,
        game?.board || match.connect4Match?.board || []
      );
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, snapshots.length - 1));

  useEffect(() => {
    setSelectedIndex(Math.max(0, snapshots.length - 1));
  }, [snapshots.length]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, snapshots.length - 1));
  const snapshot = snapshots[safeIndex] || { board: game?.board || match.connect4Match?.board || [] };
  const board = snapshot.board || [];
  const move = snapshot.move || null;

  return (
    <div className="doubleBoardModalBackdrop" role="presentation" onClick={onClose}>
      <section
        className="tournamentBoardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-board-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="doubleBoardModalClose" onClick={onClose} aria-label="Close board popup">
          x
        </button>
        <p className="doubleBoardEyebrow">Teacher View</p>
        <h2 id="tournament-board-modal-title">
          {matchPlayerName(match, "one")} vs. {matchPlayerName(match, "two")}
        </h2>
        {game ? <p className="tournamentSeriesLine">{seriesGameLabel(game)}</p> : null}
        <PlayerLegend match={match} />
        <p className="tournamentTurnLine">{readOnlyGameStatus(match, game)}</p>
        <div className="tournamentReplayControls">
          <div className="tournamentReplayTopline">
            <strong>Replay</strong>
            <span>{safeIndex} / {Math.max(0, snapshots.length - 1)}</span>
          </div>
          <input
            className="connect4ReplaySlider"
            type="range"
            min="0"
            max={Math.max(0, snapshots.length - 1)}
            value={safeIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            aria-label="Replay move"
          />
          <p>
            {move
              ? `Move ${move.moveNumber}: ${move.token === "R" ? matchPlayerName(match, "one") : matchPlayerName(match, "two")} dropped in column ${move.column + 1}`
              : "Start of game"}
          </p>
          {snapshots.length === 1 ? <p>This older game only has the final board saved.</p> : null}
        </div>
        <div className="tournamentLargeBoard" aria-label="Large Connect 4 board">
          {board.map((row, rowIndex) =>
            row.map((value, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                className="tournamentLargeBoardCell"
                style={{ background: cellColor(value) }}
              />
            ))
          )}
        </div>
      </section>
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
                    <span>{seriesLine(match) || statusLabel(match)}</span>
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

function MatchCard({ match, viewerId, canManage, onOpenBoard }) {
  const viewerCanPlay = match.playerOneId === viewerId || match.playerTwoId === viewerId;
  const href = match.connect4MatchId ? `/play/connect4?match=${match.connect4MatchId}` : "";

  return (
    <article className={`card tournamentMatchCard status-${match.status}`}>
      <div className="tournamentMatchHeader">
        <div>
          <h3>{match.playerOneName || "TBD"} vs. {match.playerTwoName || "TBD"}</h3>
          <p>{seriesLine(match) || statusLabel(match)}</p>
        </div>
        {match.status === "active" ? <span className="pill">Live</span> : null}
      </div>
      {match.connect4Match ? <BoardPreview match={match} /> : null}
      <PlayerLegend match={match} />
      <p className="tournamentTurnLine">{turnStatusText(match)}</p>
      <ReviewGameButtons match={match} onOpenBoard={onOpenBoard} />
      <div className="ctaRow">
        {viewerCanPlay && href ? (
          <Link className="btn primary" href={href}>
            Start Game
          </Link>
        ) : null}
        {canManage && href ? (
          <button className="btn" type="button" onClick={() => onOpenBoard(match, null)}>
            Large View
          </button>
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
  const [matchFormat, setMatchFormat] = useState("single_game");
  const [selectedBoard, setSelectedBoard] = useState(null);

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
  const selectedBoardMatch = selectedBoard?.matchId
    ? matches.find((match) => match.id === selectedBoard.matchId) || null
    : null;
  const selectedBoardGame = selectedBoard?.game || null;

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
        matchFormat,
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
          {canManage ? (
            <div className="tournamentFormatControl">
              <span>Match format</span>
              <label>
                <input
                  type="radio"
                  name="matchFormat"
                  value="single_game"
                  checked={matchFormat === "single_game"}
                  onChange={(event) => setMatchFormat(event.target.value)}
                />
                Single game
              </label>
              <label>
                <input
                  type="radio"
                  name="matchFormat"
                  value="best_of_3"
                  checked={matchFormat === "best_of_3"}
                  onChange={(event) => setMatchFormat(event.target.value)}
                />
                Best 2 of 3
              </label>
            </div>
          ) : null}
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
                <MatchCard
                  key={match.id}
                  match={match}
                  viewerId={userId}
                  canManage={false}
                  onOpenBoard={(selectedMatch, game) => setSelectedBoard({ matchId: selectedMatch.id, game })}
                />
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
                  <MatchCard
                    key={match.id}
                    match={match}
                    viewerId={userId}
                    canManage
                    onOpenBoard={(selectedMatch, game) => setSelectedBoard({ matchId: selectedMatch.id, game })}
                  />
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
                  <MatchCard
                    key={match.id}
                    match={match}
                    viewerId={userId}
                    canManage
                    onOpenBoard={(selectedMatch, game) => setSelectedBoard({ matchId: selectedMatch.id, game })}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
      {selectedBoardMatch ? (
        <LargeBoardModal match={selectedBoardMatch} game={selectedBoardGame} onClose={() => setSelectedBoard(null)} />
      ) : null}
    </div>
  );
}
