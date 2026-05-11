import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInitialTournamentMatches,
  deriveBestOfThreeSummary,
  normalizeTournamentMatchFormat,
  nextPowerOfTwo,
  resolveBestOfThreeSeries,
  roundNameForPlayerCount,
} from "../lib/student-games/connect4-tournaments.js";

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    user_id: `player-${index + 1}`,
  }));
}

test("nextPowerOfTwo rounds up to the bracket size", () => {
  assert.equal(nextPowerOfTwo(2), 2);
  assert.equal(nextPowerOfTwo(8), 8);
  assert.equal(nextPowerOfTwo(9), 16);
  assert.equal(nextPowerOfTwo(29), 32);
});

test("roundNameForPlayerCount labels common bracket rounds", () => {
  assert.equal(roundNameForPlayerCount(2), "Final");
  assert.equal(roundNameForPlayerCount(4), "Semifinals");
  assert.equal(roundNameForPlayerCount(8), "Quarterfinals");
  assert.equal(roundNameForPlayerCount(16), "Round of 16");
});

test("power-of-two player counts create a clean first round", () => {
  const bracket = buildInitialTournamentMatches(players(8));
  const firstRound = bracket.matches.filter((match) => match.roundIndex === 0);

  assert.equal(bracket.bracketSize, 8);
  assert.equal(firstRound.length, 4);
  assert.equal(firstRound.filter((match) => match.status === "ready").length, 4);
  assert.equal(firstRound.filter((match) => match.status === "finished").length, 0);
});

test("nine players create one play-in game and seven byes", () => {
  const bracket = buildInitialTournamentMatches(players(9));
  const firstRound = bracket.matches.filter((match) => match.roundIndex === 0);

  assert.equal(bracket.bracketSize, 16);
  assert.equal(firstRound.length, 8);
  assert.equal(firstRound.filter((match) => match.status === "ready").length, 1);
  assert.equal(firstRound.filter((match) => match.status === "finished").length, 7);
});

test("thirteen players create five play-in games and three byes", () => {
  const bracket = buildInitialTournamentMatches(players(13));
  const firstRound = bracket.matches.filter((match) => match.roundIndex === 0);

  assert.equal(bracket.bracketSize, 16);
  assert.equal(firstRound.filter((match) => match.status === "ready").length, 5);
  assert.equal(firstRound.filter((match) => match.status === "finished").length, 3);
});

test("twenty-nine players create thirteen play-in games and three byes", () => {
  const bracket = buildInitialTournamentMatches(players(29));
  const firstRound = bracket.matches.filter((match) => match.roundIndex === 0);

  assert.equal(bracket.bracketSize, 32);
  assert.equal(firstRound.filter((match) => match.status === "ready").length, 13);
  assert.equal(firstRound.filter((match) => match.status === "finished").length, 3);
});

test("match format normalization defaults to single game", () => {
  assert.equal(normalizeTournamentMatchFormat("single_game"), "single_game");
  assert.equal(normalizeTournamentMatchFormat("best_of_3"), "best_of_3");
  assert.equal(normalizeTournamentMatchFormat("best_of_5"), "single_game");
  assert.equal(normalizeTournamentMatchFormat(null), "single_game");
});

test("best of three ignores draws and asks for a replay", () => {
  const result = resolveBestOfThreeSeries({
    series: {},
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-1",
      winner_id: null,
      metadata: { draw: true },
    },
  });

  assert.equal(result.action, "replay_draw");
  assert.deepEqual(result.series.countedMatchIds, []);
  assert.deepEqual(result.series.winsByPlayerId, {});
  assert.deepEqual(result.series.games, [
    { connect4MatchId: "connect4-1", gameNumber: 1, winnerId: null, draw: true },
  ]);
});

