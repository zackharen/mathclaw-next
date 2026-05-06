import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInitialTournamentMatches,
  nextPowerOfTwo,
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
