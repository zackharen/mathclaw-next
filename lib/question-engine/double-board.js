const BOARD_KEYS = ["A", "B"];
const BOARD_ROWS = 4;
const BOARD_COLUMNS = 3;
const TOTAL_QUESTIONS = BOARD_KEYS.length * BOARD_ROWS * BOARD_COLUMNS;

const RANDOM_COLUMN_INDEX = 2;
const MULTIPLIER_SCALE = 100;
const DECIMAL_MULTIPLIER_SCALE = 10000;

export const DOUBLE_BOARD_NUMBER_MODES = {
  single_digit: {
    slug: "single_digit",
    label: "Integer Operations",
    description: "Original integer add/subtract Double Board.",
    minAbs: 1,
    maxAbs: 9,
  },
  double_digit: {
    slug: "double_digit",
    label: "Percent Change Multipliers",
    description: "Students convert percent increases and decreases into decimal multipliers.",
  },
  mixed_review: {
    slug: "mixed_review",
    label: "Mixed Review",
    description: "A random blend of integer operations and percent-change multipliers.",
  },
};

export const DOUBLE_BOARD_ROW_PATTERNS = [
  {
    rowIndex: 0,
    label: "+ , +",
    description: "Both numbers are positive, or a single-digit percent increase/decrease pair.",
    signOne: 1,
    signTwo: 1,
  },
  {
    rowIndex: 1,
    label: "- , +",
    description: "First number is negative, second is positive, or another single-digit percent pair.",
    signOne: -1,
    signTwo: 1,
  },
  {
    rowIndex: 2,
    label: "+ , -",
    description: "First number is positive, second is negative, or the Row 2 percent multiplied by 10.",
    signOne: 1,
    signTwo: -1,
  },
  {
    rowIndex: 3,
    label: "- , -",
    description: "Both numbers are negative, or a fresh double-digit percent pair.",
    signOne: -1,
    signTwo: -1,
  },
];

export const DOUBLE_BOARD_COLUMN_PATTERNS = [
  {
    colIndex: 0,
    label: "Column 1",
    description: "Addition in integer mode, or percent increase in multiplier mode.",
    operator: "+",
    magnitudeRule: "none",
    direction: "increase",
  },
  {
    colIndex: 1,
    label: "Column 2",
    description: "Subtraction in integer mode, or percent decrease in multiplier mode.",
    operator: "-",
    magnitudeRule: "first_larger",
    direction: "decrease",
  },
  {
    colIndex: 2,
    label: "Column 3",
    description: "Alternate subtraction in integer mode, or random mixed percent change in multiplier mode.",
    operator: "-",
    magnitudeRule: "second_larger",
    direction: "random",
  },
];

function randomBetween(min, max) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function shuffleValues(values) {
  const nextValues = [...values];

  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBetween(0, index);
    const currentValue = nextValues[index];
    nextValues[index] = nextValues[swapIndex];
    nextValues[swapIndex] = currentValue;
  }

  return nextValues;
}

function uniqueFiniteValues(values = []) {
  return values.filter((value, index) => Number.isFinite(value) && values.indexOf(value) === index);
}

function applySign(absValue, sign) {
  return sign < 0 ? -Math.abs(absValue) : Math.abs(absValue);
}

function expressionKey(operand1, operator, operand2) {
  return `${operand1}|${operator}|${operand2}`;
}

function pairSlotKey(rowIndex, colIndex) {
  return `${rowIndex}:${colIndex}`;
}

function boardCellKey(boardKey, rowIndex, colIndex) {
  return `${boardKey}:${rowIndex}:${colIndex}`;
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

function createIntegerQuestionCandidate({ boardKey, rowIndex, colIndex, numberMode }) {
  const rowPattern = DOUBLE_BOARD_ROW_PATTERNS[rowIndex];
  const columnPattern = DOUBLE_BOARD_COLUMN_PATTERNS[colIndex];
  const modeConfig =
    DOUBLE_BOARD_NUMBER_MODES[numberMode] || DOUBLE_BOARD_NUMBER_MODES.single_digit;

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
    metadata: {
      answerFormat: "integer",
      boardType: "integer_operations",
    },
  };
}

