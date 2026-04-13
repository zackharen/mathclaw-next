const BOARD_KEYS = ["A", "B"];
const BOARD_ROWS = 4;
const BOARD_COLUMNS = 3;
const TOTAL_QUESTIONS = BOARD_KEYS.length * BOARD_ROWS * BOARD_COLUMNS;

export const DOUBLE_BOARD_NUMBER_MODES = {
  single_digit: {
    slug: "single_digit",
    label: "Single Digit",
    minAbs: 1,
    maxAbs: 9,
  },
  double_digit: {
    slug: "double_digit",
    label: "Double Digit",
    minAbs: 1,
    maxAbs: 99,
  },
};

export const DOUBLE_BOARD_ROW_PATTERNS = [
  {
    rowIndex: 0,
    label: "+ , +",
    description: "Both numbers are positive.",
    signOne: 1,
    signTwo: 1,
  },
  {
    rowIndex: 1,
    label: "- , +",
    description: "First number is negative, second is positive.",
    signOne: -1,
    signTwo: 1,
  },
  {
    rowIndex: 2,
    label: "+ , -",
    description: "First number is positive, second is negative.",
    signOne: 1,
    signTwo: -1,
  },
  {
    rowIndex: 3,
    label: "- , -",
    description: "Both numbers are negative.",
    signOne: -1,
    signTwo: -1,
  },
];

export const DOUBLE_BOARD_COLUMN_PATTERNS = [
  {
    colIndex: 0,
    label: "Addition",
    description: "Add the two integers.",
    operator: "+",
    magnitudeRule: "none",
  },
  {
    colIndex: 1,
    label: "Subtract: first has larger absolute value",
    description: "Subtract when the first number has the greater absolute value.",
    operator: "-",
    magnitudeRule: "first_larger",
  },
  {
    colIndex: 2,
    label: "Subtract: second has larger absolute value",
    description: "Subtract when the second number has the greater absolute value.",
    operator: "-",
    magnitudeRule: "second_larger",
  },
];

function randomBetween(min, max) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function applySign(absValue, sign) {
  return sign < 0 ? -Math.abs(absValue) : Math.abs(absValue);
}

function expressionKey(operand1, operator, operand2) {
  return `${operand1}|${operator}|${operand2}`;
}

function chooseMagnitudes(modeConfig, magnitudeRule) {
  if (magnitudeRule === "none") {
    return {
      absOne: randomBetween(modeConfig.minAbs, modeConfig.maxAbs),
      absTwo: randomBetween(modeConfig.minAbs, modeConfig.maxAbs),
    };
  }

  const largerAbs = randomBetween(Math.max(2, modeConfig.minAbs + 1), modeConfig.maxAbs);
  const smallerAbs = randomBetween(modeConfig.minAbs, largerAbs - 1);

  if (magnitudeRule === "first_larger") {
    return { absOne: largerAbs, absTwo: smallerAbs };
  }

  return { absOne: smallerAbs, absTwo: largerAbs };
}

function calculateAnswer(operand1, operator, operand2) {
  if (operator === "+") return operand1 + operand2;
  return operand1 - operand2;
}

export function formatSignedInteger(value) {
  return Number(value) < 0 ? `(${Number(value)})` : `${Number(value)}`;
}

export function formatDoubleBoardExpression(operand1, operator, operand2) {
  return `${formatSignedInteger(operand1)} ${operator} ${formatSignedInteger(operand2)}`;
}

