import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, getPublicDisplayName } from "@/lib/auth/account-type";
import {
  buildInitialTournamentMatches,
  deriveBestOfThreeSummary,
  isTournamentParticipantPresent,
  MATCH_FORMAT_BEST_OF_3,
  normalizeTournamentMatchFormat,
  resolveBestOfThreeSeries,
  shufflePlayers,
  TOURNAMENT_PRESENCE_WINDOW_MS,
} from "@/lib/student-games/connect4-tournaments";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { buildBoardSnapshots, emptyBoard, normalizeBoard } from "@/lib/student-games/connect4";
import { generateJoinCode } from "@/lib/student-games/join-code";
import { logInternalEvent } from "@/lib/observability/events";

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canManageCourse(courses, courseId) {
  const course = (courses || []).find((item) => item.id === courseId);
  return course?.relationship === "owner" || course?.relationship === "co_teacher";
}

function canAccessCourse(courses, courseId) {
  return (courses || []).some((course) => course.id === courseId);
}

function normalizeConnect4Match(match) {
  if (!match) return null;
  return {
    ...match,
    board: normalizeBoard(match.board),
    metadata: match.metadata && typeof match.metadata === "object" ? match.metadata : {},
  };
}

async function getViewerContext(supabase, user) {
  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "connect4",
    viewerAccountType: accountType,
  });

  return { accountType, courses };
}

async function resolveDisplayName(admin, user) {
  const { data } = await admin
    .from("profiles")
    .select("display_name, nickname")
    .eq("id", user.id)
    .maybeSingle();

  return getPublicDisplayName(data, user.email || "Student");
}

async function createConnect4Match(admin, { courseId, creatorId, playerOneId, playerTwoId, tournamentId, tournamentMatchId }) {
  let inviteCode = generateJoinCode(8);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("connect4_matches")
      .insert({
        invite_code: inviteCode,
        course_id: courseId,
        created_by: creatorId,
        player_one_id: playerOneId,
        player_two_id: playerTwoId,
        current_turn_id: playerOneId,
        status: "active",
        board: emptyBoard(),
        metadata: {
          gameStartedAt: nowIso(),
          winningCells: [],
          draw: false,
          moveHistory: [],
          rematch_count: 0,
          tournamentId,
          tournamentMatchId,
        },
      })
      .select("*")
      .single();

    if (!error) return data;
    if (!String(error.message || "").includes("duplicate")) {
      throw new Error(error.message);
    }
    inviteCode = generateJoinCode(8);
  }

  throw new Error("Could not create a unique Connect4 match code.");
}

