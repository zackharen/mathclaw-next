import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDefaultDisplayName,
  getAccountTypeForUser,
} from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { upsertGameStats } from "@/lib/student-games/stats";

const GAME_SLUG = "lowest_number_wins";
const PLAYER_PRESENCE_WINDOW_MS = 8000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumberType(value) {
  return value === "decimals" ? "decimals" : "integers";
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

function canManageCourse(courses, courseId, accountType) {
  if (!courseId) return accountType !== "student";
  return isTeacherRelationship(getCourseRecord(courses, courseId)?.relationship);
}

function canAccessCourse(courses, courseId) {
  if (!courseId) return true;
  return Boolean(getCourseRecord(courses, courseId));
}

function viewerCanAccessSession(session, courses, user) {
  if (!session) return false;
  if (!session.course_id) return session.host_teacher_id === user.id;
  return canAccessCourse(courses, session.course_id);
}

function viewerCanManageSession(session, courses, user, accountType) {
  if (!session) return false;
  if (session.host_teacher_id === user.id) return true;
  return canManageCourse(courses, session.course_id, accountType);
}

async function resolveDisplayName(supabase, user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return String(data?.display_name || buildDefaultDisplayName(user)).trim() || "MathClaw User";
}

async function ensurePlayer(admin, sessionId, user, displayName, role = "student") {
  const payload = {
    session_id: sessionId,
    user_id: user.id,
    display_name: displayName,
    role,
    joined_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data: existing } = await admin
    .from("lowest_number_wins_players")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    payload.joined_at = existing.joined_at;
    const { data, error } = await admin
      .from("lowest_number_wins_players")
      .update({ display_name: displayName, updated_at: nowIso() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await admin
    .from("lowest_number_wins_players")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function touchPlayerPresence(admin, sessionId, userId) {
  if (!sessionId || !userId) return;
  await admin
    .from("lowest_number_wins_players")
    .update({ updated_at: nowIso() })
    .eq("session_id", sessionId)
    .eq("user_id", userId);
}

function parsePickValue(raw, numberType) {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (numberType === "integers") {
    if (!Number.isInteger(num)) return null;
    return num;
  }
  // decimals: allow up to 4 decimal places
  return Math.round(num * 10000) / 10000;
}

function computeRoundWinner(picks) {
  // Group by value
  const groups = new Map();
  for (const pick of picks) {
    const key = String(pick.value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pick);
  }

  // Find unique picks (only one player chose that value)
  const uniquePicks = [];
  for (const [, group] of groups) {
    if (group.length === 1) uniquePicks.push(group[0]);
  }

  if (!uniquePicks.length) return null;

  // Winner is the smallest unique value
  uniquePicks.sort((a, b) => Number(a.value) - Number(b.value));
  return uniquePicks[0];
}

async function loadSessionBundle(admin, sessionId, viewer) {
  const [{ data: session }, { data: players }, { data: allPicks }] = await Promise.all([
    admin
      .from("lowest_number_wins_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("lowest_number_wins_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true }),
    admin
      .from("lowest_number_wins_picks")
      .select("*")
      .eq("session_id", sessionId),
  ]);

  if (!session) return null;

  const canManage = viewerCanManageSession(
    session,
    viewer.courses,
    viewer.user,
    viewer.accountType
  );

  const currentRound = Number(session.current_round || 0);
  const studentPlayers = (players || []).filter((p) => p.role === "student");
  const totalStudents = studentPlayers.length;

  // Picks for current round
  const currentRoundPicks = (allPicks || []).filter(
    (p) => Number(p.round_number) === currentRound
  );

  // Submission count: number of students who have submitted this round
  const submittedUserIds = new Set(currentRoundPicks.map((p) => p.user_id));
  const submittedCount = studentPlayers.filter((p) =>
    submittedUserIds.has(p.user_id)
  ).length;

  const viewerPick = currentRoundPicks.find((p) => p.user_id === viewer.user.id) || null;
  const viewerHasSubmitted = Boolean(viewerPick);

  // Build picks payload — hide other players' picks during picking phase
  const revealPicks =
    canManage ||
    session.status === "revealed" ||
    session.status === "ended";

  const playerMap = new Map((players || []).map((p) => [p.user_id, p]));

  let picksPayload = null;
  if (revealPicks && currentRound > 0) {
    // Group by value for display
    const groups = new Map();
    for (const pick of currentRoundPicks) {
      const key = String(pick.value);
      if (!groups.has(key)) {
        groups.set(key, { value: Number(pick.value), players: [] });
      }
      const playerRecord = playerMap.get(pick.user_id);
      groups.get(key).players.push({
        userId: pick.user_id,
        displayName: playerRecord?.display_name || "Student",
      });
    }
    picksPayload = [...groups.values()]
      .sort((a, b) => a.value - b.value)
      .map((group) => ({
        value: group.value,
        players: group.players,
        isUnique: group.players.length === 1,
      }));
  }

  // Round history from metadata
  const metadata =
    session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const roundHistory = Array.isArray(metadata.rounds) ? metadata.rounds : [];

  // Current round result (from metadata if revealed)
  const currentRoundResult =
    roundHistory.find((r) => r.roundNumber === currentRound) || null;

  // Leaderboard: students sorted by total_wins desc then joined_at asc
  const leaderboard = studentPlayers
    .map((p, index) => ({
      id: p.id,
      userId: p.user_id,
      displayName: p.display_name,
      totalWins: Number(p.total_wins || 0),
      joinedAt: p.joined_at,
      isPresent: isPlayerPresent(p),
    }))
    .sort(
      (a, b) =>
        b.totalWins - a.totalWins ||
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    )
    .map((p, index) => ({ ...p, rank: index + 1 }));

  const viewerPlayer = (players || []).find((p) => p.user_id === viewer.user.id) || null;

  return {
    id: session.id,
    courseId: session.course_id,
    hostTeacherId: session.host_teacher_id,
    status: session.status,
    currentRound,
    numberType: session.number_type,
    canManage,
    isJoined: Boolean(viewerPlayer),
    viewerRole: viewerPlayer?.role || null,
    viewerTotalWins: Number(viewerPlayer?.total_wins || 0),
    totalStudents,
    submittedCount,
    viewerHasSubmitted,
    viewerPickValue: viewerPick ? Number(viewerPick.value) : null,
    picks: picksPayload,
    currentRoundResult,
    roundHistory,
    leaderboard,
    updatedAt: session.updated_at,
  };
}

async function recordSessionResults(admin, sessionId) {
  const { data: session } = await admin
    .from("lowest_number_wins_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.results_recorded_at) return;

  const { data: players } = await admin
    .from("lowest_number_wins_players")
    .select("*")
    .eq("session_id", sessionId);

  const metadata =
    session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const totalRounds = Number(session.current_round || 0);

  for (const player of players || []) {
    if (player.role !== "student") continue;

    const wins = Number(player.total_wins || 0);
    await admin.from("game_sessions").insert({
      game_slug: GAME_SLUG,
      player_id: player.user_id,
      course_id: session.course_id,
      score: wins,
      result: wins > 0 ? "win" : "finished",
      metadata: {
        sessionId,
        totalRounds,
        totalWins: wins,
        numberType: session.number_type,
      },
    });

    await upsertGameStats({
      supabase: admin,
      userId: player.user_id,
      gameSlug: GAME_SLUG,
      courseId: session.course_id,
      latestStats: {
        skillRating: wins,
        result: wins > 0 ? "win" : "finished",
        totalWins: wins,
        totalRounds,
      },
    });
  }

  await admin
    .from("lowest_number_wins_sessions")
    .update({ results_recorded_at: nowIso(), updated_at: nowIso() })
    .eq("id", sessionId);
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
  const sessionId = normalizeId(searchParams.get("sessionId"));
  const courseId = normalizeId(searchParams.get("courseId"));

  let session;
  if (sessionId) {
    const { data } = await admin
      .from("lowest_number_wins_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    session = data;
  } else if (courseId) {
    if (!canAccessCourse(viewer.courses, courseId)) {
      return NextResponse.json(
        { error: "Lowest Number Wins is not enabled for that class." },
        { status: 403 }
      );
    }
    const { data } = await admin
      .from("lowest_number_wins_sessions")
      .select("*")
      .eq("course_id", courseId)
      .in("status", ["waiting", "picking", "revealed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    session = data;
  }

  if (!session) return NextResponse.json({ session: null });

  if (!viewerCanAccessSession(session, viewer.courses, user)) {
    return NextResponse.json(
      { error: "You do not have access to this session." },
      { status: 403 }
    );
  }

  await touchPlayerPresence(admin, session.id, user.id);
  const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
  return NextResponse.json({ session: bundle });
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = await getViewerContext(supabase, user);
  const admin = createAdminClient();
  const displayName = await resolveDisplayName(supabase, user);
  const body = await request.json();
  const action = String(body.action || "");

  try {
    if (action === "create") {
      const courseId = normalizeId(body.courseId);
      const numberType = normalizeNumberType(body.numberType);

      if (!courseId) {
        return NextResponse.json({ error: "A class is required." }, { status: 400 });
      }

      if (!canManageCourse(viewer.courses, courseId, viewer.accountType)) {
        return NextResponse.json(
          { error: "Only a teacher can host Lowest Number Wins." },
          { status: 403 }
        );
      }

      // End any existing active sessions for this course
      await admin
        .from("lowest_number_wins_sessions")
        .update({ status: "ended", updated_at: nowIso() })
        .eq("course_id", courseId)
        .in("status", ["waiting", "picking", "revealed"]);

      const { data: session, error: sessionError } = await admin
        .from("lowest_number_wins_sessions")
        .insert({
          course_id: courseId,
          host_teacher_id: user.id,
          status: "waiting",
          current_round: 0,
          number_type: numberType,
          metadata: { rounds: [] },
          updated_at: nowIso(),
        })
        .select("*")
        .single();

      if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 400 });
      }

      await ensurePlayer(admin, session.id, user, displayName, "teacher");
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    const sessionId = normalizeId(body.sessionId);
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required." }, { status: 400 });
    }

    const { data: session } = await admin
      .from("lowest_number_wins_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (!viewerCanAccessSession(session, viewer.courses, user)) {
      return NextResponse.json(
        { error: "You do not have access to this session." },
        { status: 403 }
      );
    }

    await touchPlayerPresence(admin, session.id, user.id);
    const canManage = viewerCanManageSession(session, viewer.courses, user, viewer.accountType);

    if (action === "join") {
      if (session.status === "ended") {
        return NextResponse.json({ error: "This session has ended." }, { status: 400 });
      }
      await ensurePlayer(
        admin,
        session.id,
        user,
        displayName,
        canManage ? "teacher" : "student"
      );
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "start_round") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can start a round." }, { status: 403 });
      }
      if (session.status !== "waiting" && session.status !== "revealed") {
        return NextResponse.json(
          { error: "A round can only be started from the waiting or revealed state." },
          { status: 400 }
        );
      }

      const nextRound = Number(session.current_round || 0) + 1;
      const { error } = await admin
        .from("lowest_number_wins_sessions")
        .update({
          status: "picking",
          current_round: nextRound,
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "submit_pick") {
      if (session.status !== "picking") {
        return NextResponse.json({ error: "Picks are not open right now." }, { status: 400 });
      }
      if (canManage) {
        return NextResponse.json(
          { error: "Teachers cannot submit picks." },
          { status: 403 }
        );
      }

      const value = parsePickValue(body.value, session.number_type);
      if (value === null) {
        const hint =
          session.number_type === "integers"
            ? "Enter a whole number greater than 0."
            : "Enter a number greater than 0.";
        return NextResponse.json({ error: hint }, { status: 400 });
      }

      const currentRound = Number(session.current_round || 0);

      // Check for duplicate submission
      const { data: existingPick } = await admin
        .from("lowest_number_wins_picks")
        .select("id")
        .eq("session_id", session.id)
        .eq("user_id", user.id)
        .eq("round_number", currentRound)
        .maybeSingle();

      if (existingPick) {
        return NextResponse.json({ error: "You already submitted a pick this round." }, { status: 400 });
      }

      await ensurePlayer(admin, session.id, user, displayName, "student");

      const { error: pickError } = await admin
        .from("lowest_number_wins_picks")
        .insert({
          session_id: session.id,
          user_id: user.id,
          round_number: currentRound,
          value,
        });

      if (pickError) {
        return NextResponse.json({ error: pickError.message }, { status: 400 });
      }

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle, result: { submitted: true } });
    }

    if (action === "reveal") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can reveal results." }, { status: 403 });
      }
      if (session.status !== "picking") {
        return NextResponse.json({ error: "Results can only be revealed during a picking round." }, { status: 400 });
      }

      const currentRound = Number(session.current_round || 0);
      const { data: picks } = await admin
        .from("lowest_number_wins_picks")
        .select("*")
        .eq("session_id", session.id)
        .eq("round_number", currentRound);

      const winner = computeRoundWinner(picks || []);
      const playerMap = new Map();
      const { data: players } = await admin
        .from("lowest_number_wins_players")
        .select("*")
        .eq("session_id", session.id);

      for (const p of players || []) playerMap.set(p.user_id, p);

      const winnerPlayer = winner ? playerMap.get(winner.user_id) || null : null;
      const winnerDisplayName = winnerPlayer?.display_name || null;
      const winnerValue = winner ? Number(winner.value) : null;

      const roundResult = {
        roundNumber: currentRound,
        revealedAt: nowIso(),
        winnerId: winnerPlayer?.user_id || null,
        winnerDisplayName,
        winningValue: winnerValue,
        picksCount: (picks || []).length,
      };

      const metadata =
        session.metadata && typeof session.metadata === "object" ? session.metadata : {};
      const existingRounds = Array.isArray(metadata.rounds) ? metadata.rounds : [];
      const nextRounds = [
        ...existingRounds.filter((r) => r.roundNumber !== currentRound),
        roundResult,
      ];

      const { error: updateError } = await admin
        .from("lowest_number_wins_sessions")
        .update({
          status: "revealed",
          metadata: { ...metadata, rounds: nextRounds },
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      // Increment total_wins for winner
      if (winnerPlayer) {
        await admin
          .from("lowest_number_wins_players")
          .update({
            total_wins: Number(winnerPlayer.total_wins || 0) + 1,
            updated_at: nowIso(),
          })
          .eq("id", winnerPlayer.id);
      }

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle, result: roundResult });
    }

    if (action === "next_round") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can start the next round." }, { status: 403 });
      }
      if (session.status !== "revealed") {
        return NextResponse.json({ error: "Next round can only be started after revealing results." }, { status: 400 });
      }

      const nextRound = Number(session.current_round || 0) + 1;
      const { error } = await admin
        .from("lowest_number_wins_sessions")
        .update({
          status: "picking",
          current_round: nextRound,
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "end") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can end the session." }, { status: 403 });
      }

      const { error } = await admin
        .from("lowest_number_wins_sessions")
        .update({ status: "ended", updated_at: nowIso() })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await recordSessionResults(admin, session.id);
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    await logInternalEvent({
      eventKey: "lowest_number_wins_api_error",
      source: "api.play.lowest-number-wins",
      message: err?.message || "Unknown error",
      user,
      accountType: viewer.accountType,
      context: { action },
    });
    return NextResponse.json(
      { error: err?.message || "Request failed." },
      { status: 500 }
    );
  }
}