function createIntegerQuestionRecords(numberMode = "single_digit") {
  const usedKeys = new Set();
  const usedAnswersByColumn = new Map(
    Array.from({ length: BOARD_COLUMNS }, (_, colIndex) => [colIndex, new Set()])
  );
  const usedAbsoluteValuesByBoardColumn = new Map(
    BOARD_KEYS.flatMap((boardKey) =>
      Array.from({ length: BOARD_COLUMNS }, (_, colIndex) => [
        `${boardKey}:${colIndex}`,
        new Set(),
      ])
    )
  );
  const pairAnswers = new Map();
  const slots = [];

  for (const boardKey of BOARD_KEYS) {
    for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
      for (let colIndex = 0; colIndex < BOARD_COLUMNS; colIndex += 1) {
        slots.push({ boardKey, rowIndex, colIndex });
      }
    }
  }

  const questions = [];

  function canUseCandidate(candidate) {
    const expression = expressionKey(candidate.operand1, candidate.operator, candidate.operand2);
    if (usedKeys.has(expression)) return false;

    const columnAnswers = usedAnswersByColumn.get(candidate.col_index);
    if (columnAnswers?.has(candidate.correct_answer)) return false;

    const pairKey = pairSlotKey(candidate.row_index, candidate.col_index);
    if (pairAnswers.has(pairKey) && pairAnswers.get(pairKey) === candidate.correct_answer) {
      return false;
    }

    const boardColumnKey = `${candidate.board_key}:${candidate.col_index}`;
    const usedAbsValues = usedAbsoluteValuesByBoardColumn.get(boardColumnKey);
    if (
      usedAbsValues?.has(Math.abs(candidate.operand1)) ||
      usedAbsValues?.has(Math.abs(candidate.operand2))
    ) {
      return false;
    }

    return true;
  }

  function applyCandidate(candidate) {
    questions.push(candidate);
    usedKeys.add(expressionKey(candidate.operand1, candidate.operator, candidate.operand2));
    usedAnswersByColumn.get(candidate.col_index)?.add(candidate.correct_answer);
    const boardColumnValues = usedAbsoluteValuesByBoardColumn.get(
      `${candidate.board_key}:${candidate.col_index}`
    );
    boardColumnValues?.add(Math.abs(candidate.operand1));
    boardColumnValues?.add(Math.abs(candidate.operand2));
  }

  function removeCandidate(candidate) {
    questions.pop();
    usedKeys.delete(expressionKey(candidate.operand1, candidate.operator, candidate.operand2));
    usedAnswersByColumn.get(candidate.col_index)?.delete(candidate.correct_answer);

    const boardColumnKey = `${candidate.board_key}:${candidate.col_index}`;
    const rebuiltAbsValues = new Set(
      questions
        .filter(
          (question) =>
            question.board_key === candidate.board_key &&
            question.col_index === candidate.col_index
        )
        .flatMap((question) => [Math.abs(question.operand1), Math.abs(question.operand2)])
    );
    usedAbsoluteValuesByBoardColumn.set(boardColumnKey, rebuiltAbsValues);
  }

  function backtrack(slotIndex = 0) {
    if (slotIndex >= slots.length) return true;

    const slot = slots[slotIndex];
    const pairKey = pairSlotKey(slot.rowIndex, slot.colIndex);
    const previousPairAnswer = pairAnswers.get(pairKey);

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const candidate = createIntegerQuestionCandidate({
        boardKey: slot.boardKey,
        rowIndex: slot.rowIndex,
        colIndex: slot.colIndex,
        numberMode,
      });

      if (!canUseCandidate(candidate)) continue;

      applyCandidate(candidate);
      pairAnswers.set(pairKey, candidate.correct_answer);

      if (backtrack(slotIndex + 1)) {
        return true;
      }

      removeCandidate(candidate);
      if (previousPairAnswer === undefined) {
        pairAnswers.delete(pairKey);
      } else {
        pairAnswers.set(pairKey, previousPairAnswer);
      }
    }

    return false;
  }

  if (backtrack()) {
    return questions;
  }

  const fallbackQuestions = [];
  for (const boardKey of BOARD_KEYS) {
    for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
      for (let colIndex = 0; colIndex < BOARD_COLUMNS; colIndex += 1) {
        fallbackQuestions.push(
          createIntegerQuestionCandidate({
            boardKey,
            rowIndex,
            colIndex,
            numberMode,
          })
        );
      }
    }
  }

  return fallbackQuestions;
}

