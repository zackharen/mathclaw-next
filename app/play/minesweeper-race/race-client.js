"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MINE_FREEZE_SECONDS,
  MINE_RULE_FREEZE,
  MINE_RULE_OUT,
  MINE_RULE_RESTART,
  RACE_DEFAULT_BOARD_SIZE,
  RACE_MAX_BOARD_SIZE,
  RACE_MIN_BOARD_SIZE,
  TIME_LIMIT_OPTIONS,
  buildRaceBoard,
  countFlags,
  countRevealedSafe,
  createPlayState,
  describeRoundClock,
  formatRaceTime,
  isBoardCleared,
  mineCountForSize,
  mineRuleLabel,
  progressPercent,
  restorePlayState,
  revealCell,
  serializePlayState,
  toggleFlag,
} from "@/lib/student-games/minesweeper-race";
import { GameSidePanel, GameStage, GameWorkspace } from "../game-shell";
import { useRaceSession } from "./use-race-session";

const BOARD_SIZE_OPTIONS = Array.from(
  { length: RACE_MAX_BOARD_SIZE - RACE_MIN_BOARD_SIZE + 1 },
  (_, index) => RACE_MIN_BOARD_SIZE + index
);

const MINE_RULE_OPTIONS = [
  [MINE_RULE_FREEZE, `Freeze for ${MINE_FREEZE_SECONDS} seconds, then keep going`],
  [MINE_RULE_RESTART, "Restart the same board (clock keeps running)"],
  [MINE_RULE_OUT, "Out for the round"],
];

function timeLimitLabel(seconds) {
  return seconds ? `${seconds / 60} minutes` : "No time limit";
}

function isTeacherRelationship(relationship) {
  return relationship === "owner" || relationship === "co_teacher";
}

function saveKey(sessionId, round, userId) {
  return `mathclaw:minesweeper-race:${sessionId}:${round}:${userId}`;
}

function readSavedRound(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSavedRound(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Saving is only for surviving a refresh; the race still works without it.
  }
}

function numberClassName(cell, playCell) {
  if (!playCell.revealed || cell.mine || cell.adjacent <= 0) return "";
  return `isCount${cell.adjacent}`;
}

function placeLabel(place) {
  if (!place) return "";
  const suffix = place % 10 === 1 && place % 100 !== 11 ? "st" : place % 10 === 2 && place % 100 !== 12 ? "nd" : place % 10 === 3 && place % 100 !== 13 ? "rd" : "th";
  return `${place}${suffix}`;
}

