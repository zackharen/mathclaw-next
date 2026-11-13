import { createSeededRandom } from "./seeded-random.js";

// Minesweeper Race: the whole class plays one identical, pre-generated board.
// Everything here is pure so the server and every browser derive the same
// puzzle from the round seed.

export const RACE_MIN_BOARD_SIZE = 6;
export const RACE_MAX_BOARD_SIZE = 22;
export const RACE_DEFAULT_BOARD_SIZE = 9;

export const MINE_RULE_FREEZE = "freeze";
export const MINE_RULE_RESTART = "restart";
export const MINE_RULE_OUT = "out";
export const MINE_RULES = [MINE_RULE_FREEZE, MINE_RULE_RESTART, MINE_RULE_OUT];
export const MINE_FREEZE_SECONDS = 10;

export const TIME_LIMIT_OPTIONS = [0, 120, 180, 300, 600];

export const PLACE_POINTS = [10, 8, 6, 5, 4, 3];
export const FINISHER_POINTS = 2;
export const HALF_BOARD_POINTS = 1;

const OPENING_ATTEMPTS = 12;

export function normalizeBoardSize(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size)) return RACE_DEFAULT_BOARD_SIZE;
  return Math.min(RACE_MAX_BOARD_SIZE, Math.max(RACE_MIN_BOARD_SIZE, size));
}

export function normalizeMineRule(value) {
  return MINE_RULES.includes(value) ? value : MINE_RULE_FREEZE;
}

export function normalizeTimeLimit(value) {
  const seconds = Math.round(Number(value));
  return TIME_LIMIT_OPTIONS.includes(seconds) ? seconds : 0;
}

// Same density as the solo game so a size means the same thing in both.
export function mineCountForSize(boardSize) {
  return Math.min(boardSize * boardSize - 10, Math.max(5, Math.round(boardSize * boardSize * 0.12)));
}

export function neighbors(row, col, boardSize) {
  const cells = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < boardSize && nextCol >= 0 && nextCol < boardSize) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function buildCandidate(seed, boardSize, attempt) {
  const random = createSeededRandom(`${seed}:${boardSize}:${attempt}`);
  const mineCount = mineCountForSize(boardSize);

  // The start square sits away from the edge so its whole 3x3 block is on the board.
  const start = {
    row: 1 + Math.floor(random() * (boardSize - 2)),
    col: 1 + Math.floor(random() * (boardSize - 2)),
  };

  const mineKeys = new Set();
  while (mineKeys.size < mineCount) {
    const row = Math.floor(random() * boardSize);
    const col = Math.floor(random() * boardSize);
    if (Math.abs(row - start.row) <= 1 && Math.abs(col - start.col) <= 1) continue;
    mineKeys.add(row * boardSize + col);
  }

  const cells = Array.from({ length: boardSize }, (_, row) =>
    Array.from({ length: boardSize }, (_, col) => ({
      mine: mineKeys.has(row * boardSize + col),
      adjacent: 0,
    }))
  );

  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      cells[row][col].adjacent = neighbors(row, col, boardSize).filter(
        ([neighborRow, neighborCol]) => cells[neighborRow][neighborCol].mine
      ).length;
    }
  }

  const opening = cascadeFrom(cells, start.row, start.col, () => false);

  return {
    boardSize,
    mineCount,
    safeCount: boardSize * boardSize - mineCount,
    start,
    cells,
    opening,
    openingCount: opening.length,
  };
}

// Cells a reveal at (row, col) opens, flood-filling through zero squares.
// `isBlocked(row, col)` skips cells that are already open or flagged.
function cascadeFrom(cells, startRow, startCol, isBlocked) {
  const boardSize = cells.length;
  const seen = new Set();
  const opened = [];
  const queue = [[startRow, startCol]];

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const key = row * boardSize + col;
    if (seen.has(key) || isBlocked(row, col)) continue;
    seen.add(key);
    opened.push([row, col]);

    const cell = cells[row][col];
    if (cell.adjacent === 0 && !cell.mine) {
      neighbors(row, col, boardSize).forEach(([neighborRow, neighborCol]) => {
        if (!cells[neighborRow][neighborCol].mine) queue.push([neighborRow, neighborCol]);
      });
    }
  }

  return opened;
}

// Deterministic board for a round. Tries a few layouts and keeps the first whose
// pre-opened patch is a useful size (not a bare 3x3, not most of the board).
export function buildRaceBoard(seed, boardSizeInput) {
  const boardSize = normalizeBoardSize(boardSizeInput);
  let best = null;

  for (let attempt = 0; attempt < OPENING_ATTEMPTS; attempt += 1) {
    const candidate = buildCandidate(seed, boardSize, attempt);
    const share = candidate.openingCount / candidate.safeCount;
    if (share >= 0.12 && share <= 0.45) return candidate;
    const distance = Math.abs(share - 0.25);
    if (!best || distance < best.distance) best = { candidate, distance };
  }

  return best.candidate;
}

// ── Play state (one player's view of the shared board) ───────────────────────

export function createPlayState(board) {
  const state = Array.from({ length: board.boardSize }, () =>
    Array.from({ length: board.boardSize }, () => ({ revealed: false, flagged: false, exploded: false }))
  );
  board.opening.forEach(([row, col]) => {
    state[row][col].revealed = true;
  });
  return state;
}

function clonePlayState(state) {
  return state.map((row) => row.map((cell) => ({ ...cell })));
}

export function countRevealedSafe(board, state) {
  let count = 0;
  for (let row = 0; row < board.boardSize; row += 1) {
    for (let col = 0; col < board.boardSize; col += 1) {
      if (state[row][col].revealed && !board.cells[row][col].mine) count += 1;
    }
  }
  return count;
}

export function countFlags(state) {
  return state.flat().filter((cell) => cell.flagged).length;
}