function sampleUniquePercent(min, max, blocked = new Set()) {
  const options = [];

  for (let value = min; value <= max; value += 1) {
    if (!blocked.has(value)) {
      options.push(value);
    }
  }

  if (!options.length) {
    return null;
  }

  return options[randomBetween(0, options.length - 1)];
}

function sampleDecimalPercent(blockedPercents = new Set()) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const scaledPercent = randomBetween(101, 9999);
    if (scaledPercent % 100 === 0) continue;

    const percentValue = scaledPercent / 100;

    if (!blockedPercents.has(percentValue)) {
      return percentValue;
    }
  }

  return null;
}

function buildQuestionIdKey(percentValue, direction) {
  return `${percentValue}:${direction}`;
}

function formatPercentPrompt(percentValue, direction) {
  const safePercent = Number(percentValue);
  const percentLabel = Number.isInteger(safePercent) ? `${safePercent}` : safePercent.toFixed(2);
  return `${percentLabel}%${direction === "decrease" ? "↓" : "↑"}`;
}

function multiplierFromPercent(percentValue, direction) {
  return direction === "decrease"
    ? MULTIPLIER_SCALE - Number(percentValue)
    : MULTIPLIER_SCALE + Number(percentValue);
}

function decimalMultiplierFromPercent(percentValue, direction) {
  return direction === "decrease"
    ? Math.round((1 - Number(percentValue) / 100) * DECIMAL_MULTIPLIER_SCALE)
    : Math.round((1 + Number(percentValue) / 100) * DECIMAL_MULTIPLIER_SCALE);
}

export function formatScaledMultiplier(value) {
  return (Number(value || 0) / MULTIPLIER_SCALE).toFixed(2);
}

