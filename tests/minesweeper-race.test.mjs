import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRaceBoard,
  clampRevealedSafe,
  countRevealedSafe,
  createPlayState,
  describeRoundClock,
  formatRaceTime,
  isBoardCleared,
  mineCountForSize,
  normalizeBoardSize,
  normalizeMineRule,
  normalizeTimeLimit,
  pointsForPlace,
  pointsForRankedEntry,
  progressPercent,
  rankRound,
  restorePlayState,
  revealCell,
  serializePlayState,
  toggleFlag,
} from "../lib/student-games/minesweeper-race.js";

function mineLayout(board) {
  return board.cells.map((row) => row.map((cell) => (cell.mine ? "*" : cell.adjacent)).join("")).join("/");
}

test("the same seed and size always produce the same board", () => {
  const first = buildRaceBoard("round-seed-1", 12);
  const second = buildRaceBoard("round-seed-1", 12);
  assert.equal(mineLayout(first), mineLayout(second));
  assert.deepEqual(first.start, second.start);
  assert.deepEqual(first.opening, second.opening);
  assert.notEqual(mineLayout(first), mineLayout(buildRaceBoard("round-seed-2", 12)));
});

test("every supported size has the right mine count and a mine-free opening", () => {
  for (let size = 6; size <= 22; size += 1) {
    for (const seed of ["a", "b", "c", "d"]) {
      const board = buildRaceBoard(seed, size);
      const mines = board.cells.flat().filter((cell) => cell.mine).length;
      assert.equal(mines, mineCountForSize(size), `mine count for ${size}`);
      assert.equal(board.safeCount, size * size - mines);
      assert.equal(board.cells[board.start.row][board.start.col].adjacent, 0);
      assert.ok(board.openingCount >= 9, `opening for ${size}/${seed} is at least the 3x3 block`);
      assert.ok(board.openingCount < board.safeCount, `opening for ${size}/${seed} leaves work to do`);
      for (const [row, col] of board.opening) {
        assert.equal(board.cells[row][col].mine, false);
      }
    }
  }
});

test("adjacent counts match the mines around each square", () => {
  const board = buildRaceBoard("counts", 10);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      let expected = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          if (board.cells[row + dr]?.[col + dc]?.mine) expected += 1;
        }
      }
      assert.equal(board.cells[row][col].adjacent, expected);
    }
  }
});

test("a fresh play state shows only the shared opening and zero progress", () => {
  const board = buildRaceBoard("fresh", 9);
  const state = createPlayState(board);
  assert.equal(countRevealedSafe(board, state), board.openingCount);
  assert.equal(progressPercent(board.openingCount, board), 0);
  assert.equal(progressPercent(board.safeCount, board), 100);
  assert.equal(isBoardCleared(board, state), false);
});

test("revealing every safe square clears the board without hitting a mine", () => {
  const board = buildRaceBoard("clear", 8);
  let state = createPlayState(board);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board.cells[row][col].mine) continue;
      const result = revealCell(board, state, row, col);
      assert.equal(result.hitMine, false);
      state = result.state;
    }
  }
  assert.equal(isBoardCleared(board, state), true);
});

test("hitting a mine marks it exploded and it cannot be hit again", () => {
  const board = buildRaceBoard("boom", 9);
  const state = createPlayState(board);
  let mine = null;
  board.cells.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (cell.mine && !mine) mine = [rowIndex, colIndex];
    })
  );
  const hit = revealCell(board, state, mine[0], mine[1]);
  assert.equal(hit.hitMine, true);
  assert.equal(hit.state[mine[0]][mine[1]].exploded, true);
  assert.equal(countRevealedSafe(board, hit.state), board.openingCount);
  const again = revealCell(board, hit.state, mine[0], mine[1]);
  assert.equal(again.changed, false);
  assert.equal(again.hitMine, false);
});

test("flagged squares are protected from reveals and can be unflagged", () => {
  const board = buildRaceBoard("flags", 9);
  let state = createPlayState(board);
  let target = null;
  state.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (!cell.revealed && !target) target = [rowIndex, colIndex];
    })
  );
  state = toggleFlag(state, target[0], target[1]);
  assert.equal(state[target[0]][target[1]].flagged, true);
  assert.equal(revealCell(board, state, target[0], target[1]).changed, false);
  state = toggleFlag(state, target[0], target[1]);
  assert.equal(state[target[0]][target[1]].flagged, false);
});

