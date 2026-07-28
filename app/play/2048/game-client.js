"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSeededRandom } from "@/lib/student-games/seeded-random";
import {
  GameSidePanel,
  GameStage,
  GameWorkspace,
} from "../game-shell";

const SAVED_GAME_KEY = "mathclaw:2048:saved-game:v1";

function randomEmptyCell(board, random = Math.random) {
  const cells = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) cells.push([r, c]);
    });
  });
  if (cells.length === 0) return null;
  return cells[Math.floor(random() * cells.length)];
}

function spawnTile(board, random = Math.random) {
  const next = board.map((row) => [...row]);
  const cell = randomEmptyCell(next, random);
  if (!cell) return next;
  const [r, c] = cell;
  next[r][c] = random() < 0.9 ? 2 : 4;
  return next;
}

function freshBoard(random = Math.random) {
  return spawnTile(
    spawnTile(Array.from({ length: 4 }, () => Array(4).fill(0)), random),
    random
  );
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

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function sortLeaderboardRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const bestGap = Number(b.best_score || 0) - Number(a.best_score || 0);
    if (bestGap !== 0) return bestGap;
    const avgGap = Number(b.average_score || 0) - Number(a.average_score || 0);
    if (avgGap !== 0) return avgGap;
    return Number(b.last_10_average || 0) - Number(a.last_10_average || 0);
  });
}

function isValidBoard(board) {
  return (
    Array.isArray(board) &&
    board.length === 4 &&
    board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        row.every((cell) => Number.isInteger(cell) && cell >= 0)
    )
  );
}

function readSavedGame() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SAVED_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidBoard(parsed?.board)) return null;
    return {
      board: parsed.board,
      score: Number(parsed.score || 0),
      courseId: typeof parsed.courseId === "string" ? parsed.courseId : "",
      isWon: parsed.isWon === true,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

function persistSavedGame(snapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(snapshot));
}

function clearSavedGame() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_GAME_KEY);
}

function normalizeServerSavedGame(savedGame) {
  if (!savedGame || !isValidBoard(savedGame?.state?.board)) return null;

  return {
    board: savedGame.state.board,
    score: Number(savedGame.state.score || 0),
    courseId: typeof savedGame.courseId === "string" ? savedGame.courseId : "",
    isWon: savedGame.state.isWon === true,
    savedAt: typeof savedGame.updatedAt === "string" ? savedGame.updatedAt : "",
  };
}

