export const TOURNAMENT_PRESENCE_WINDOW_MS = 8000;

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