export function isBoardCleared(board, state) {
  return countRevealedSafe(board, state) === board.safeCount;
}

// Returns { state, hitMine, changed }. A mine hit marks that square as exploded
// (shown and counted as found) so the same mine cannot be hit twice.
export function revealCell(board, state, row, col) {
  const current = state[row]?.[col];
  if (!current || current.revealed || current.flagged) {
    return { state, hitMine: false, changed: false };
  }

  const next = clonePlayState(state);

  if (board.cells[row][col].mine) {
    next[row][col].revealed = true;
    next[row][col].exploded = true;
    return { state: next, hitMine: true, changed: true };
  }

  cascadeFrom(
    board.cells,
    row,
    col,
    (cellRow, cellCol) => next[cellRow][cellCol].revealed || next[cellRow][cellCol].flagged
  ).forEach(([cellRow, cellCol]) => {
    next[cellRow][cellCol].revealed = true;
  });

  return { state: next, hitMine: false, changed: true };
}

export function toggleFlag(state, row, col) {
  const current = state[row]?.[col];
  if (!current || current.revealed) return state;
  const next = clonePlayState(state);
  next[row][col].flagged = !next[row][col].flagged;
  return next;
}

// Compact save format for resuming after a refresh: one character per square.
export function serializePlayState(state) {
  return state
    .map((row) =>
      row.map((cell) => (cell.exploded ? "x" : cell.revealed ? "r" : cell.flagged ? "f" : "-")).join("")
    )
    .join("");
}

export function restorePlayState(board, serialized) {
  const size = board.boardSize;
  if (typeof serialized !== "string" || serialized.length !== size * size) return null;
  const state = createPlayState(board);
  for (let index = 0; index < serialized.length; index += 1) {
    const row = Math.floor(index / size);
    const col = index % size;
    const mark = serialized[index];
    const isMine = board.cells[row][col].mine;
    if (mark === "x" && isMine) {
      state[row][col] = { revealed: true, flagged: false, exploded: true };
    } else if (mark === "r" && !isMine) {
      state[row][col] = { revealed: true, flagged: false, exploded: false };
    } else if (mark === "f" && !state[row][col].revealed) {
      state[row][col].flagged = true;
    }
  }
  return state;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

// Progress ignores the squares everyone was handed for free at the start.
export function progressPercent(revealedSafe, board) {
  const toFind = board.safeCount - board.openingCount;
  if (toFind <= 0) return 100;
  const found = Math.max(0, Math.min(toFind, Number(revealedSafe || 0) - board.openingCount));
  return Math.round((found / toFind) * 100);
}

export function clampRevealedSafe(value, board) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return board.openingCount;
  return Math.min(board.safeCount, Math.max(board.openingCount, number));
}

export function pointsForPlace(place) {
  if (!Number.isInteger(place) || place < 1) return 0;
  return PLACE_POINTS[place - 1] ?? FINISHER_POINTS;
}

// entries: [{ userId, status: "playing"|"finished"|"out", elapsedMs, finishedAt, progress, mineHits }]
// Finishers come first in the order they finished; everyone else follows by how
// much of the board they cleared. Only finishers get a place.
export function rankRound(entries) {
  const finishers = (entries || [])
    .filter((entry) => entry.status === "finished")
    .sort(
      (a, b) =>
        Number(a.elapsedMs || 0) - Number(b.elapsedMs || 0) ||
        String(a.finishedAt || "").localeCompare(String(b.finishedAt || "")) ||
        String(a.userId).localeCompare(String(b.userId))
    );

  const others = (entries || [])
    .filter((entry) => entry.status !== "finished")
    .sort(
      (a, b) =>
        Number(b.progress || 0) - Number(a.progress || 0) ||
        Number(a.mineHits || 0) - Number(b.mineHits || 0) ||
        String(a.userId).localeCompare(String(b.userId))
    );

  return [
    ...finishers.map((entry, index) => ({ ...entry, place: index + 1 })),
    ...others.map((entry) => ({ ...entry, place: null })),
  ];
}

export function pointsForRankedEntry(entry) {
  if (entry.place) return pointsForPlace(entry.place);
  return Number(entry.progress || 0) >= 50 ? HALF_BOARD_POINTS : 0;
}

export function formatRaceTime(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Where a round is on the shared clock. `nowMs` must already be corrected to
// server time so every screen flips from countdown to racing together.
export function describeRoundClock(session, nowMs) {
  const startedAtMs = Date.parse(String(session?.roundStartedAt || ""));
  if (!session || session.status !== "racing" || !Number.isFinite(startedAtMs)) {
    return { phase: "idle", countdownSeconds: 0, elapsedMs: 0, remainingMs: null };
  }
  if (nowMs < startedAtMs) {
    return {
      phase: "countdown",
      countdownSeconds: Math.max(1, Math.ceil((startedAtMs - nowMs) / 1000)),
      elapsedMs: 0,
      remainingMs: null,
    };
  }
  const elapsedMs = nowMs - startedAtMs;
  const limitMs = Number(session.timeLimitSeconds || 0) * 1000;
  if (limitMs > 0 && elapsedMs >= limitMs) {
    return { phase: "timeup", countdownSeconds: 0, elapsedMs: limitMs, remainingMs: 0 };
  }
  return {
    phase: "running",
    countdownSeconds: 0,
    elapsedMs,
    remainingMs: limitMs > 0 ? limitMs - elapsedMs : null,
  };
}

export function mineRuleLabel(rule) {
  if (rule === MINE_RULE_RESTART) return "Mine hit: restart the board";
  if (rule === MINE_RULE_OUT) return "Mine hit: out for the round";
  return `Mine hit: frozen ${MINE_FREEZE_SECONDS} seconds`;
}