export default function Game2048Client({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  savedGame,
  initialSeed,
}) {
  const [board, setBoard] = useState(() => freshBoard(createSeededRandom(initialSeed)));
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
  const [hasLoadedSavedGame, setHasLoadedSavedGame] = useState(false);

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

  useEffect(() => {
    if (hasLoadedSavedGame) return;

    const localSavedGame = readSavedGame();
    const serverSavedGame = normalizeServerSavedGame(savedGame);
    const chosenSavedGame =
      localSavedGame && serverSavedGame
        ? new Date(localSavedGame.savedAt || 0).getTime() >=
          new Date(serverSavedGame.savedAt || 0).getTime()
          ? localSavedGame
          : serverSavedGame
        : localSavedGame || serverSavedGame;

    if (!chosenSavedGame) {
      setHasLoadedSavedGame(true);
      return;
    }

    const courseStillAvailable =
      !chosenSavedGame.courseId ||
      courses.some((course) => course.id === chosenSavedGame.courseId);

    if (!courseStillAvailable) {
      clearSavedGame();
      setHasLoadedSavedGame(true);
      return;
    }

    setBoard(chosenSavedGame.board);
    setScore(chosenSavedGame.score);
    setCourseId(chosenSavedGame.courseId || "");
    setIsWon(chosenSavedGame.isWon);
    setIsGameOver(false);
    setShowOverlay(false);
    setStatus("Saved game restored.");
    setHasLoadedSavedGame(true);
    persistSavedGame(chosenSavedGame);
  }, [courses, hasLoadedSavedGame, savedGame]);

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
        setLeaderboardRows(sortLeaderboardRows(Array.isArray(payload.leaderboard) ? payload.leaderboard : []));
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

  const saveBoardState = useCallback(
    async (overrideStatus = "Game saved. Come back any time to continue.") => {
      const snapshot = {
        board: boardRef.current,
        score: scoreRef.current,
        courseId,
        isWon,
        savedAt: new Date().toISOString(),
      };
      persistSavedGame(snapshot);

      const response = await fetch("/api/play/save-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug: "2048",
          courseId: courseId || null,
          state: {
            board: snapshot.board,
            score: snapshot.score,
            isWon: snapshot.isWon,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not save this board.");
      }

      setStatus(overrideStatus);
    },
    [courseId, isWon]
  );

  const clearSavedBoardState = useCallback(async () => {
    clearSavedGame();
    await fetch("/api/play/save-state?gameSlug=2048", {
      method: "DELETE",
    }).catch(() => {});
  }, []);

  const startNewGame = useCallback(
    (resultToSave = null) => {
      if (resultToSave && scoreRef.current > 0) {
        saveSession(scoreRef.current, boardRef.current, resultToSave);
      }
      clearSavedBoardState();
      setBoard(freshBoard());
      setScore(0);
      setIsWon(false);
      setIsGameOver(false);
      setShowOverlay(false);
      savedResultsRef.current.clear();
      setStatus("");
    },
    [clearSavedBoardState, saveSession]
  );

  async function handleCourseChange(nextCourseId) {
    if (nextCourseId === courseId) return;
    if (scoreRef.current > 0) {
      await saveSession(scoreRef.current, boardRef.current, "switched_class");
    }
    await clearSavedBoardState();
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
        clearSavedBoardState();
        saveSession(nextScore, nextBoard, "milestone_2048");
      } else if (ended) {
        setIsGameOver(true);
        setShowOverlay(true);
        setStatus("Game over.");
        clearSavedBoardState();
        saveSession(nextScore, nextBoard, "finished");
      } else {
        setStatus("");
      }
    },
    [clearSavedBoardState, isGameOver, isWon, saveSession]
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

  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class leaderboard";
  const tileProgress = Math.min(100, (Math.log2(Math.max(2, bestTile)) / 11) * 100);

  return (
    <GameWorkspace>
      <div className="gameWorkspaceMain">
        <GameStage
          eyebrow="Current board"
          title="Power Tile Run"
          status={isGameOver ? "Game over" : isWon ? "2048 reached" : hasLoadedSavedGame ? "Board active" : "Loading save"}
          progress={tileProgress}
          progressLabel={`Best tile ${bestTile} · Goal 2048`}
          stats={[
            { label: "Score", value: score },
            { label: "Best tile", value: bestTile },
            { label: "Saved best", value: localBest },
          ]}
        >
          <div className="game2048Playfield">
            <p className="gameQuestionPrompt">Use arrow keys, swipe the board, or tap the direction pad.</p>
            <div
              className="game2048Wrap"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="game2048Board" aria-label={`2048 board, score ${score}`}>
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

            <div className="game2048Controls" aria-label="Move controls">
              <div />
              <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("up")} aria-label="Move up">
                ↑
              </button>
              <div />
              <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("left")} aria-label="Move left">
                ←
              </button>
              <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("down")} aria-label="Move down">
                ↓
              </button>
              <button className="btn gameMoveBtn" type="button" onClick={() => applyMove("right")} aria-label="Move right">
                →
              </button>
            </div>

            <p className={`gameFeedback ${status.toLowerCase().includes("could not") ? "is-miss" : ""}`}>
              {status || "Combine matching tiles and keep space open for the next move."}
            </p>
          </div>
        </GameStage>
      </div>

      <div className="gameWorkspaceRail">
        <GameSidePanel eyebrow="Setup" title="Manage the run">
          <p className="gameSetupSummary">{courseSummary}</p>
          <div className="gameSetupOptions">
            <label>
              Class context
              <select className="input" value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                <option value="">No class leaderboard</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await saveBoardState();
                  await saveSession(score, board, "manual_save");
                } catch (error) {
                  setStatus(error.message || "Could not save this board.");
                }
              }}
              type="button"
            >
              Save Board
            </button>
            <button className="btn" onClick={() => startNewGame("reset")} type="button">
              New Game
            </button>
          </div>
          <p className="game2048SaveNote">Save Board keeps a resume point on your account for another device.</p>
        </GameSidePanel>

        <GameSidePanel eyebrow="Progress" title="Your stats">
          {personalStats ? (
            <div className="gameSideStats">
              <div><span>Games</span><strong>{personalStats.sessions_played}</strong></div>
              <div><span>High score</span><strong>{personalStats.best_score}</strong></div>
              <div><span>Average</span><strong>{formatScore(personalStats.average_score)}</strong></div>
              <div><span>Last 10</span><strong>{formatScore(personalStats.last_10_average)}</strong></div>
            </div>
          ) : (
            <p>No saved games yet.</p>
          )}

          <details className="gameLeaderboardDetails">
            <summary>{courseId ? `${courseSummary} leaderboard` : "Class leaderboard"}</summary>
            <div className="gameLeaderboardList">
              {!courseId ? <p>Select a class to see your classmates here.</p> : null}
              {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
              {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
                <p>No class scores yet. Save a run to get it started.</p>
              ) : null}
              {leaderboardRows.map((row, index) => (
                <div key={row.player_id} className="gameLeaderboardRow">
                  <strong>#{index + 1}</strong>
                  <span>{row.display_name || `Student ${String(row.player_id).slice(0, 8)}`}</span>
                  <strong>{formatScore(row.best_score)}</strong>
                </div>
              ))}
            </div>
          </details>
        </GameSidePanel>
      </div>
    </GameWorkspace>
  );
}
