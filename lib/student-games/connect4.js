export const CONNECT4_ROWS = 6;
export const CONNECT4_COLS = 7;

export function emptyBoard() {
  return Array.from({ length: CONNECT4_ROWS }, () =>
    Array.from({ length: CONNECT4_COLS }, () => null)
  );
}

export function normalizeBoard(board) {
  if (!Array.isArray(board) || board.length !== CONNECT4_ROWS) {
    return emptyBoard();
  }
  return board.map((row) =>
    Array.isArray(row) && row.length === CONNECT4_COLS
      ? row.map((cell) => (cell === "R" || cell === "Y" ? cell : null))
      : Array.from({ length: CONNECT4_COLS }, () => null)
  );
}

export function nextToken(currentPlayerId, playerOneId) {
  return currentPlayerId === playerOneId ? "R" : "Y";
}

export function dropToken(boardInput, column, token) {
  const board = normalizeBoard(boardInput);
  if (column < 0 || column >= CONNECT4_COLS) {
    return { board, row: -1, placed: false };
  }

  for (let row = CONNECT4_ROWS - 1; row >= 0; row -= 1) {
    if (!board[row][column]) {
      board[row][column] = token;
      return { board, row, placed: true };
    }
  }

  return { board, row: -1, placed: false };
}

export function boardFull(boardInput) {
  const board = normalizeBoard(boardInput);
  return board.every((row) => row.every(Boolean));
}

export function hasWinner(boardInput, row, col, token) {
  return winningCells(boardInput, row, col, token).length >= 4;
}

export function winningCells(boardInput, row, col, token) {
  const board = normalizeBoard(boardInput);
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const cells = [[row, col]];
    for (const direction of [-1, 1]) {
      let r = row + dr * direction;
      let c = col + dc * direction;
      while (
        r >= 0 &&
        r < CONNECT4_ROWS &&
        c >= 0 &&
        c < CONNECT4_COLS &&
        board[r][c] === token
      ) {
        cells.push([r, c]);
        r += dr * direction;
        c += dc * direction;
      }
    }
    if (cells.length >= 4) return cells;
  }

  return [];
}

export function normalizeMoveHistory(moveHistory) {
  if (!Array.isArray(moveHistory)) return [];

  return moveHistory
    .map((move, index) => {
      const column = Number(move?.column);
      const row = Number(move?.row);
      const token = move?.token === "R" || move?.token === "Y" ? move.token : null;
      if (
        !token ||
        !Number.isInteger(column) ||
        !Number.isInteger(row) ||
        column < 0 ||
        column >= CONNECT4_COLS ||
        row < 0 ||
        row >= CONNECT4_ROWS
      ) {
        return null;
      }

      return {
        column,
        row,
        token,
        playerId: typeof move?.playerId === "string" ? move.playerId : null,
        moveNumber: Number.isInteger(Number(move?.moveNumber))
          ? Number(move.moveNumber)
          : index + 1,
        createdAt: typeof move?.createdAt === "string" ? move.createdAt : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.moveNumber - b.moveNumber);
}

export function buildBoardSnapshots(moveHistory, fallbackBoard = null) {
  const moves = normalizeMoveHistory(moveHistory);

  if (!moves.length) {
    const board = fallbackBoard ? normalizeBoard(fallbackBoard) : emptyBoard();
    return [
      {
        moveNumber: 0,
        move: null,
        board,
      },
    ];
  }

  const board = emptyBoard();
  const snapshots = [
    {
      moveNumber: 0,
      move: null,
      board: emptyBoard(),
    },
  ];

  for (const move of moves) {
    if (board[move.row]?.[move.column]) continue;
    board[move.row][move.column] = move.token;
    snapshots.push({
      moveNumber: move.moveNumber,
      move,
      board: normalizeBoard(board),
    });
  }

  return snapshots;
}
