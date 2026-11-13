import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDefaultDisplayName,
  getAccountTypeForUser,
  getPublicDisplayName,
} from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import {
  MINE_RULE_OUT,
  buildRaceBoard,
  clampRevealedSafe,
  normalizeBoardSize,
  normalizeMineRule,
  normalizeTimeLimit,
  pointsForRankedEntry,
  progressPercent,
  rankRound,
} from "@/lib/student-games/minesweeper-race";

// Race access follows the class's Minesweeper setting: if a teacher turns
// Minesweeper off for a class, the race is off too.
const GAME_SLUG = "minesweeper";
const PLAYER_PRESENCE_WINDOW_MS = 8000;
// Rounds start a few seconds after the teacher presses Start so every polling
// browser has the round before the clock begins.
const ROUND_COUNTDOWN_MS = 5000;
const TIME_LIMIT_GRACE_MS = 2000;
const ACTIVE_STATUSES = ["lobby", "racing", "results"];
// A finished race stays visible this long so screens can show final standings.
const ENDED_VISIBLE_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeInt(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 100000) : 0;
}

function isPlayerPresent(player, nowMs = Date.now()) {
  const updatedAtMs = Date.parse(String(player?.updated_at || ""));
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs <= PLAYER_PRESENCE_WINDOW_MS;
}

function isTeacherRelationship(relationship) {
  return relationship === "owner" || relationship === "co_teacher";
}

async function getViewerContext(supabase, user) {
  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: GAME_SLUG,
    viewerAccountType: accountType,
  });
  return { accountType, courses };
}

function getCourseRecord(courses, courseId) {
  return (courses || []).find((course) => course.id === courseId) || null;
}

function canAccessCourse(courses, courseId) {
  return Boolean(courseId && getCourseRecord(courses, courseId));
}

function canManageCourse(courses, courseId) {
  return isTeacherRelationship(getCourseRecord(courses, courseId)?.relationship);
}

async function resolveDisplayName(supabase, user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, nickname")
    .eq("id", user.id)
    .maybeSingle();
  return getPublicDisplayName(data, buildDefaultDisplayName(user));
}

async function ensurePlayer(admin, sessionId, user, displayName, role, isPlaying = null) {
  const { data: existing } = await admin
    .from("minesweeper_race_players")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const update = { display_name: displayName, updated_at: nowIso() };
    if (isPlaying !== null) update.is_playing = isPlaying;
    const { data, error } = await admin
      .from("minesweeper_race_players")
      .update(update)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await admin
    .from("minesweeper_race_players")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        display_name: displayName,
        role,
        // Students always play; a teacher only plays if they chose to.
        is_playing: isPlaying === null ? role !== "teacher" : isPlaying,
        joined_at: nowIso(),
        updated_at: nowIso(),
      },
      { onConflict: "session_id,user_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function touchPlayerPresence(admin, sessionId, userId) {
  await admin
    .from("minesweeper_race_players")
    .update({ updated_at: nowIso() })
    .eq("session_id", sessionId)
    .eq("user_id", userId);
}

function roundBoard(session) {
  if (!session.round_seed || Number(session.current_round || 0) < 1) return null;
  return buildRaceBoard(session.round_seed, session.board_size);
}

function roundTiming(session, nowMs = Date.now()) {
  const startedAtMs = Date.parse(String(session.round_started_at || ""));
  const limitMs = Number(session.time_limit_seconds || 0) * 1000;
  const hasStarted = Number.isFinite(startedAtMs) && nowMs >= startedAtMs;
  const deadlineMs = limitMs > 0 && Number.isFinite(startedAtMs) ? startedAtMs + limitMs : null;
  return {
    startedAtMs,
    hasStarted,
    elapsedMs: hasStarted ? nowMs - startedAtMs : 0,
    isPastDeadline: deadlineMs !== null && nowMs > deadlineMs + TIME_LIMIT_GRACE_MS,
  };
}