test("best of three needs game two after one player win and shows a 1-0 score", () => {
  const result = resolveBestOfThreeSeries({
    series: {},
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-1",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });

  assert.equal(result.action, "next_game");
  assert.deepEqual(result.series.countedMatchIds, ["connect4-1"]);
  assert.equal(result.series.winsByPlayerId["player-1"], 1);

  const summary = deriveBestOfThreeSummary({
    series: result.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    playerOneName: "Student A",
    playerTwoName: "Student B",
    status: "active",
  });
  assert.equal(summary.summaryText, "Game 2 · Student A leads 1-0");
  assert.equal(summary.isComplete, false);
});

test("best of three needs game three after split wins and shows a 1-1 score", () => {
  const first = resolveBestOfThreeSeries({
    series: {},
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-1",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });
  const second = resolveBestOfThreeSeries({
    series: first.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-2",
      winner_id: "player-2",
      metadata: { draw: false },
    },
  });

  assert.equal(second.action, "next_game");
  assert.equal(second.series.winsByPlayerId["player-1"], 1);
  assert.equal(second.series.winsByPlayerId["player-2"], 1);

  const summary = deriveBestOfThreeSummary({
    series: second.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    playerOneName: "Student A",
    playerTwoName: "Student B",
    status: "active",
  });
  assert.equal(summary.summaryText, "Game 3 · Series tied 1-1");
});

test("best of three completes 2-0 after a second win and does not double count", () => {
  const result = resolveBestOfThreeSeries({
    series: {
      countedMatchIds: ["connect4-1"],
      winsByPlayerId: { "player-1": 1 },
      games: [{ connect4MatchId: "connect4-1", winnerId: "player-1" }],
    },
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-2",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });

  assert.equal(result.action, "series_complete");
  assert.equal(result.winnerId, "player-1");
  assert.equal(result.series.winsByPlayerId["player-1"], 2);

  const duplicate = resolveBestOfThreeSeries({
    series: result.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-2",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });

  assert.equal(duplicate.action, "series_complete");
  assert.equal(duplicate.series.winsByPlayerId["player-1"], 2);

  const summary = deriveBestOfThreeSummary({
    series: duplicate.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    playerOneName: "Student A",
    playerTwoName: "Student B",
    status: "finished",
  });
  assert.equal(summary.summaryText, "Student A wins series 2-0");
  assert.equal(summary.isComplete, true);
});

test("best of three completes 2-1 after split wins", () => {
  const series = {
    countedMatchIds: ["connect4-1", "connect4-2"],
    winsByPlayerId: { "player-1": 1, "player-2": 1 },
    games: [
      { connect4MatchId: "connect4-1", gameNumber: 1, winnerId: "player-1", draw: false },
      { connect4MatchId: "connect4-2", gameNumber: 2, winnerId: "player-2", draw: false },
    ],
  };
  const result = resolveBestOfThreeSeries({
    series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-3",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });

  assert.equal(result.action, "series_complete");
  assert.equal(result.winnerId, "player-1");

  const summary = deriveBestOfThreeSummary({
    series: result.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    playerOneName: "Student A",
    playerTwoName: "Student B",
    status: "finished",
  });
  assert.equal(summary.summaryText, "Student A wins series 2-1");
});

test("best of three duplicate live match processing does not double-count", () => {
  const first = resolveBestOfThreeSeries({
    series: {},
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-1",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });
  const duplicate = resolveBestOfThreeSeries({
    series: first.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-1",
      winner_id: "player-1",
      metadata: { draw: false },
    },
  });

  assert.equal(duplicate.action, "next_game");
  assert.equal(duplicate.series.countedMatchIds.length, 1);
  assert.equal(duplicate.series.winsByPlayerId["player-1"], 1);
  assert.equal(duplicate.series.games.length, 1);
});

test("best of three draw keeps score unchanged and reuses the same game number", () => {
  const first = resolveBestOfThreeSeries({
    series: {
      countedMatchIds: ["connect4-1"],
      winsByPlayerId: { "player-1": 1 },
      games: [{ connect4MatchId: "connect4-1", gameNumber: 1, winnerId: "player-1", draw: false }],
    },
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-2",
      winner_id: null,
      metadata: { draw: true },
    },
  });
  const duplicate = resolveBestOfThreeSeries({
    series: first.series,
    playerOneId: "player-1",
    playerTwoId: "player-2",
    liveMatch: {
      id: "connect4-2",
      winner_id: null,
      metadata: { draw: true },
    },
  });

  assert.equal(first.action, "replay_draw");
  assert.equal(first.series.winsByPlayerId["player-1"], 1);
  assert.equal(first.series.winsByPlayerId["player-2"] || 0, 0);
  assert.equal(first.series.games.at(-1).gameNumber, 2);
  assert.equal(duplicate.series.games.length, first.series.games.length);
});