function createQuestionRecord({ boardKey, rowIndex, colIndex, numberMode, usedKeys }) {
  const rowPattern = DOUBLE_BOARD_ROW_PATTERNS[rowIndex];
  const columnPattern = DOUBLE_BOARD_COLUMN_PATTERNS[colIndex];
  const modeConfig =
    DOUBLE_BOARD_NUMBER_MODES[numberMode] || DOUBLE_BOARD_NUMBER_MODES.single_digit;

  let candidate = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const { absOne, absTwo } = chooseMagnitudes(modeConfig, columnPattern.magnitudeRule);
    const operand1 = applySign(absOne, rowPattern.signOne);
    const operand2 = applySign(absTwo, rowPattern.signTwo);
    const key = expressionKey(operand1, columnPattern.operator, operand2);

    if (usedKeys.has(key)) continue;

    candidate = {
      board_key: boardKey,
      row_index: rowIndex,
      col_index: colIndex,
      operand1,
      operator: columnPattern.operator,
      operand2,
      correct_answer: calculateAnswer(operand1, columnPattern.operator, operand2),
      expression_text: formatDoubleBoardExpression(
        operand1,
        columnPattern.operator,
        operand2
      ),
    };
    usedKeys.add(key);
    break;
  }

  if (candidate) return candidate;

  const { absOne, absTwo } = chooseMagnitudes(modeConfig, columnPattern.magnitudeRule);
  const operand1 = applySign(absOne, rowPattern.signOne);
  const operand2 = applySign(absTwo, rowPattern.signTwo);

  return {
    board_key: boardKey,
    row_index: rowIndex,
    col_index: colIndex,
    operand1,
    operator: columnPattern.operator,
    operand2,
    correct_answer: calculateAnswer(operand1, columnPattern.operator, operand2),
    expression_text: formatDoubleBoardExpression(operand1, columnPattern.operator, operand2),
  };
}

export function createDoubleBoardQuestionRecords(numberMode = "single_digit") {
  const usedKeys = new Set();
  const questions = [];

  for (const boardKey of BOARD_KEYS) {
    for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
      for (let colIndex = 0; colIndex < BOARD_COLUMNS; colIndex += 1) {
        questions.push(
          createQuestionRecord({
            boardKey,
            rowIndex,
            colIndex,
            numberMode,
            usedKeys,
          })
        );
      }
    }
  }

  return questions;
}

export function scoreSolvedDoubleBoardQuestion({
  solvedCountAfter,
  previousAttemptCount,
}) {
  const safeSolvedCount = Math.max(1, Number(solvedCountAfter || 0));
  const safeAttemptCount = Math.max(0, Number(previousAttemptCount || 0));

  // Double Board scoring stacks global board progress with a question-specific
  // retry bonus, so later solves and comeback solves both matter.
  return safeSolvedCount + 2 ** safeAttemptCount;
}

export function buildDoubleBoardMatrix(questionRows = []) {
  const matrix = Object.fromEntries(
    BOARD_KEYS.map((boardKey) => [
      boardKey,
      Array.from({ length: BOARD_ROWS }, () =>
        Array.from({ length: BOARD_COLUMNS }, () => null)
      ),
    ])
  );

  for (const row of questionRows) {
    if (!matrix[row.board_key]?.[row.row_index]) continue;
    matrix[row.board_key][row.row_index][row.col_index] = row;
  }

  return matrix;
}

export function buildDoubleBoardReviewItems(questionRows = []) {
  return [...(questionRows || [])]
    .filter((row) => row.ever_missed)
    .sort((a, b) => {
      const boardSort = String(a.board_key || "").localeCompare(String(b.board_key || ""));
      if (boardSort !== 0) return boardSort;
      if (a.row_index !== b.row_index) return a.row_index - b.row_index;
      return a.col_index - b.col_index;
    })
    .map((row) => ({
      id: row.id,
      boardKey: row.board_key,
      rowIndex: row.row_index,
      colIndex: row.col_index,
      expressionText:
        row.expression_text ||
        formatDoubleBoardExpression(row.operand1, row.operator, row.operand2),
      correctAnswer: row.correct_answer,
      wrongAttemptCount: Number(row.attempt_count || 0),
      solved: Boolean(row.solved),
    }));
}

export function formatBoardLocation(boardKey, rowIndex, colIndex) {
  return `Board ${boardKey} · Row ${Number(rowIndex) + 1} · Column ${Number(colIndex) + 1}`;
}

export function normalizeDoubleBoardMode(value) {
  return DOUBLE_BOARD_NUMBER_MODES[value] ? value : "single_digit";
}

export function isDoubleBoardMode(value) {
  return Boolean(DOUBLE_BOARD_NUMBER_MODES[value]);
}

export {
  BOARD_COLUMNS as DOUBLE_BOARD_COLUMNS,
  BOARD_KEYS as DOUBLE_BOARD_KEYS,
  BOARD_ROWS as DOUBLE_BOARD_ROWS,
  TOTAL_QUESTIONS as DOUBLE_BOARD_TOTAL_QUESTIONS,
};