function rankedEntriesForRound(players, results, board) {
  const resultByUser = new Map(results.map((row) => [row.user_id, row]));
  return rankRound(
    players
      .filter((player) => player.is_playing)
      .map((player) => {
        const row = resultByUser.get(player.user_id) || null;
        return {
          userId: player.user_id,
          status: row?.status || "playing",
          elapsedMs: row?.elapsed_ms ?? null,
          finishedAt: row?.finished_at || null,
          mineHits: Number(row?.mine_hits || 0),
          restarts: Number(row?.restarts || 0),
          progress: board ? progressPercent(row?.revealed_safe ?? board.openingCount, board) : 0,
        };
      })
  );
}

async function loadSessionBundle(admin, sessionId, viewer, options = {}) {
  const [{ data: session }, { data: players }, { data: results }] = await Promise.all([
    admin.from("minesweeper_race_sessions").select("*").eq("id", sessionId).maybeSingle(),
    admin
      .from("minesweeper_race_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true }),
    admin.from("minesweeper_race_results").select("*").eq("session_id", sessionId),
  ]);

  if (!session) return null;

  const allPlayers = players || [];
  const allResults = results || [];
  const currentRound = Number(session.current_round || 0);
  const board = roundBoard(session);
  const currentResults = allResults.filter((row) => Number(row.round_number) === currentRound);
  const ranked = rankedEntriesForRound(allPlayers, currentResults, board);
  const rankedByUser = new Map(ranked.map((entry, index) => [entry.userId, { ...entry, order: index }]));
  const currentResultByUser = new Map(currentResults.map((row) => [row.user_id, row]));
  const roundScored = session.status === "results" || session.status === "ended";

  const totalPointsByUser = new Map();
  for (const row of allResults) {
    totalPointsByUser.set(row.user_id, (totalPointsByUser.get(row.user_id) || 0) + Number(row.points || 0));
  }

  const nowMs = Date.now();
  const playerPayload = allPlayers
    .filter((player) => player.is_playing)
    .map((player) => {
      const entry = rankedByUser.get(player.user_id);
      return {
        userId: player.user_id,
        displayName: player.display_name,
        isTeacher: player.role === "teacher",
        isPresent: isPlayerPresent(player, nowMs),
        totalPoints: totalPointsByUser.get(player.user_id) || 0,
        order: entry?.order ?? 0,
        round: {
          status: entry?.status || "playing",
          progress: entry?.progress || 0,
          mineHits: entry?.mineHits || 0,
          restarts: entry?.restarts || 0,
          elapsedMs: entry?.elapsedMs ?? null,
          place: entry?.place ?? null,
          points: roundScored ? Number(currentResultByUser.get(player.user_id)?.points || 0) : null,
        },
      };
    })
    .sort((a, b) => a.order - b.order);

  const viewerPlayer = allPlayers.find((player) => player.user_id === viewer.user.id) || null;
  const viewerRow = currentResultByUser.get(viewer.user.id) || null;
  const isDisplay = options.view === "display";
  const viewerIsPlaying = Boolean(viewerPlayer?.is_playing);
  // The seed is the mine layout. Only people actually playing the round get it.
  const includeSeed = !isDisplay && viewerIsPlaying && currentRound > 0 && session.status !== "lobby";

  return {
    id: session.id,
    courseId: session.course_id,
    status: session.status,
    currentRound,
    boardSize: session.board_size,
    mineRule: session.mine_rule,
    timeLimitSeconds: Number(session.time_limit_seconds || 0),
    roundStartedAt: session.round_started_at,
    roundEndedAt: session.round_ended_at,
    serverNow: new Date(nowMs).toISOString(),
    seed: includeSeed ? session.round_seed : null,
    canManage: canManageCourse(viewer.courses, session.course_id),
    viewer: {
      userId: viewer.user.id,
      isJoined: Boolean(viewerPlayer),
      isPlaying: viewerIsPlaying,
      role: viewerPlayer?.role || null,
      round: viewerRow
        ? {
            status: viewerRow.status,
            mineHits: Number(viewerRow.mine_hits || 0),
            restarts: Number(viewerRow.restarts || 0),
            revealedSafe: Number(viewerRow.revealed_safe || 0),
            elapsedMs: viewerRow.elapsed_ms ?? null,
          }
        : null,
    },
    joinedCount: allPlayers.filter((player) => player.is_playing).length,
    finishedCount: ranked.filter((entry) => entry.status === "finished").length,
    players: playerPayload,
  };
}

// Scores the round exactly once. The status change is a compare-and-set, so if
// two End Round requests race only the one that flips the status awards points.
async function endRound(admin, session) {
  const { data: flipped, error } = await admin
    .from("minesweeper_race_sessions")
    .update({ status: "results", round_ended_at: nowIso(), updated_at: nowIso() })
    .eq("id", session.id)
    .eq("status", "racing")
    .eq("current_round", session.current_round)
    .select("id");

  if (error) throw new Error(error.message);
  if (!flipped || flipped.length === 0) return false;

  const [{ data: players }, { data: results }] = await Promise.all([
    admin.from("minesweeper_race_players").select("*").eq("session_id", session.id),
    admin
      .from("minesweeper_race_results")
      .select("*")
      .eq("session_id", session.id)
      .eq("round_number", session.current_round),
  ]);

  const board = roundBoard(session);
  const ranked = rankedEntriesForRound(players || [], results || [], board);
  const existingUserIds = new Set((results || []).map((row) => row.user_id));

  await Promise.all(
    ranked
      .filter((entry) => existingUserIds.has(entry.userId))
      .map((entry) =>
        admin
          .from("minesweeper_race_results")
          .update({ place: entry.place, points: pointsForRankedEntry(entry), updated_at: nowIso() })
          .eq("session_id", session.id)
          .eq("user_id", entry.userId)
          .eq("round_number", session.current_round)
      )
  );

  return true;
}

// A saved board is one character per square: hidden, revealed, flagged, exploded.
function normalizeBoardState(value, board) {
  if (typeof value !== "string") return null;
  if (value.length !== board.boardSize * board.boardSize) return null;
  return /^[-rfx]+$/.test(value) ? value : null;
}

// Teacher-only look at one player's current board.
async function loadPeek(admin, session, playerId) {
  const [{ data: player }, { data: row }] = await Promise.all([
    admin
      .from("minesweeper_race_players")
      .select("user_id, display_name, is_playing")
      .eq("session_id", session.id)
      .eq("user_id", playerId)
      .maybeSingle(),
    admin
      .from("minesweeper_race_results")
      .select("*")
      .eq("session_id", session.id)
      .eq("user_id", playerId)
      .eq("round_number", session.current_round)
      .maybeSingle(),
  ]);

  if (!player) return null;

  const board = session.status === "lobby" ? null : roundBoard(session);
  return {
    userId: player.user_id,
    displayName: player.display_name,
    round: Number(session.current_round || 0),
    boardSize: session.board_size,
    seed: board ? session.round_seed : null,
    cells: board ? row?.board_state || null : null,
    hasBoard: Boolean(board && row?.board_state),
    status: row?.status || "playing",
    progress: board ? progressPercent(row?.revealed_safe ?? board.openingCount, board) : 0,
    mineHits: Number(row?.mine_hits || 0),
    restarts: Number(row?.restarts || 0),
    elapsedMs: row?.elapsed_ms ?? null,
  };
}

function forbidden(message) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = await getViewerContext(supabase, user);
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const courseId = normalizeId(searchParams.get("courseId"));
  const requestedView = searchParams.get("view");
  const view = requestedView === "display" || requestedView === "peek" ? requestedView : "play";

  if (!courseId) return NextResponse.json({ session: null });
  if (!canAccessCourse(viewer.courses, courseId)) {
    return forbidden("Minesweeper is not enabled for that class.");
  }

  const { data: session } = await admin
    .from("minesweeper_race_sessions")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const endedLongAgo =
    session?.status === "ended" &&
    Date.now() - Date.parse(String(session.updated_at || "")) > ENDED_VISIBLE_MS;
  if (!session || endedLongAgo) return NextResponse.json({ session: null });

  if (view === "peek") {
    if (!canManageCourse(viewer.courses, courseId)) {
      return forbidden("Only a teacher can look at a student's board.");
    }
    const playerId = normalizeId(searchParams.get("playerId"));
    const peek = playerId ? await loadPeek(admin, session, playerId) : null;
    return NextResponse.json({ peek });
  }

  const [, bundle] = await Promise.all([
    view === "display" || session.status === "ended" ? null : touchPlayerPresence(admin, session.id, user.id),
    loadSessionBundle(admin, session.id, { ...viewer, user }, { view }),
  ]);
  return NextResponse.json({ session: bundle });
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [viewer, displayName, body] = await Promise.all([
    getViewerContext(supabase, user),
    resolveDisplayName(supabase, user),
    request.json().catch(() => ({})),
  ]);
  const admin = createAdminClient();
  const action = String(body.action || "");
  const respond = async (sessionId) =>
    NextResponse.json({ session: await loadSessionBundle(admin, sessionId, { ...viewer, user }) });

  try {
    if (action === "create") {
      const courseId = normalizeId(body.courseId);
      if (!courseId) return badRequest("A class is required.");
      if (!canManageCourse(viewer.courses, courseId)) {
        return forbidden("Only a teacher can host a Minesweeper Race.");
      }

      await admin
        .from("minesweeper_race_sessions")
        .update({ status: "ended", updated_at: nowIso() })
        .eq("course_id", courseId)
        .in("status", ACTIVE_STATUSES);

      const { data: session, error } = await admin
        .from("minesweeper_race_sessions")
        .insert({
          course_id: courseId,
          host_teacher_id: user.id,
          status: "lobby",
          board_size: normalizeBoardSize(body.boardSize),
          mine_rule: normalizeMineRule(body.mineRule),
          time_limit_seconds: normalizeTimeLimit(body.timeLimitSeconds),
          updated_at: nowIso(),
        })
        .select("*")
        .single();
      if (error) return badRequest(error.message);

      await ensurePlayer(admin, session.id, user, displayName, "teacher", body.teacherPlaying !== false);
      return respond(session.id);
    }

    const sessionId = normalizeId(body.sessionId);
    if (!sessionId) return badRequest("Session ID is required.");

    const { data: session } = await admin
      .from("minesweeper_race_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Race not found." }, { status: 404 });
    if (!canAccessCourse(viewer.courses, session.course_id)) {
      return forbidden("You do not have access to this race.");
    }

    const canManage = canManageCourse(viewer.courses, session.course_id);

    if (action === "join") {
      if (session.status === "ended") return badRequest("This race has ended.");
      // A teacher who joins without having chosen to play stays a spectator.
      await ensurePlayer(admin, session.id, user, displayName, canManage ? "teacher" : "student", canManage ? null : true);
      return respond(session.id);
    }

    if (action === "set_playing") {
      if (!canManage) return forbidden("Only a teacher can change this.");
      await ensurePlayer(admin, session.id, user, displayName, "teacher", body.playing !== false);
      return respond(session.id);
    }

    if (action === "start_round") {
      if (!canManage) return forbidden("Only a teacher can start a round.");
      if (session.status !== "lobby" && session.status !== "results") {
        return badRequest("Finish the current round before starting another.");
      }

      const { data: started, error } = await admin
        .from("minesweeper_race_sessions")
        .update({
          status: "racing",
          current_round: Number(session.current_round || 0) + 1,
          board_size: normalizeBoardSize(body.boardSize ?? session.board_size),
          mine_rule: normalizeMineRule(body.mineRule ?? session.mine_rule),
          time_limit_seconds: normalizeTimeLimit(body.timeLimitSeconds ?? session.time_limit_seconds),
          round_seed: randomUUID(),
          round_started_at: new Date(Date.now() + ROUND_COUNTDOWN_MS).toISOString(),
          round_ended_at: null,
          updated_at: nowIso(),
        })
        .eq("id", session.id)
        .eq("status", session.status)
        .eq("current_round", session.current_round)
        .select("id");
      if (error) return badRequest(error.message);
      if (!started || started.length === 0) return badRequest("That round was already started.");

      await touchPlayerPresence(admin, session.id, user.id);
      return respond(session.id);
    }

    if (action === "progress" || action === "finish") {
      await touchPlayerPresence(admin, session.id, user.id);

      const round = Number(body.round);
      const timing = roundTiming(session);
      const stale =
        session.status !== "racing" ||
        round !== Number(session.current_round) ||
        !timing.hasStarted ||
        timing.isPastDeadline;
      // A late report (round already ended, clock ran out) is not an error for
      // the player; they just get the current state back.
      if (stale) return respond(session.id);

      const { data: player } = await admin
        .from("minesweeper_race_players")
        .select("is_playing")
        .eq("session_id", session.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!player?.is_playing) return forbidden("Join the race before playing.");

      const board = roundBoard(session);
      const mineHits = nonNegativeInt(body.mineHits);
      const restarts = nonNegativeInt(body.restarts);
      const keys = { session_id: session.id, user_id: user.id, round_number: round };

      await admin
        .from("minesweeper_race_results")
        .upsert({ ...keys, revealed_safe: board.openingCount }, {
          onConflict: "session_id,user_id,round_number",
          ignoreDuplicates: true,
        });

      const isOut = session.mine_rule === MINE_RULE_OUT && mineHits > 0;
      const update = { mine_hits: mineHits, restarts, updated_at: nowIso() };
      const boardState = normalizeBoardState(body.cells, board);
      if (boardState) update.board_state = boardState;

      if (isOut) {
        update.status = "out";
        update.revealed_safe = clampRevealedSafe(body.revealedSafe, board);
        update.elapsed_ms = timing.elapsedMs;
      } else if (action === "finish") {
        update.status = "finished";
        update.revealed_safe = board.safeCount;
        update.elapsed_ms = timing.elapsedMs;
        update.finished_at = nowIso();
      } else {
        update.revealed_safe = clampRevealedSafe(body.revealedSafe, board);
      }

      // Only a row that is still in play can change, so a finish or knockout is final.
      const { error } = await admin
        .from("minesweeper_race_results")
        .update(update)
        .match(keys)
        .eq("status", "playing");
      if (error) return badRequest(error.message);

      return respond(session.id);
    }

    if (action === "end_round") {
      if (!canManage) return forbidden("Only a teacher can end the round.");
      if (session.status !== "racing") return badRequest("There is no round in progress.");
      await endRound(admin, session);
      return respond(session.id);
    }

    if (action === "end_session") {
      if (!canManage) return forbidden("Only a teacher can end the race.");
      if (session.status === "racing") await endRound(admin, session);
      const { error } = await admin
        .from("minesweeper_race_sessions")
        .update({ status: "ended", updated_at: nowIso() })
        .eq("id", session.id);
      if (error) return badRequest(error.message);
      return respond(session.id);
    }

    return badRequest("Unknown action.");
  } catch (err) {
    await logInternalEvent({
      eventKey: "minesweeper_race_api_error",
      source: "api.play.minesweeper-race",
      message: err?.message || "Unknown error",
      user,
      accountType: viewer.accountType,
      context: { action },
    });
    return NextResponse.json({ error: err?.message || "Request failed." }, { status: 500 });
  }
}