test("a saved board restores exactly and rejects the wrong size or tampering", () => {
  const board = buildRaceBoard("save", 9);
  let state = createPlayState(board);
  let hidden = [];
  let mine = null;
  board.cells.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (cell.mine && !mine) mine = [rowIndex, colIndex];
      if (!cell.mine && !state[rowIndex][colIndex].revealed) hidden.push([rowIndex, colIndex]);
    })
  );
  state = revealCell(board, state, hidden[0][0], hidden[0][1]).state;
  state = revealCell(board, state, mine[0], mine[1]).state;
  const lastHidden = hidden.findLast(([row, col]) => !state[row][col].revealed);
  state = toggleFlag(state, lastHidden[0], lastHidden[1]);

  const saved = serializePlayState(state);
  assert.deepEqual(restorePlayState(board, saved), state);
  assert.equal(restorePlayState(board, saved.slice(1)), null);

  // Claiming every square is revealed cannot uncover mines as safe squares.
  const everything = restorePlayState(board, "r".repeat(81));
  assert.equal(countRevealedSafe(board, everything), board.safeCount);
  assert.equal(everything[mine[0]][mine[1]].revealed, false);
});

test("settings are normalized to supported values", () => {
  assert.equal(normalizeBoardSize(3), 6);
  assert.equal(normalizeBoardSize(40), 22);
  assert.equal(normalizeBoardSize("12"), 12);
  assert.equal(normalizeBoardSize("nope"), 9);
  assert.equal(normalizeMineRule("out"), "out");
  assert.equal(normalizeMineRule("anything"), "freeze");
  assert.equal(normalizeTimeLimit(180), 180);
  assert.equal(normalizeTimeLimit(7), 0);
});

test("reported progress is clamped to what the board allows", () => {
  const board = buildRaceBoard("clamp", 9);
  assert.equal(clampRevealedSafe(-5, board), board.openingCount);
  assert.equal(clampRevealedSafe(9999, board), board.safeCount);
  assert.equal(clampRevealedSafe("junk", board), board.openingCount);
});

test("finishers rank by time, everyone else by progress, and only finishers place", () => {
  const ranked = rankRound([
    { userId: "slow", status: "finished", elapsedMs: 90000, progress: 100 },
    { userId: "half", status: "playing", progress: 55, mineHits: 2 },
    { userId: "fast", status: "finished", elapsedMs: 42000, progress: 100 },
    { userId: "out", status: "out", progress: 80, mineHits: 1 },
    { userId: "idle", status: "playing", progress: 0, mineHits: 0 },
  ]);
  assert.deepEqual(ranked.map((entry) => entry.userId), ["fast", "slow", "out", "half", "idle"]);
  assert.deepEqual(ranked.map((entry) => entry.place), [1, 2, null, null, null]);
});

test("points follow the place table with finisher and half-board credit", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(pointsForPlace), [10, 8, 6, 5, 4, 3, 2, 2]);
  assert.equal(pointsForRankedEntry({ place: 1 }), 10);
  assert.equal(pointsForRankedEntry({ place: null, progress: 50 }), 1);
  assert.equal(pointsForRankedEntry({ place: null, progress: 49 }), 0);
});

test("race times format as minutes and seconds", () => {
  assert.equal(formatRaceTime(0), "0:00");
  assert.equal(formatRaceTime(65400), "1:05");
});

test("the round clock moves from countdown to running to time up", () => {
  const start = Date.parse("2026-11-13T15:00:00.000Z");
  const session = { status: "racing", roundStartedAt: "2026-11-13T15:00:00.000Z", timeLimitSeconds: 120 };
  assert.equal(describeRoundClock({ ...session, status: "lobby" }, start).phase, "idle");
  assert.deepEqual(describeRoundClock(session, start - 2400), {
    phase: "countdown",
    countdownSeconds: 3,
    elapsedMs: 0,
    remainingMs: null,
  });
  const running = describeRoundClock(session, start + 30000);
  assert.equal(running.phase, "running");
  assert.equal(running.elapsedMs, 30000);
  assert.equal(running.remainingMs, 90000);
  assert.equal(describeRoundClock(session, start + 120000).phase, "timeup");
  assert.equal(describeRoundClock({ ...session, timeLimitSeconds: 0 }, start + 999000).remainingMs, null);
});
