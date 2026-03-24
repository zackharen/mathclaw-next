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
  const board = normalizeBoard(boardInput);
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
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
        count += 1;
        r += dr * direction;
        c += dc * direction;
      }
    }
    if (count >= 4) return true;
  }

  return false;
}