async function fetchTournament(admin, { tournamentId, courseId }) {
  let query = admin.from("connect4_tournaments").select("*");

  if (tournamentId) {
    query = query.eq("id", tournamentId);
  } else {
    query = query.eq("course_id", courseId).in("status", ["waiting", "active"]);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function loadTournamentRows(admin, tournamentOrId) {
  const tournamentId = typeof tournamentOrId === "string" ? tournamentOrId : tournamentOrId?.id;
  const [{ data: participants }, { data: tournamentMatches }] = await Promise.all([
    admin
      .from("connect4_tournament_participants")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("seed", { ascending: true, nullsFirst: false })
      .order("joined_at", { ascending: true }),
    admin
      .from("connect4_tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round_index", { ascending: true })
      .order("match_index", { ascending: true }),
  ]);

  const profileIds = new Set();
  for (const participant of participants || []) profileIds.add(participant.user_id);
  for (const match of tournamentMatches || []) {
    if (match.player_one_id) profileIds.add(match.player_one_id);
    if (match.player_two_id) profileIds.add(match.player_two_id);
    if (match.winner_id) profileIds.add(match.winner_id);
  }

  let profiles = [];
  if (profileIds.size) {
    const profileResult = await admin
      .from("profiles")
      .select("id, display_name, nickname")
      .in("id", [...profileIds]);
    profiles = profileResult.data || [];
    if (
      profileResult.error &&
      typeof profileResult.error.message === "string" &&
      profileResult.error.message.includes("nickname")
    ) {
      const retryProfiles = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", [...profileIds]);
      profiles = retryProfiles.data || [];
    }
  }

  const connect4IdSet = new Set(
    (tournamentMatches || [])
      .map((match) => match.connect4_match_id)
      .filter(Boolean)
  );
  const bracket =
    tournamentOrId?.bracket && typeof tournamentOrId.bracket === "object" ? tournamentOrId.bracket : {};
  const seriesByMatchId =
    bracket.seriesByMatchId && typeof bracket.seriesByMatchId === "object"
      ? bracket.seriesByMatchId
      : {};
  for (const series of Object.values(seriesByMatchId)) {
    const games = Array.isArray(series?.games) ? series.games : [];
    for (const game of games) {
      if (game?.connect4MatchId) connect4IdSet.add(game.connect4MatchId);
    }
  }

  const connect4Ids = [...connect4IdSet];
  const { data: connect4Matches } = connect4Ids.length
    ? await admin.from("connect4_matches").select("*").in("id", connect4Ids)
    : { data: [] };

  return {
    participants: participants || [],
    tournamentMatches: tournamentMatches || [],
    profiles: profiles || [],
    connect4Matches: connect4Matches || [],
  };
}

async function updateTournamentMatch(admin, matchId, payload) {
  const { data, error } = await admin
    .from("connect4_tournament_matches")
    .update({ ...payload, updated_at: nowIso() })
    .eq("id", matchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateTournamentBracket(admin, tournament, bracket) {
  const { data, error } = await admin
    .from("connect4_tournaments")
    .update({ bracket, updated_at: nowIso() })
    .eq("id", tournament.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data || { ...tournament, bracket };
}

function previousRoundsFinished(matches, roundIndex) {
  return (matches || [])
    .filter((match) => Number(match.round_index) < Number(roundIndex))
    .every((match) => match.status === "finished");
}

async function syncTournament(admin, tournament) {
  if (!tournament || tournament.status !== "active") return tournament;

  let { tournamentMatches, connect4Matches } = await loadTournamentRows(admin, tournament);
  const connect4Map = new Map(connect4Matches.map((match) => [match.id, match]));
  let bracket =
    tournament.bracket && typeof tournament.bracket === "object"
      ? { ...tournament.bracket }
      : {};
  const matchFormat = normalizeTournamentMatchFormat(bracket.matchFormat);
  const seriesByMatchId =
    bracket.seriesByMatchId && typeof bracket.seriesByMatchId === "object"
      ? { ...bracket.seriesByMatchId }
      : {};
  let changed = false;

  for (const bracketMatch of tournamentMatches) {
    if (bracketMatch.status !== "active" || !bracketMatch.connect4_match_id) continue;
    const liveMatch = connect4Map.get(bracketMatch.connect4_match_id);
    if (!liveMatch || liveMatch.status !== "finished") continue;

    const isDraw = Boolean(liveMatch.metadata?.draw);
    if (matchFormat === "single_game" && isDraw) {
      const replay = await createConnect4Match(admin, {
        courseId: tournament.course_id,
        creatorId: tournament.created_by,
        playerOneId: bracketMatch.player_one_id,
        playerTwoId: bracketMatch.player_two_id,
        tournamentId: tournament.id,
        tournamentMatchId: bracketMatch.id,
      });
      Object.assign(bracketMatch, await updateTournamentMatch(admin, bracketMatch.id, {
        connect4_match_id: replay.id,
        status: "active",
      }));
      connect4Map.set(replay.id, replay);
      changed = true;
      continue;
    }

    if (matchFormat === "single_game") {
      Object.assign(bracketMatch, await updateTournamentMatch(admin, bracketMatch.id, {
        winner_id: liveMatch.winner_id,
        status: "finished",
      }));
      changed = true;
      continue;
    }

    const seriesResult = resolveBestOfThreeSeries({
      series: seriesByMatchId[bracketMatch.id],
      liveMatch,
      playerOneId: bracketMatch.player_one_id,
      playerTwoId: bracketMatch.player_two_id,
    });
    seriesByMatchId[bracketMatch.id] = seriesResult.series;
    bracket = {
      ...bracket,
      matchFormat,
      seriesByMatchId,
    };
    tournament = await updateTournamentBracket(admin, tournament, bracket);
    changed = true;

    if (seriesResult.action === "series_complete" && seriesResult.winnerId) {
      Object.assign(bracketMatch, await updateTournamentMatch(admin, bracketMatch.id, {
        winner_id: seriesResult.winnerId,
        status: "finished",
      }));
      continue;
    }

    if (seriesResult.action === "replay_draw" || seriesResult.action === "next_game") {
      const nextGame = await createConnect4Match(admin, {
        courseId: tournament.course_id,
        creatorId: tournament.created_by,
        playerOneId: bracketMatch.player_one_id,
        playerTwoId: bracketMatch.player_two_id,
        tournamentId: tournament.id,
        tournamentMatchId: bracketMatch.id,
      });
      Object.assign(bracketMatch, await updateTournamentMatch(admin, bracketMatch.id, {
        connect4_match_id: nextGame.id,
        status: "active",
      }));
      connect4Map.set(nextGame.id, nextGame);
    }
  }

  let propagated = true;
  while (propagated) {
    propagated = false;
    const matchMap = new Map(
      tournamentMatches.map((match) => [`${match.round_index}:${match.match_index}`, match])
    );

    for (const bracketMatch of tournamentMatches) {
      if (bracketMatch.status !== "finished" || !bracketMatch.winner_id) continue;
      const nextMatch = matchMap.get(`${bracketMatch.round_index + 1}:${Math.floor(bracketMatch.match_index / 2)}`);
      if (!nextMatch) {
        if (tournament.champion_id !== bracketMatch.winner_id || tournament.status !== "finished") {
          const { data: updatedTournament, error } = await admin
            .from("connect4_tournaments")
            .update({
              champion_id: bracketMatch.winner_id,
              status: "finished",
              bracket,
              updated_at: nowIso(),
            })
            .eq("id", tournament.id)
            .select("*")
            .single();

          if (error) throw new Error(error.message);
          tournament = updatedTournament;
          changed = true;
        }
        continue;
      }

      const slotKey = bracketMatch.match_index % 2 === 0 ? "player_one_id" : "player_two_id";
      if (nextMatch[slotKey] !== bracketMatch.winner_id) {
        Object.assign(nextMatch, await updateTournamentMatch(admin, nextMatch.id, {
          [slotKey]: bracketMatch.winner_id,
          status: nextMatch.status === "pending" ? "ready" : nextMatch.status,
        }));
        propagated = true;
        changed = true;
      }

      if (
        nextMatch.player_one_id &&
        nextMatch.player_two_id &&
        !nextMatch.connect4_match_id &&
        nextMatch.status !== "finished" &&
        previousRoundsFinished(tournamentMatches, nextMatch.round_index)
      ) {
        const liveMatch = await createConnect4Match(admin, {
          courseId: tournament.course_id,
          creatorId: tournament.created_by,
          playerOneId: nextMatch.player_one_id,
          playerTwoId: nextMatch.player_two_id,
          tournamentId: tournament.id,
          tournamentMatchId: nextMatch.id,
        });
        Object.assign(nextMatch, await updateTournamentMatch(admin, nextMatch.id, {
          connect4_match_id: liveMatch.id,
          status: "active",
        }));
        connect4Map.set(liveMatch.id, liveMatch);
        propagated = true;
        changed = true;
      }
    }
  }

  if (changed && tournament.status !== "finished") {
    const { data } = await admin
      .from("connect4_tournaments")
      .update({ bracket, updated_at: nowIso() })
      .eq("id", tournament.id)
      .select("*")
      .single();
    tournament = data || tournament;
  }

  return tournament;
}

function buildPayload({ tournament, participants, tournamentMatches, profiles, connect4Matches, viewer }) {
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const connect4Map = new Map((connect4Matches || []).map((match) => [match.id, normalizeConnect4Match(match)]));
  const participantNameMap = new Map(
    (participants || [])
      .filter((participant) => participant?.user_id)
      .map((participant) => [
        participant.user_id,
        String(participant.display_name || "").trim() || "",
      ])
  );
  const canManage = canManageCourse(viewer.courses, tournament.course_id);
  const nowMs = Date.now();
  const bracket = tournament.bracket && typeof tournament.bracket === "object" ? tournament.bracket : {};
  const matchFormat = normalizeTournamentMatchFormat(bracket.matchFormat);
  const seriesByMatchId =
    bracket.seriesByMatchId && typeof bracket.seriesByMatchId === "object"
      ? bracket.seriesByMatchId
      : {};
  const displayNameFor = (userId) =>
    getPublicDisplayName(profileMap.get(userId), "") || participantNameMap.get(userId) || "";
  const gamePayloadFor = (game, match) => {
    const connect4Match = connect4Map.get(game?.connect4MatchId) || null;
    if (!connect4Match) return null;
    const winnerName = displayNameFor(game?.winnerId || connect4Match.winner_id) || "";
    return {
      connect4MatchId: connect4Match.id,
      gameNumber: Number(game?.gameNumber || 0) || 1,
      winnerId: game?.winnerId || connect4Match.winner_id || null,
      winnerName,
      board: connect4Match.board,
      snapshots: buildBoardSnapshots(connect4Match.metadata?.moveHistory, connect4Match.board),
      status: connect4Match.status,
      metadata: connect4Match.metadata || {},
      draw: Boolean(game?.draw || connect4Match.metadata?.draw),
      isCurrent: connect4Match.id === match.connect4_match_id,
      playerOneId: match.player_one_id,
      playerTwoId: match.player_two_id,
    };
  };

  return {
    tournament: {
      id: tournament.id,
      courseId: tournament.course_id,
      status: tournament.status,
      bracket,
      championId: tournament.champion_id,
      championName: displayNameFor(tournament.champion_id) || "",
      createdAt: tournament.created_at,
      updatedAt: tournament.updated_at,
      canManage,
    },
    participants: (participants || []).map((participant) => ({
      id: participant.id,
      userId: participant.user_id,
      displayName: displayNameFor(participant.user_id) || "Student",
      status: participant.status,
      seed: participant.seed,
      isPresent: isTournamentParticipantPresent(participant, nowMs),
      joinedAt: participant.joined_at,
      updatedAt: participant.updated_at,
    })),
    matches: (tournamentMatches || []).map((match) => {
      const playerOneName = displayNameFor(match.player_one_id);
      const playerTwoName = displayNameFor(match.player_two_id);
      const isBestOfThreeMatch =
        matchFormat === MATCH_FORMAT_BEST_OF_3 && match.player_one_id && match.player_two_id;
      const series = isBestOfThreeMatch ? seriesByMatchId[match.id] : null;
      const seriesGames = Array.isArray(series?.games)
        ? series.games.map((game) => gamePayloadFor(game, match)).filter(Boolean)
        : [];
      const currentGameInSeries = seriesGames.find((game) => game.isCurrent) || null;
      if (isBestOfThreeMatch && match.connect4_match_id && !currentGameInSeries) {
        const currentMatch = connect4Map.get(match.connect4_match_id);
        if (currentMatch) {
          seriesGames.push({
            connect4MatchId: currentMatch.id,
            gameNumber:
              deriveBestOfThreeSummary({
                series,
                playerOneId: match.player_one_id,
                playerTwoId: match.player_two_id,
                playerOneName,
                playerTwoName,
                activeConnect4MatchId: match.connect4_match_id,
                status: match.status,
              }).gameNumber || 1,
            winnerId: currentMatch.winner_id || null,
            winnerName: displayNameFor(currentMatch.winner_id) || "",
            board: currentMatch.board,
            snapshots: buildBoardSnapshots(currentMatch.metadata?.moveHistory, currentMatch.board),
            status: currentMatch.status,
            metadata: currentMatch.metadata || {},
            draw: Boolean(currentMatch.metadata?.draw),
            isCurrent: true,
            playerOneId: match.player_one_id,
            playerTwoId: match.player_two_id,
          });
        }
      }
      const seriesSummary =
        isBestOfThreeMatch
          ? deriveBestOfThreeSummary({
              series,
              playerOneId: match.player_one_id,
              playerTwoId: match.player_two_id,
              playerOneName,
              playerTwoName,
              activeConnect4MatchId: match.connect4_match_id,
              status: match.status,
            })
          : null;
      return {
        id: match.id,
        roundIndex: match.round_index,
        matchIndex: match.match_index,
        status: match.status,
        matchFormat,
        connect4MatchId: match.connect4_match_id,
        playerOneId: match.player_one_id,
        playerTwoId: match.player_two_id,
        winnerId: match.winner_id,
        playerOneName,
        playerTwoName,
        winnerName: displayNameFor(match.winner_id) || "",
        updatedAt: match.updated_at,
        connect4Match: connect4Map.get(match.connect4_match_id) || null,
        seriesSummary,
        seriesGames,
        previousGames: seriesGames.filter((game) => !game.isCurrent),
      };
    }),
    viewer: {
      userId: viewer.user.id,
      canManage,
    },
  };
}

async function loadPayload(admin, tournament, viewer) {
  const syncedTournament = await syncTournament(admin, tournament);
  const rows = await loadTournamentRows(admin, syncedTournament);
  return buildPayload({ tournament: syncedTournament, viewer, ...rows });
}

export async function GET(request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = { user, ...(await getViewerContext(supabase, user)) };
  const { searchParams } = new URL(request.url);
  const tournamentId = normalizeId(searchParams.get("tournamentId"));
  const courseId = normalizeId(searchParams.get("courseId"));

  const tournament = await fetchTournament(admin, { tournamentId, courseId });
  if (!tournament) return NextResponse.json({ tournament: null });
  if (!canAccessCourse(viewer.courses, tournament.course_id)) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return NextResponse.json(await loadPayload(admin, tournament, viewer));
}

export async function POST(request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = { user, ...(await getViewerContext(supabase, user)) };
  const body = await request.json();
  const action = String(body.action || "");
  const courseId = normalizeId(body.courseId);
  const tournamentId = normalizeId(body.tournamentId);
  const requestedMatchFormat = normalizeTournamentMatchFormat(body.matchFormat);

  try {
    if (action === "create_lobby") {
      if (!courseId || !canManageCourse(viewer.courses, courseId)) {
        return NextResponse.json({ error: "Only a teacher can create a tournament for that class." }, { status: 403 });
      }

      const existing = await fetchTournament(admin, { courseId });
      if (existing) return NextResponse.json(await loadPayload(admin, existing, viewer));

      const { data, error } = await admin
        .from("connect4_tournaments")
        .insert({
          course_id: courseId,
          created_by: user.id,
          status: "waiting",
          bracket: { gameSlug: "connect4", matchFormat: "single_game", rounds: [], seriesByMatchId: {} },
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json(await loadPayload(admin, data, viewer));
    }

    const tournament = await fetchTournament(admin, { tournamentId, courseId });
    if (!tournament || !canAccessCourse(viewer.courses, tournament.course_id)) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (action === "touch") {
      if (canManageCourse(viewer.courses, tournament.course_id)) {
        return NextResponse.json(await loadPayload(admin, tournament, viewer));
      }
      if (tournament.status !== "waiting") {
        return NextResponse.json(await loadPayload(admin, tournament, viewer));
      }

      const displayName = await resolveDisplayName(admin, user);
      const timestamp = nowIso();
      const { error } = await admin.from("connect4_tournament_participants").upsert(
        {
          tournament_id: tournament.id,
          user_id: user.id,
          display_name: displayName,
          status: "active",
          updated_at: timestamp,
          joined_at: timestamp,
        },
        {
          onConflict: "tournament_id,user_id",
          ignoreDuplicates: false,
        }
      );

      if (error) throw new Error(error.message);
      return NextResponse.json(await loadPayload(admin, tournament, viewer));
    }

    if (action === "end") {
      if (!canManageCourse(viewer.courses, tournament.course_id)) {
        return NextResponse.json({ error: "Only a teacher can end the tournament." }, { status: 403 });
      }

      const endedAt = nowIso();
      const bracket =
        tournament.bracket && typeof tournament.bracket === "object"
          ? tournament.bracket
          : {};
      if (tournament.status === "finished" && !bracket.endedEarlyAt) {
        return NextResponse.json({ error: "This tournament already finished." }, { status: 400 });
      }
      const { data: updatedTournament, error: tournamentError } = await admin
        .from("connect4_tournaments")
        .update({
          status: "finished",
          champion_id: null,
          bracket: {
            ...bracket,
            endedEarlyAt: bracket.endedEarlyAt || endedAt,
            endedEarlyBy: bracket.endedEarlyBy || user.id,
          },
          updated_at: endedAt,
        })
        .eq("id", tournament.id)
        .select("*")
        .single();

      if (tournamentError) throw new Error(tournamentError.message);

      const { connect4Matches } = await loadTournamentRows(admin, updatedTournament);
      const activeMatchIds = connect4Matches
        .filter((match) => match.status === "active")
        .map((match) => match.id);

      if (activeMatchIds.length) {
        const { error: matchError } = await admin
          .from("connect4_matches")
          .update({
            status: "finished",
            winner_id: null,
            current_turn_id: null,
            updated_at: endedAt,
          })
          .in("id", activeMatchIds);

        if (matchError) throw new Error(matchError.message);
      }

      return NextResponse.json(await loadPayload(admin, updatedTournament, viewer));
    }

    if (action === "generate") {
      if (!canManageCourse(viewer.courses, tournament.course_id)) {
        return NextResponse.json({ error: "Only a teacher can generate the bracket." }, { status: 403 });
      }
      if (tournament.status !== "waiting") {
        return NextResponse.json({ error: "This tournament already has a bracket." }, { status: 400 });
      }

      const { data: participants, error: participantError } = await admin
        .from("connect4_tournament_participants")
        .select("*")
        .eq("tournament_id", tournament.id)
        .gte("updated_at", new Date(Date.now() - TOURNAMENT_PRESENCE_WINDOW_MS).toISOString());

      if (participantError) throw new Error(participantError.message);

      const shuffled = shufflePlayers(participants || []);
      if (shuffled.length < 2) {
        return NextResponse.json({ error: "At least two present students are needed to generate a bracket." }, { status: 400 });
      }

      const bracket = buildInitialTournamentMatches(shuffled);
      const seedRows = shuffled.map((participant, index) =>
        admin
          .from("connect4_tournament_participants")
          .update({ seed: index + 1, status: "active", updated_at: nowIso() })
          .eq("id", participant.id)
      );
      await Promise.all(seedRows);

      const rowsToInsert = [];
      for (const match of bracket.matches) {
        rowsToInsert.push({
          tournament_id: tournament.id,
          round_index: match.roundIndex,
          match_index: match.matchIndex,
          player_one_id: match.playerOneId,
          player_two_id: match.playerTwoId,
          winner_id: match.winnerId,
          status: match.status,
        });
      }

      const { data: insertedMatches, error: matchError } = await admin
        .from("connect4_tournament_matches")
        .insert(rowsToInsert)
        .select("*");

      if (matchError) throw new Error(matchError.message);

      for (const match of insertedMatches || []) {
        if (match.status !== "ready" || !match.player_one_id || !match.player_two_id) continue;
        const liveMatch = await createConnect4Match(admin, {
          courseId: tournament.course_id,
          creatorId: tournament.created_by,
          playerOneId: match.player_one_id,
          playerTwoId: match.player_two_id,
          tournamentId: tournament.id,
          tournamentMatchId: match.id,
        });
        await updateTournamentMatch(admin, match.id, {
          connect4_match_id: liveMatch.id,
          status: "active",
        });
      }

      const { data: updatedTournament, error: tournamentError } = await admin
        .from("connect4_tournaments")
        .update({
          status: "active",
          bracket: {
            gameSlug: "connect4",
            matchFormat: requestedMatchFormat,
            bracketSize: bracket.bracketSize,
            rounds: bracket.rounds,
            seriesByMatchId: {},
          },
          updated_at: nowIso(),
        })
        .eq("id", tournament.id)
        .select("*")
        .single();

      if (tournamentError) throw new Error(tournamentError.message);
      return NextResponse.json(await loadPayload(admin, updatedTournament, viewer));
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    await logInternalEvent({
      eventKey: "connect4_tournament_action_failed",
      source: "api.play.connect4-tournaments",
      message: error.message,
      user,
      accountType: viewer.accountType,
      courseId,
      context: { action, tournamentId },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
