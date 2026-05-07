export const TOURNAMENT_PRESENCE_WINDOW_MS = 8000;
export const MATCH_FORMAT_SINGLE_GAME = "single_game";
export const MATCH_FORMAT_BEST_OF_3 = "best_of_3";

export function normalizeTournamentMatchFormat(value) {
  return value === MATCH_FORMAT_BEST_OF_3 ? MATCH_FORMAT_BEST_OF_3 : MATCH_FORMAT_SINGLE_GAME;
}

export function isTournamentParticipantPresent(participant, nowMs = Date.now()) {
  const updatedAtMs = Date.parse(String(participant?.updated_at || ""));
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs <= TOURNAMENT_PRESENCE_WINDOW_MS;
}

export function nextPowerOfTwo(value) {
  const playerCount = Math.max(0, Math.floor(Number(value || 0)));
  if (playerCount <= 1) return 1;
  let size = 1;
  while (size < playerCount) size *= 2;
  return size;
}

export function roundNameForPlayerCount(playerCount) {
  const safeCount = Math.max(2, Number(playerCount || 0));
  if (safeCount === 2) return "Final";
  if (safeCount === 4) return "Semifinals";
  if (safeCount === 8) return "Quarterfinals";
  return `Round of ${safeCount}`;
}

export function buildInitialTournamentMatches(players) {
  const cleanPlayers = (players || []).filter((player) => player?.user_id);
  if (cleanPlayers.length < 2) {
    return {
      bracketSize: 0,
      rounds: [],
      matches: [],
    };
  }

  const bracketSize = nextPowerOfTwo(cleanPlayers.length);
  const firstRoundMatchCount = bracketSize / 2;
  const firstRoundGameCount = cleanPlayers.length - firstRoundMatchCount;
  const matches = [];
  const rounds = [];
  let cursor = 0;

  for (let roundIndex = 0, matchCount = firstRoundMatchCount; matchCount >= 1; roundIndex += 1, matchCount /= 2) {
    const playerCount = matchCount * 2;
    rounds.push({
      roundIndex,
      name: roundNameForPlayerCount(playerCount),
      playerCount,
      matchCount,
    });

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      let playerOneId = null;
      let playerTwoId = null;
      let winnerId = null;
      let status = "pending";

      if (roundIndex === 0 && matchIndex < firstRoundGameCount) {
        playerOneId = cleanPlayers[cursor]?.user_id || null;
        playerTwoId = cleanPlayers[cursor + 1]?.user_id || null;
        cursor += 2;
        status = playerOneId && playerTwoId ? "ready" : "pending";
      } else if (roundIndex === 0 && cursor < cleanPlayers.length) {
        playerOneId = cleanPlayers[cursor]?.user_id || null;
        cursor += 1;
        winnerId = playerOneId;
        status = "finished";
      }

      matches.push({
        roundIndex,
        matchIndex,
        playerOneId,
        playerTwoId,
        winnerId,
        status,
      });
    }
  }

  return {
    bracketSize,
    rounds,
    matches,
  };
}

export function shufflePlayers(players, random = Math.random) {
  const shuffled = [...(players || [])];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function resolveBestOfThreeSeries({ series, liveMatch, playerOneId, playerTwoId }) {
  const existingSeries = series && typeof series === "object" ? series : {};
  const countedMatchIds = Array.isArray(existingSeries.countedMatchIds)
    ? existingSeries.countedMatchIds.filter(Boolean)
    : [];
  const winsByPlayerId =
    existingSeries.winsByPlayerId && typeof existingSeries.winsByPlayerId === "object"
      ? { ...existingSeries.winsByPlayerId }
      : {};
  const games = Array.isArray(existingSeries.games) ? [...existingSeries.games] : [];
  const liveMatchId = liveMatch?.id || "";
  const winnerId = liveMatch?.winner_id || "";
  const isDraw = Boolean(liveMatch?.metadata?.draw);

  const nextSeries = {
    countedMatchIds,
    winsByPlayerId,
    games,
  };

  if (!liveMatchId) {
    return { action: "wait", series: nextSeries, winnerId: null };
  }

  if (isDraw) {
    return { action: "replay_draw", series: nextSeries, winnerId: null };
  }

  if (!winnerId) {
    return { action: "wait", series: nextSeries, winnerId: null };
  }

  if (!countedMatchIds.includes(liveMatchId)) {
    countedMatchIds.push(liveMatchId);
    winsByPlayerId[winnerId] = Number(winsByPlayerId[winnerId] || 0) + 1;
    games.push({ connect4MatchId: liveMatchId, winnerId });
  }

  const playerOneWins = Number(winsByPlayerId[playerOneId] || 0);
  const playerTwoWins = Number(winsByPlayerId[playerTwoId] || 0);
  if (playerOneId && playerOneWins >= 2) {
    return { action: "series_complete", series: nextSeries, winnerId: playerOneId };
  }
  if (playerTwoId && playerTwoWins >= 2) {
    return { action: "series_complete", series: nextSeries, winnerId: playerTwoId };
  }

  return { action: "next_game", series: nextSeries, winnerId: null };
}
