"use client";

import Link from "next/link";
import {
  describeRoundClock,
  formatRaceTime,
  mineCountForSize,
  mineRuleLabel,
} from "@/lib/student-games/minesweeper-race";
import { useRaceSession } from "../use-race-session";

// The main-board view of a Minesweeper Race. It only ever shows names, progress
// and results, never the puzzle, so it is safe to project while students play.

function columnsFor(count) {
  if (count > 24) return 3;
  if (count > 10) return 2;
  return 1;
}

function sortedStandings(players) {
  return [...players].sort(
    (a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName)
  );
}

function RaceRows({ players, scored }) {
  const columns = columnsFor(players.length);
  const rows = Math.ceil(players.length / columns);

  return (
    <ol
      className={`raceDisplayRows cols-${columns}`}
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {players.map((player, index) => {
        const round = player.round;
        let result = `${round.progress}%`;
        if (round.status === "finished") result = formatRaceTime(round.elapsedMs);
        else if (round.status === "out") result = "OUT";

        return (
          <li
            key={player.userId}
            className={`raceDisplayRow is-${round.status} ${player.isPresent ? "" : "isAway"} ${
              round.place && round.place <= 3 ? `place-${round.place}` : ""
            }`}
          >
            <span className="raceDisplayRank">{round.place || index + 1}</span>
            <span className="raceDisplayName">
              {player.displayName}
              {player.isTeacher ? <em>Teacher</em> : null}
            </span>
            <span className="raceDisplayBar">
              <span style={{ width: `${round.progress}%` }} />
            </span>
            <span className="raceDisplayHits">{round.mineHits > 0 ? `💥${round.mineHits}` : ""}</span>
            <span className="raceDisplayResult">
              {result}
              {scored && round.points ? <small>+{round.points}</small> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StandingsList({ players, limit }) {
  const standings = sortedStandings(players).slice(0, limit);
  return (
    <ol className="raceDisplayStandings">
      {standings.map((player, index) => (
        <li key={player.userId}>
          <span>{index + 1}</span>
          <strong>{player.displayName}</strong>
          <b>{player.totalPoints}</b>
        </li>
      ))}
    </ol>
  );
}

export default function RaceDisplayClient({ courseId, courseTitle }) {
  const { session, loaded, pollError, serverNowMs } = useRaceSession(courseId, { view: "display" });

  const status = session?.status || "none";
  const players = session?.players || [];
  const clock = describeRoundClock(session, serverNowMs);
  const podium = players.filter((player) => player.round.place && player.round.place <= 3);

  let clockText = "";
  let clockLabel = "";
  if (status === "racing" && clock.phase !== "countdown") {
    clockText = formatRaceTime(clock.remainingMs !== null ? clock.remainingMs : clock.elapsedMs);
    clockLabel = clock.phase === "timeup" ? "Time is up" : clock.remainingMs !== null ? "Time left" : "Race clock";
  }

  return (
    <div className="raceDisplay">
      <header className="raceDisplayHeader">
        <div>
          <p className="raceDisplayEyebrow">💣 Minesweeper Race{courseTitle ? ` · ${courseTitle}` : ""}</p>
          <h1>
            {status === "racing" ? `Round ${session.currentRound}` : null}
            {status === "results" ? `Round ${session.currentRound} results` : null}
            {status === "lobby" ? "Join the race" : null}
            {status === "none" || status === "ended" ? "Minesweeper Race" : null}
          </h1>
          {status === "racing" || status === "results" || status === "lobby" ? (
            <p className="raceDisplayRules">
              {session.boardSize} × {session.boardSize} · {mineCountForSize(session.boardSize)} mines · {mineRuleLabel(session.mineRule)}
            </p>
          ) : null}
        </div>
        {clockText ? (
          <div className={`raceDisplayClock ${clock.phase === "timeup" ? "isTimeUp" : ""}`}>
            <span>{clockLabel}</span>
            <strong>{clockText}</strong>
            <small>{session.finishedCount} of {session.joinedCount} finished</small>
          </div>
        ) : null}
        <Link className="raceDisplayClose" href={`/play/minesweeper-race?course=${encodeURIComponent(courseId)}`}>
          ✕ Close display
        </Link>
      </header>

      <main className="raceDisplayBody">
        {pollError ? <p className="raceDisplayWarning">{pollError}</p> : null}

        {!loaded ? <p className="raceDisplayBig">Loading...</p> : null}

        {loaded && status === "none" ? (
          <div className="raceDisplayCenter">
            <p className="raceDisplayBig">Waiting for the teacher to open a race</p>
            <p className="raceDisplaySub">This screen updates on its own.</p>
          </div>
        ) : null}

        {status === "lobby" ? (
          <div className="raceDisplayCenter">
            <p className="raceDisplaySub">Go to Arcade → Minesweeper Race</p>
            <p className="raceDisplayBig">{session.joinedCount} in the lobby</p>
            <ul className="raceDisplayLobby">
              {players.map((player) => (
                <li key={player.userId} className={player.isPresent ? "" : "isAway"}>
                  {player.displayName}
                  {player.isTeacher ? <em>Teacher</em> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status === "racing" && clock.phase === "countdown" ? (
          <div className="raceDisplayCenter">
            <p className="raceDisplaySub">Round {session.currentRound} starts in</p>
            <p className="raceDisplayCountdown" key={clock.countdownSeconds}>{clock.countdownSeconds}</p>
          </div>
        ) : null}

        {status === "racing" && clock.phase !== "countdown" ? <RaceRows players={players} scored={false} /> : null}

        {status === "results" ? (
          <div className="raceDisplaySplit">
            <section>
              {podium.length > 0 ? (
                <ol className="raceDisplayPodium">
                  {podium.map((player) => (
                    <li key={player.userId} className={`place-${player.round.place}`}>
                      <span>{["🥇", "🥈", "🥉"][player.round.place - 1]}</span>
                      <strong>{player.displayName}</strong>
                      <b>{formatRaceTime(player.round.elapsedMs)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="raceDisplaySub">Nobody cleared the board this round.</p>
              )}
              <RaceRows players={players} scored />
            </section>
            <aside>
              <h2>Standings</h2>
              <StandingsList players={players} limit={12} />
            </aside>
          </div>
        ) : null}

        {status === "ended" ? (
          <div className="raceDisplayCenter">
            <p className="raceDisplaySub">Final standings</p>
            <StandingsList players={players} limit={10} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