function RoundSettings({ settings, onChange, disabled }) {
  return (
    <div className="gameSetupOptions">
      <label>
        Board size
        <select
          className="input"
          value={String(settings.boardSize)}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, boardSize: Number(event.target.value) })}
        >
          {BOARD_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} × {size} · {mineCountForSize(size)} mines
            </option>
          ))}
        </select>
      </label>
      <label>
        When someone hits a mine
        <select
          className="input"
          value={settings.mineRule}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, mineRule: event.target.value })}
        >
          {MINE_RULE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        Time limit
        <select
          className="input"
          value={String(settings.timeLimitSeconds)}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, timeLimitSeconds: Number(event.target.value) })}
        >
          {TIME_LIMIT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>{timeLimitLabel(seconds)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function RaceRoster({ session, viewerId }) {
  const players = session.players || [];
  const showRound = session.currentRound > 0 && session.status !== "lobby";

  if (players.length === 0) {
    return <p className="raceRosterEmpty">No players have joined yet.</p>;
  }

  return (
    <ol className="raceRoster">
      {players.map((player) => {
        const round = player.round;
        let detail = `${round.progress}%`;
        if (round.status === "finished") detail = `${placeLabel(round.place)} · ${formatRaceTime(round.elapsedMs)}`;
        else if (round.status === "out") detail = `Out · ${round.progress}%`;

        return (
          <li
            key={player.userId}
            className={`raceRosterRow ${player.userId === viewerId ? "isViewer" : ""} ${
              player.isPresent ? "" : "isAway"
            } is-${round.status}`}
          >
            <div className="raceRosterName">
              <strong>{player.displayName}</strong>
              {player.isTeacher ? <span className="raceTag">Teacher</span> : null}
              <span className="raceRosterPoints">{player.totalPoints} pts</span>
            </div>
            {showRound ? (
              <div className="raceRosterProgress">
                <span className="raceBarTrack">
                  <span style={{ width: `${round.progress}%` }} />
                </span>
                <span className="raceRosterDetail">
                  {detail}
                  {round.mineHits > 0 ? ` · 💥${round.mineHits}` : ""}
                  {round.points ? ` · +${round.points}` : ""}
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Standings({ session, viewerId }) {
  const standings = [...(session.players || [])].sort(
    (a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName)
  );
  return (
    <div className="gameLeaderboardList">
      {standings.map((player, index) => (
        <div key={player.userId} className={`gameLeaderboardRow ${player.userId === viewerId ? "raceStandingViewer" : ""}`}>
          <strong>#{index + 1}</strong>
          <span>
            {player.displayName}
            {player.isTeacher ? " (Teacher)" : ""}
          </span>
          <strong>{player.totalPoints}</strong>
        </div>
      ))}
    </div>
  );
}

export default function MinesweeperRaceClient({ courses, initialCourseId, userId }) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [settings, setSettings] = useState({
    boardSize: RACE_DEFAULT_BOARD_SIZE,
    mineRule: MINE_RULE_FREEZE,
    timeLimitSeconds: 0,
  });
  const [teacherPlaying, setTeacherPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("reveal");

  // One player's copy of the shared board for the current round.
  const [play, setPlay] = useState(null);
  const playRef = useRef(null);
  const dirtyRef = useRef(false);
  const sendingRef = useRef(false);

  const course = courses.find((entry) => entry.id === courseId) || null;
  const canHost = isTeacherRelationship(course?.relationship);

  // While racing, the regular poll is replaced by a progress report whenever
  // the board has changed since the last one.
  const pollOverride = useCallback(() => {
    const current = playRef.current;
    if (!current || !dirtyRef.current || sendingRef.current) return false;
    current.report("progress");
    return true;
  }, []);

  const { session, loaded, pollError, post, serverNowMs, getServerNowMs } = useRaceSession(courseId, {
    pollOverride,
  });

  const sessionId = session?.id || "";
  const round = session?.currentRound || 0;
  const seed = session?.seed || "";
  const boardSize = session?.boardSize || RACE_DEFAULT_BOARD_SIZE;
  const mineRule = session?.mineRule || MINE_RULE_FREEZE;
  const viewer = session?.viewer || null;
  const viewerRound = viewer?.round || null;

  // Host controls start from the race's current settings (after a reload, say).
  useEffect(() => {
    if (!sessionId) return;
    setSettings({ boardSize, mineRule, timeLimitSeconds: session?.timeLimitSeconds || 0 });
    // Only when a different race loads; later edits belong to the teacher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const board = useMemo(() => (seed ? buildRaceBoard(seed, boardSize) : null), [seed, boardSize]);
  const storageKey = sessionId && round ? saveKey(sessionId, round, userId) : "";

  // Load (or resume) this player's board whenever a new round's puzzle arrives.
  useEffect(() => {
    if (!board || !storageKey) {
      setPlay(null);
      return;
    }
    const saved = readSavedRound(storageKey);
    const restored = saved ? restorePlayState(board, saved.cells) : null;
    setPlay({
      key: storageKey,
      cells: restored || createPlayState(board),
      mineHits: restored ? Number(saved.mineHits || 0) : 0,
      restarts: restored ? Number(saved.restarts || 0) : 0,
      frozenUntilMs: restored ? Number(saved.frozenUntilMs || 0) : 0,
    });
    dirtyRef.current = Boolean(restored);
    setMode("reveal");
    setNotice("");
  }, [board, storageKey]);

  const clock = describeRoundClock(session, serverNowMs);
  const activePlay = play && play.key === storageKey ? play : null;
  const revealedSafe = board && activePlay ? countRevealedSafe(board, activePlay.cells) : 0;
  const cleared = Boolean(board && activePlay && isBoardCleared(board, activePlay.cells));
  const mineHits = Math.max(activePlay?.mineHits || 0, viewerRound?.mineHits || 0);
  const isOut = viewerRound?.status === "out" || (mineRule === MINE_RULE_OUT && mineHits > 0);
  const isFinished = viewerRound?.status === "finished" || cleared;
  const frozenSeconds =
    activePlay && activePlay.frozenUntilMs > serverNowMs
      ? Math.ceil((activePlay.frozenUntilMs - serverNowMs) / 1000)
      : 0;
  const canPlay =
    session?.status === "racing" &&
    clock.phase === "running" &&
    Boolean(viewer?.isPlaying) &&
    Boolean(activePlay) &&
    !isFinished &&
    !isOut &&
    frozenSeconds === 0;

  const report = useCallback(
    async (action, overrides = {}) => {
      const current = playRef.current;
      if (!current?.sessionId || sendingRef.current) return;
      sendingRef.current = true;
      dirtyRef.current = false;
      try {
        await post({
          action,
          sessionId: current.sessionId,
          round: current.round,
          revealedSafe: current.revealedSafe,
          mineHits: current.mineHits,
          restarts: current.restarts,
          ...overrides,
        });
      } catch {
        // Keep the report queued; the next poll tick retries it.
        dirtyRef.current = true;
      } finally {
        sendingRef.current = false;
      }
    },
    [post]
  );

  useEffect(() => {
    playRef.current = activePlay
      ? {
          sessionId,
          round,
          revealedSafe,
          mineHits: activePlay.mineHits,
          restarts: activePlay.restarts,
          report,
        }
      : null;
  }, [activePlay, report, revealedSafe, round, sessionId]);

  // The finish is the one report that must land: keep sending it until the
  // server shows this player as finished.
  const needsFinish =
    cleared && session?.status === "racing" && viewerRound?.status !== "finished" && viewerRound?.status !== "out";
  useEffect(() => {
    if (!needsFinish) return undefined;
    const send = () => playRef.current?.report("finish");
    const first = window.setTimeout(send, 0);
    const retry = window.setInterval(send, 1500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(retry);
    };
  }, [needsFinish]);

  // Students (and co-teachers watching) join the race as soon as one is open.
  const needsJoin = Boolean(sessionId && viewer && !viewer.isJoined && session.status !== "ended");
  useEffect(() => {
    if (!needsJoin) return;
    post({ action: "join", sessionId }).catch(() => {});
  }, [needsJoin, post, sessionId]);

  function commitPlay(nextPlay, { immediate = false } = {}) {
    setPlay(nextPlay);
    writeSavedRound(nextPlay.key, {
      cells: serializePlayState(nextPlay.cells),
      mineHits: nextPlay.mineHits,
      restarts: nextPlay.restarts,
      frozenUntilMs: nextPlay.frozenUntilMs,
    });
    dirtyRef.current = true;
    if (immediate) {
      playRef.current = {
        sessionId,
        round,
        revealedSafe: countRevealedSafe(board, nextPlay.cells),
        mineHits: nextPlay.mineHits,
        restarts: nextPlay.restarts,
        report,
      };
      report("progress");
    }
  }

  function handleReveal(row, col) {
    if (!canPlay) return;
    const result = revealCell(board, activePlay.cells, row, col);
    if (!result.changed) return;

    if (!result.hitMine) {
      commitPlay({ ...activePlay, cells: result.state });
      return;
    }

    const nextHits = activePlay.mineHits + 1;
    if (mineRule === MINE_RULE_RESTART) {
      setNotice("Boom! Your board was reset. The clock is still running.");
      commitPlay(
        { ...activePlay, cells: createPlayState(board), mineHits: nextHits, restarts: activePlay.restarts + 1 },
        { immediate: true }
      );
      return;
    }
    if (mineRule === MINE_RULE_OUT) {
      setNotice("");
      commitPlay({ ...activePlay, cells: result.state, mineHits: nextHits }, { immediate: true });
      return;
    }
    setNotice("");
    commitPlay(
      {
        ...activePlay,
        cells: result.state,
        mineHits: nextHits,
        frozenUntilMs: getServerNowMs() + MINE_FREEZE_SECONDS * 1000,
      },
      { immediate: true }
    );
  }

  function handleFlag(row, col) {
    if (!canPlay) return;
    const nextCells = toggleFlag(activePlay.cells, row, col);
    if (nextCells === activePlay.cells) return;
    setPlay({ ...activePlay, cells: nextCells });
    writeSavedRound(activePlay.key, {
      cells: serializePlayState(nextCells),
      mineHits: activePlay.mineHits,
      restarts: activePlay.restarts,
      frozenUntilMs: activePlay.frozenUntilMs,
    });
  }

  function handleCellAction(row, col) {
    if (mode === "flag") handleFlag(row, col);
    else handleReveal(row, col);
  }

  async function runAction(body, successNotice = "") {
    setBusy(true);
    setNotice("");
    try {
      await post(body);
      setNotice(successNotice);
    } catch (error) {
      setNotice(error.message || "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleEndRace() {
    if (!window.confirm("End this race for the whole class? Standings will be final.")) return;
    runAction({ action: "end_session", sessionId });
  }

  // When a time limit runs out, the host's screen closes the round for everyone.
  const shouldAutoEnd = Boolean(session?.canManage && session.status === "racing" && clock.phase === "timeup");
  useEffect(() => {
    if (!shouldAutoEnd) return undefined;
    const timer = window.setTimeout(() => {
      post({ action: "end_round", sessionId }).catch(() => {});
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [post, sessionId, shouldAutoEnd]);

  if (courses.length === 0) {
    return (
      <section className="card">
        <h2>No classes yet</h2>
        <p>Join a class, or ask your teacher to turn on Minesweeper for your class, to play a race.</p>
      </section>
    );
  }

  const displayHref = `/play/minesweeper-race/display?course=${encodeURIComponent(courseId)}`;
  const status = session?.status || "none";
  const myEntry = session?.players?.find((player) => player.userId === userId) || null;
  const progress = board ? progressPercent(viewerRound?.status === "finished" ? board.safeCount : revealedSafe, board) : 0;
  const flagsUsed = activePlay ? countFlags(activePlay.cells) : 0;
  const minesFound = activePlay ? activePlay.cells.flat().filter((cell) => cell.exploded).length : 0;
  const minesLeft = board ? Math.max(0, board.mineCount - flagsUsed - minesFound) : 0;

  const classPicker =
    courses.length > 1 ? (
      <label className="raceClassPicker">
        Class
        <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          {courses.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.title}</option>
          ))}
        </select>
      </label>
    ) : null;

  let stageStatus = "Waiting";
  if (status === "racing") {
    if (clock.phase === "countdown") stageStatus = "Get ready";
    else if (viewerRound?.status === "finished") stageStatus = "Finished";
    else if (isOut) stageStatus = "Out this round";
    else if (clock.phase === "timeup") stageStatus = "Time is up";
    else if (frozenSeconds > 0) stageStatus = `Frozen ${frozenSeconds}s`;
    else if (!viewer?.isPlaying) stageStatus = "Hosting";
    else stageStatus = `${mode === "flag" ? "Flag" : "Reveal"} mode`;
  } else if (status === "results") stageStatus = "Round over";
  else if (status === "lobby") stageStatus = "Lobby open";

  const showBoard = Boolean(board && activePlay && viewer?.isPlaying && (status === "racing" || status === "results"));
  const boardHidden = status === "racing" && clock.phase === "countdown";

  let banner = null;
  if (status === "racing" && viewer?.isPlaying) {
    if (clock.phase === "countdown") {
      banner = { tone: "active", text: `Round ${round} starts in ${clock.countdownSeconds}...` };
    } else if (viewerRound?.status === "finished") {
      banner = {
        tone: "won",
        text: `Board cleared in ${formatRaceTime(viewerRound.elapsedMs)}! You finished ${placeLabel(myEntry?.round.place) || "the board"}.`,
      };
    } else if (cleared) {
      banner = { tone: "won", text: "Board cleared! Recording your finish..." };
    } else if (isOut) {
      banner = { tone: "lost", text: "You hit a mine and are out for this round. Watch the standings for the next one." };
    } else if (clock.phase === "timeup") {
      banner = { tone: "lost", text: "Time is up! Waiting for your teacher to close the round." };
    } else if (frozenSeconds > 0) {
      banner = { tone: "lost", text: `Boom! You hit a mine. Frozen for ${frozenSeconds} more second${frozenSeconds === 1 ? "" : "s"}.` };
    }
  } else if (status === "results" && viewer?.isPlaying && myEntry) {
    const earned = myEntry.round.points || 0;
    banner = {
      tone: myEntry.round.place ? "won" : "active",
      text: myEntry.round.place
        ? `Round ${round}: you finished ${placeLabel(myEntry.round.place)} and earned ${earned} point${earned === 1 ? "" : "s"}.`
        : `Round ${round} is over. You cleared ${myEntry.round.progress}% and earned ${earned} point${earned === 1 ? "" : "s"}.`,
    };
  }

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        <GameStage
          eyebrow={status === "none" || status === "ended" ? course?.title || "Minesweeper Race" : `Round ${round || 1} · ${boardSize} × ${boardSize}`}
          title={status === "racing" || status === "results" ? "Shared minefield" : "Race lobby"}
          status={stageStatus}
          progress={progress}
          progressLabel={showBoard ? `${progress}% of the board cleared` : "Waiting for the round to start"}
          stats={[
            { label: "Mines left", value: showBoard && !boardHidden ? minesLeft : "–" },
            {
              label: viewerRound?.elapsedMs == null && clock.remainingMs !== null ? "Time left" : "Time",
              value:
                viewerRound?.elapsedMs != null && status !== "lobby"
                  ? formatRaceTime(viewerRound.elapsedMs)
                  : status === "racing" && clock.phase !== "countdown"
                    ? formatRaceTime(clock.remainingMs !== null ? clock.remainingMs : clock.elapsedMs)
                    : "–",
            },
            { label: "My points", value: myEntry?.totalPoints ?? 0 },
          ]}
        >
          <div className="minesweeperPlayfield">
            {pollError ? (
              <div className="minesweeperStatusBanner lost" role="status">
                <strong>{pollError}</strong>
              </div>
            ) : null}

            {!loaded ? <p className="minesweeperHelp">Loading the race...</p> : null}

            {loaded && (status === "none" || status === "ended") ? (
              <div className="raceWaiting">
                <h3>{status === "ended" ? "That race has ended" : canHost ? "Open a race for this class" : "Waiting for your teacher"}</h3>
                <p>
                  {canHost
                    ? "Choose the round settings in the Host controls, then open the lobby. Students join from Arcade → Minesweeper Race."
                    : "When your teacher opens a Minesweeper Race, it will appear here automatically. Keep this page open."}
                </p>
                {status === "ended" && session?.players?.length ? <Standings session={session} viewerId={userId} /> : null}
              </div>
            ) : null}

            {status === "lobby" ? (
              <div className="raceWaiting">
                <h3>{session.joinedCount} player{session.joinedCount === 1 ? "" : "s"} in the lobby</h3>
                <p>
                  {session.canManage
                    ? "Start the round when everyone is in. All boards unlock at the same moment after a short countdown."
                    : "You are in! The board will appear the moment your teacher starts the round."}
                </p>
                <p className="raceRuleLine">
                  {boardSize} × {boardSize} · {mineCountForSize(boardSize)} mines · {mineRuleLabel(mineRule)} · {timeLimitLabel(session.timeLimitSeconds)}
                </p>
              </div>
            ) : null}

            {(status === "racing" || status === "results") && !viewer?.isPlaying ? (
              <div className="raceWaiting">
                <h3>{session.canManage ? "You are hosting this round" : "Joining the race..."}</h3>
                <p>
                  {session.canManage
                    ? `${session.finishedCount} of ${session.joinedCount} players have finished. Turn on “I'm playing too” to race in the next round.`
                    : "Hang tight."}
                </p>
              </div>
            ) : null}

            {banner ? (
              <div className={`minesweeperStatusBanner ${banner.tone}`} aria-live="polite">
                <strong>{banner.text}</strong>
              </div>
            ) : null}

            {showBoard ? (
              <>
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
                  <span>{mineRuleLabel(mineRule)}</span>
                </div>

                <div className="minesweeperBoardViewport">
                  <div
                    className={`minesweeperBoard raceBoard ${boardHidden ? "isHidden" : ""} ${canPlay ? "" : "isLocked"}`}
                    style={{
                      gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                      width: boardSize <= 10 ? "min(100%, 32rem)" : `${boardSize * 30}px`,
                      maxWidth: boardSize <= 10 ? "32rem" : "none",
                    }}
                  >
                    {board.cells.map((row, rowIndex) =>
                      row.map((cell, colIndex) => {
                        const playCell = boardHidden
                          ? { revealed: false, flagged: false, exploded: false }
                          : activePlay.cells[rowIndex][colIndex];
                        let label = "";
                        if (playCell.exploded) label = "💥";
                        else if (playCell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
                        else if (playCell.flagged) label = "🚩";

                        return (
                          <button
                            key={`${rowIndex}-${colIndex}`}
                            type="button"
                            className={`minesweeperCell ${playCell.revealed ? "isRevealed" : ""} ${
                              playCell.exploded ? "isMine" : ""
                            } ${playCell.flagged ? "isFlagged" : ""} ${numberClassName(cell, playCell)}`}
                            aria-disabled={!canPlay}
                            onClick={() => handleCellAction(rowIndex, colIndex)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              handleFlag(rowIndex, colIndex);
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
                  Everyone starts with the same opened patch. Tap to reveal. Right-click to flag, or switch to Flag mode on touch screens.
                </p>
              </>
            ) : null}

            {notice ? (
              <div className="minesweeperStatusBanner active" aria-live="polite">
                <strong>{notice}</strong>
              </div>
            ) : null}
          </div>
        </GameStage>
      </div>

      <div className="gameWorkspaceRail">
        {canHost ? (
          <GameSidePanel eyebrow="Teacher" title="Host controls">
            {classPicker}
            {status === "none" || status === "ended" ? (
              <>
                <RoundSettings settings={settings} onChange={setSettings} disabled={busy} />
                <label className="toggleRow raceToggle">
                  <input
                    type="checkbox"
                    checked={teacherPlaying}
                    onChange={(event) => setTeacherPlaying(event.target.checked)}
                  />
                  I&apos;m playing too
                </label>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy || !courseId}
                  onClick={() =>
                    runAction({ action: "create", courseId, ...settings, teacherPlaying }, "Lobby is open. Students can join now.")
                  }
                >
                  Open Race Lobby
                </button>
              </>
            ) : null}

            {status === "lobby" || status === "results" ? (
              <>
                <RoundSettings
                  settings={settings}
                  onChange={setSettings}
                  disabled={busy}
                />
                <label className="toggleRow raceToggle">
                  <input
                    type="checkbox"
                    checked={Boolean(viewer?.isPlaying)}
                    disabled={busy}
                    onChange={(event) => runAction({ action: "set_playing", sessionId, playing: event.target.checked })}
                  />
                  I&apos;m playing too
                </label>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => runAction({ action: "start_round", sessionId, ...settings })}
                >
                  {status === "lobby" ? "Start Round 1" : `Start Round ${round + 1}`}
                </button>
              </>
            ) : null}

            {status === "racing" ? (
              <>
                <p className="gameSetupSummary">
                  {session.finishedCount} of {session.joinedCount} finished
                </p>
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => runAction({ action: "end_round", sessionId })}
                >
                  End Round
                </button>
              </>
            ) : null}

            {status !== "none" && status !== "ended" ? (
              <div className="raceHostLinks">
                <a className="btn" href={displayHref} target="_blank" rel="noopener noreferrer">
                  Open Display ↗
                </a>
                <button className="btn danger" type="button" disabled={busy} onClick={handleEndRace}>
                  End Race
                </button>
              </div>
            ) : null}
            {status !== "none" && status !== "ended" ? (
              <p className="minesweeperHelp">
                Open Display puts the live standings in a new window for the main board. It never shows the puzzle.
              </p>
            ) : null}
          </GameSidePanel>
        ) : classPicker ? (
          <GameSidePanel eyebrow="Class" title="Choose your class">
            {classPicker}
          </GameSidePanel>
        ) : null}

        {session && status !== "ended" ? (
          <GameSidePanel eyebrow={status === "lobby" ? "Lobby" : `Round ${round}`} title={status === "lobby" ? "Who's in" : "Live race"}>
            <RaceRoster session={session} viewerId={userId} />
          </GameSidePanel>
        ) : null}

        {session && round > 0 && status !== "ended" ? (
          <GameSidePanel eyebrow="Series" title="Standings">
            <Standings session={session} viewerId={userId} />
          </GameSidePanel>
        ) : null}
      </div>
    </GameWorkspace>
  );
}
