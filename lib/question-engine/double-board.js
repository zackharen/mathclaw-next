import { buildSpiralReviewQuestion } from "@/lib/question-engine/spiral-review";
import { pickOne } from "@/lib/question-engine/core";

const BOARD_SKILLS = ["mixed", "integers", "comparison"];
const BOARD_SIZE = 3;

function cellId(boardKey, rowIndex, colIndex) {
  return `${boardKey}-${rowIndex}-${colIndex}`;
}

function questionForPair() {
  return buildSpiralReviewQuestion(pickOne(BOARD_SKILLS) || "mixed");
}

export function createDoubleBoardState() {
  const leftBoard = [];
  const rightBoard = [];
  const pairMap = new Map();

  for (let rowIndex = 0; rowIndex < BOARD_SIZE; rowIndex += 1) {
    const leftRow = [];
    const rightRow = [];

    for (let colIndex = 0; colIndex < BOARD_SIZE; colIndex += 1) {
      const pairQuestion = questionForPair();
      const pairId = `pair-${rowIndex}-${colIndex}`;
      const basePoints = 10 + (rowIndex + colIndex) * 5;
      const leftCell = {
        id: cellId("left", rowIndex, colIndex),
        boardKey: "left",
        rowIndex,
        colIndex,
        pairId,
        prompt: pairQuestion.prompt,
        answer: pairQuestion.answer,
        choices: pairQuestion.choices,
        formatChoice: pairQuestion.formatChoice,
        checkAnswer: pairQuestion.checkAnswer,
        explanation: pairQuestion.explanation,
        points: basePoints,
        status: "open",
        wrongAnswers: [],
        inspirationBonus: 0,
      };
      const rightCell = {
        id: cellId("right", rowIndex, colIndex),
        boardKey: "right",
        rowIndex,
        colIndex,
        pairId,
        prompt: pairQuestion.prompt,
        answer: pairQuestion.answer,
        choices: pairQuestion.choices,
        formatChoice: pairQuestion.formatChoice,
        checkAnswer: pairQuestion.checkAnswer,
        explanation: pairQuestion.explanation,
        points: basePoints,
        status: "open",
        wrongAnswers: [],
        inspirationBonus: 0,
      };

      pairMap.set(pairId, { leftId: leftCell.id, rightId: rightCell.id });
      leftRow.push(leftCell);
      rightRow.push(rightCell);
    }

    leftBoard.push(leftRow);
    rightBoard.push(rightRow);
  }

  return {
    leftBoard,
    rightBoard,
    pairMap,
  };
}

export function flattenDoubleBoard(boardState) {
  return [...boardState.leftBoard.flat(), ...boardState.rightBoard.flat()];
}

export function resolveBoardCell(boardState, cellIdValue) {
  return flattenDoubleBoard(boardState).find((cell) => cell.id === cellIdValue) || null;
}

export function pairedCell(boardState, cell) {
  if (!cell) return null;
  const pair = boardState.pairMap.get(cell.pairId);
  if (!pair) return null;
  const pairId = cell.boardKey === "left" ? pair.rightId : pair.leftId;
  return resolveBoardCell(boardState, pairId);
}

export function scoreDoubleBoard(boardState) {
  return flattenDoubleBoard(boardState)
    .filter((cell) => cell.status === "correct")
    .reduce((sum, cell) => sum + cell.points + cell.inspirationBonus, 0);
}

export function countSolvedCells(boardState) {
  return flattenDoubleBoard(boardState).filter((cell) => cell.status === "correct").length;
}

export function updateDoubleBoardAfterAnswer(boardState, cellIdValue, choice) {
  const nextState = {
    ...boardState,
    leftBoard: boardState.leftBoard.map((row) => row.map((cell) => ({ ...cell, wrongAnswers: [...cell.wrongAnswers] }))),
    rightBoard: boardState.rightBoard.map((row) => row.map((cell) => ({ ...cell, wrongAnswers: [...cell.wrongAnswers] }))),
    pairMap: new Map(boardState.pairMap),
  };

  const targetCell = resolveBoardCell(nextState, cellIdValue);
  if (!targetCell || targetCell.status === "correct") {
    return { boardState: nextState, correct: false, pointsEarned: 0, pairedSolved: false };
  }

  const correct = targetCell.checkAnswer(choice);
  const pairCell = pairedCell(nextState, targetCell);
  let pointsEarned = 0;
  let pairedSolved = false;

  if (correct) {
    targetCell.status = "correct";
    if (pairCell?.status === "correct") {
      pairedSolved = true;
    } else if (pairCell?.status === "open" || pairCell?.status === "wrong") {
      pairCell.inspirationBonus += 5;
    }
    pointsEarned = targetCell.points + targetCell.inspirationBonus;
  } else {
    targetCell.status = "wrong";
    targetCell.wrongAnswers.push(String(choice));
    targetCell.points += 5;
    if (pairCell) {
      pairCell.points += 5;
    }
  }

  return {
    boardState: nextState,
    correct,
    pointsEarned,
    pairedSolved,
  };
}
