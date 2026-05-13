import test from "node:test";
import assert from "node:assert/strict";

import { buildBoardSnapshots, emptyBoard } from "../lib/student-games/connect4.js";

test("buildBoardSnapshots reconstructs move-by-move Connect 4 boards", () => {
  const snapshots = buildBoardSnapshots([
    { column: 3, row: 5, token: "R", playerId: "red", moveNumber: 1, createdAt: "2026-05-13T10:00:00Z" },
    { column: 3, row: 4, token: "Y", playerId: "yellow", moveNumber: 2, createdAt: "2026-05-13T10:00:01Z" },
    { column: 2, row: 5, token: "R", playerId: "red", moveNumber: 3, createdAt: "2026-05-13T10:00:02Z" },
  ]);

  assert.equal(snapshots.length, 4);
  assert.deepEqual(snapshots[0].board, emptyBoard());
  assert.equal(snapshots[1].board[5][3], "R");
  assert.equal(snapshots[2].board[4][3], "Y");
  assert.equal(snapshots[3].board[5][2], "R");
  assert.equal(snapshots[3].move.moveNumber, 3);
});

test("buildBoardSnapshots falls back to the saved board for older games", () => {
  const finalBoard = emptyBoard();
  finalBoard[5][0] = "R";

  const snapshots = buildBoardSnapshots([], finalBoard);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].moveNumber, 0);
  assert.equal(snapshots[0].board[5][0], "R");
});