export function normalizeDoubleBoardAnswer(value, metadata = {}) {
  const answerFormat = metadata?.answerFormat || "integer";
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (answerFormat === "multiplier_hundredths") {
    if (!/^(?:\d+|\d*\.\d{1,2})$/.test(raw)) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const scaled = Math.round(parsed * MULTIPLIER_SCALE);
    if (Math.abs(parsed * MULTIPLIER_SCALE - scaled) > 1e-9) {
      return null;
    }

    return scaled;
  }

  if (answerFormat === "multiplier_tenthousandths") {
    if (!/^(?:\d+|\d*\.\d{1,4})$/.test(raw)) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.round(parsed * DECIMAL_MULTIPLIER_SCALE);
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

export function formatDoubleBoardAnswer(value, metadata = {}) {
  const answerFormat = metadata?.answerFormat || "integer";

  if (answerFormat === "multiplier_hundredths") {
    return formatScaledMultiplier(value);
  }

  if (answerFormat === "multiplier_tenthousandths") {
    return (Number(value || 0) / DECIMAL_MULTIPLIER_SCALE).toFixed(4);
  }

  return `${Number(value || 0)}`;
}

export function buildDoubleBoardMultipleChoiceOptions(question = {}) {
  const metadata = question.metadata || {};
  const correctAnswer = Number(
    question.correctAnswer ?? question.correct_answer ?? question.answer ?? question.correctAnswerValue
  );

  if (!Number.isFinite(correctAnswer)) {
    return [];
  }

  if (metadata.answerFormat === "multiplier_hundredths") {
    const rawPercent = Number(metadata.percentValue || question.operand1 || 0) / MULTIPLIER_SCALE;
    const orderedChoices = uniqueFiniteValues([
      correctAnswer,
      1 - rawPercent,
      1 + (1 - rawPercent),
      rawPercent,
    ].map((value) => Number(value.toFixed(2))));

    for (let step = 1; orderedChoices.length < 4; step += 1) {
      const fallbackValue = Number((correctAnswer + step * 0.1).toFixed(2));
      if (!orderedChoices.includes(fallbackValue)) {
        orderedChoices.push(fallbackValue);
      }
    }

    return shuffleValues(orderedChoices.slice(0, 4));
  }

  if (metadata.answerFormat === "multiplier_tenthousandths") {
    const rawPercent = Number(metadata.percentValue || question.operand1 || 0) / MULTIPLIER_SCALE;
    const orderedChoices = uniqueFiniteValues([
      correctAnswer,
      ...[
        1 - rawPercent,
        1 + (1 - rawPercent),
        rawPercent,
      ].map((value) => Math.round(value * DECIMAL_MULTIPLIER_SCALE)),
    ]);

    for (let step = 1; orderedChoices.length < 4; step += 1) {
      const fallbackValue = correctAnswer + step * 1000;
      if (!orderedChoices.includes(fallbackValue)) {
        orderedChoices.push(fallbackValue);
      }
    }

    return shuffleValues(orderedChoices.slice(0, 4));
  }

  const operand1 = Number(question.operand1);
  const operand2 = Number(question.operand2);
  const absoluteSum = Math.abs(operand1) + Math.abs(operand2);
  const orderedChoices = uniqueFiniteValues([
    correctAnswer,
    -correctAnswer,
    absoluteSum,
    -absoluteSum,
  ]);

  for (let step = 1; orderedChoices.length < 4; step += 1) {
    const fallbackValue = correctAnswer + step;
    if (!orderedChoices.includes(fallbackValue)) {
      orderedChoices.push(fallbackValue);
    }
  }

  return shuffleValues(orderedChoices.slice(0, 4));
}

function createPercentQuestion({ boardKey, rowIndex, colIndex, percentValue, direction }) {
  const decimalPercent = !Number.isInteger(Number(percentValue));
  const answerFormat = decimalPercent ? "multiplier_tenthousandths" : "multiplier_hundredths";

  return {
    board_key: boardKey,
    row_index: rowIndex,
    col_index: colIndex,
    operand1: Number(percentValue),
    operator: direction === "decrease" ? "-" : "+",
    operand2: 0,
    expression_text: formatPercentPrompt(percentValue, direction),
    correct_answer: decimalPercent
      ? decimalMultiplierFromPercent(percentValue, direction)
      : multiplierFromPercent(percentValue, direction),
    metadata: {
      answerFormat,
      boardType: "percent_change_multipliers",
      percentValue: Number(percentValue),
      direction,
      answerPrompt: "Type the multiplier.",
      answerPlaceholder: decimalPercent ? "Type a multiplier like 1.0555" : "Type a multiplier like 1.08",
    },
  };
}

function buildBoardBlueprint() {
  const rowOnePercent = sampleUniquePercent(1, 9);
  const rowTwoPercent = sampleUniquePercent(1, 9, new Set([rowOnePercent]));
  const pairedDoubleDigitPercent = rowTwoPercent * 10;
  const rowFourPercent = sampleUniquePercent(10, 99, new Set([pairedDoubleDigitPercent]));

  if (!rowOnePercent || !rowTwoPercent || !pairedDoubleDigitPercent || !rowFourPercent) {
    throw new Error("Could not generate percent-change blueprint for Double Board.");
  }

  return {
    fixedPercentsByRow: [rowOnePercent, rowTwoPercent, pairedDoubleDigitPercent, rowFourPercent],
  };
}

function buildRandomQuestion({ boardKey, rowIndex, usedQuestionKeys, blockedPercents = new Set() }) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const percentValue = sampleDecimalPercent(blockedPercents);
    const direction = Math.random() < 0.5 ? "increase" : "decrease";
    const key = buildQuestionIdKey(percentValue, direction);

    if (!percentValue || usedQuestionKeys.has(key)) {
      continue;
    }

    usedQuestionKeys.add(key);
    return createPercentQuestion({
      boardKey,
      rowIndex,
      colIndex: RANDOM_COLUMN_INDEX,
      percentValue,
      direction,
    });
  }

  throw new Error("Could not generate a unique random percent-change question.");
}

function createPercentQuestionRecords() {
  const usedQuestionKeys = new Set();
  const questions = [];

  for (const boardKey of BOARD_KEYS) {
    const blueprint = buildBoardBlueprint();

    for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
      const fixedPercent = blueprint.fixedPercentsByRow[rowIndex];
      const increaseKey = buildQuestionIdKey(fixedPercent, "increase");
      const decreaseKey = buildQuestionIdKey(fixedPercent, "decrease");

      if (usedQuestionKeys.has(increaseKey) || usedQuestionKeys.has(decreaseKey)) {
        return createPercentQuestionRecords();
      }

      usedQuestionKeys.add(increaseKey);
      usedQuestionKeys.add(decreaseKey);

      questions.push(
        createPercentQuestion({
          boardKey,
          rowIndex,
          colIndex: 0,
          percentValue: fixedPercent,
          direction: "increase",
        })
      );
      questions.push(
        createPercentQuestion({
          boardKey,
          rowIndex,
          colIndex: 1,
          percentValue: fixedPercent,
          direction: "decrease",
        })
      );

      questions.push(
        buildRandomQuestion({
          boardKey,
          rowIndex,
          usedQuestionKeys,
          blockedPercents: new Set(blueprint.fixedPercentsByRow),
        })
      );
    }
  }

  return questions;
}

function createMixedReviewQuestionRecords() {
  const integerQuestions = createIntegerQuestionRecords("single_digit");
  const percentQuestions = createPercentQuestionRecords();
  const integerByCell = new Map(
    integerQuestions.map((question) => [
      boardCellKey(question.board_key, question.row_index, question.col_index),
      question,
    ])
  );
  const percentByCell = new Map(
    percentQuestions.map((question) => [
      boardCellKey(question.board_key, question.row_index, question.col_index),
      question,
    ])
  );
  const mixedQuestions = [];

  for (const boardKey of BOARD_KEYS) {
    for (let rowIndex = 0; rowIndex < BOARD_ROWS; rowIndex += 1) {
      for (let colIndex = 0; colIndex < BOARD_COLUMNS; colIndex += 1) {
        const key = boardCellKey(boardKey, rowIndex, colIndex);
        const integerQuestion = integerByCell.get(key);
        const percentQuestion = percentByCell.get(key);
        const question = Math.random() < 0.5 ? integerQuestion || percentQuestion : percentQuestion || integerQuestion;

        if (question) {
          mixedQuestions.push(question);
        }
      }
    }
  }

  return mixedQuestions;
}

export function createDoubleBoardQuestionRecords(numberMode = "single_digit") {
  if (numberMode === "double_digit") {
    return createPercentQuestionRecords();
  }

  if (numberMode === "mixed_review") {
    return createMixedReviewQuestionRecords();
  }

  return createIntegerQuestionRecords("single_digit");
}

export function getDoubleBoardQuestionBonusPoints(question = {}) {
  const metadata = question?.metadata && typeof question.metadata === "object" ? question.metadata : {};

  if (metadata.boardType === "percent_change_multipliers") {
    return metadata.direction === "decrease" ? 1 : 0;
  }

  let bonus = 0;

  if (Number(question?.operand1) < 0) bonus += 1;
  if (Number(question?.operand2) < 0) bonus += 1;

  return bonus;
}

export function getDoubleBoardPointValue({
  previousAttemptCount,
  question,
  solvedCount = 0,
}) {
  const safeAttemptCount = Math.max(0, Number(previousAttemptCount || 0));
  const safeSolvedCount = Math.max(0, Number(solvedCount || 0));
  return 2 ** safeAttemptCount + safeSolvedCount + getDoubleBoardQuestionBonusPoints(question);
}

export function scoreSolvedDoubleBoardQuestion({
  previousAttemptCount,
  question,
  solvedCount = 0,
}) {
  return getDoubleBoardPointValue({
    previousAttemptCount,
    question,
    solvedCount,
  });
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
      correctAnswerDisplay: formatDoubleBoardAnswer(row.correct_answer, row.metadata),
      wrongAttemptCount: Number(row.attempt_count || 0),
      solved: Boolean(row.solved),
      metadata: row.metadata || {},
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
