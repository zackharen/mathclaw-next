import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { boardFull, dropToken, emptyBoard, hasWinner, nextToken, normalizeBoard } from "@/lib/student-games/connect4";
import { generateJoinCode } from "@/lib/student-games/join-code";
import { userCanAccessCourse } from "@/lib/student-games/courses";
import { upsertGameStats } from "@/lib/student-games/stats";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";

function normalizeCourseId(value) {
  return typeof value === "string" && value ? value : null;
}

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountType = await getAccountTypeForUser(supabase, user);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const code = searchParams.get("code");

  let query = supabase
    .from("connect4_matches")
    .select("id, invite_code, course_id, player_one_id, player_two_id, current_turn_id, winner_id, status, board, move_count, metadata, created_at, updated_at");

  query = id ? query.eq("id", id) : query.eq("invite_code", code);
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  return NextResponse.json({ match: { ...data, board: normalizeBoard(data.board) } });
}

async function saveFinishedMatchStats({ supabase, match, winnerId, isDraw }) {
  const participants = [match.player_one_id, match.player_two_id].filter(Boolean);

  for (const playerId of participants) {
    const score =
      isDraw ? 0.5 : playerId === winnerId ? 1 : 0;
    const result =
      isDraw ? "draw" : playerId === winnerId ? "win" : "loss";

    const { error: insertError } = await supabase.from("game_sessions").insert({
      game_slug: "connect4",
      player_id: playerId,
      course_id: match.course_id,
      score,
      result,
      metadata: {
        skillRating: score,
        moveCount: Number(match.move_count || 0) + 1,
      },
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await upsertGameStats({
      supabase,
      userId: playerId,
      gameSlug: "connect4",
      courseId: match.course_id,
      latestStats: {
        skillRating: score,
        moveCount: Number(match.move_count || 0) + 1,
        result,
      },
    });
  }
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const action = String(body.action || "");

  if (action === "create") {
    const courseId = normalizeCourseId(body.courseId);
    if (courseId) {
      const canAccess = await userCanAccessCourse(supabase, user.id, courseId, {
        gameSlug: "connect4",
      });
      if (!canAccess) {
        await logInternalEvent({
          eventKey: "connect4_create_forbidden_course",
          source: "api.play.connect4",
          level: "warning",
          message: "Tried to create Connect4 match for disabled or inaccessible class",
          user,
          accountType,
          courseId,
        });
        return NextResponse.json(
          { error: "Connect4 is not enabled for that class." },
          { status: 403 }
        );
      }
    }

    let inviteCode = generateJoinCode(8);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from("connect4_matches")
        .insert({
          invite_code: inviteCode,
          course_id: courseId,
          created_by: user.id,
          player_one_id: user.id,
          current_turn_id: user.id,
          board: emptyBoard(),
          metadata: {},
        })
        .select("id, invite_code, course_id, player_one_id, player_two_id, current_turn_id, winner_id, status, board, move_count, metadata, created_at, updated_at")
        .single();

      if (!error) return NextResponse.json({ match: data });
      if (!String(error.message || "").includes("duplicate")) {
        await logInternalEvent({
          eventKey: "connect4_create_failed",
          source: "api.play.connect4",
          message: error.message,
          user,
          accountType,
          courseId,
        });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      inviteCode = generateJoinCode(8);
    }
    await logInternalEvent({
      eventKey: "connect4_create_exhausted_codes",
      source: "api.play.connect4",
      message: "Could not create unique Connect4 invite code",
      user,
      accountType,
      courseId,
    });
    return NextResponse.json({ error: "Could not create match" }, { status: 500 });
  }

  if (action === "join") {
    const inviteCode = String(body.inviteCode || "").trim().toUpperCase();
    const { data: joinedRows, error } = await supabase.rpc("join_connect4_match_by_code", {
      p_invite_code: inviteCode,
    });

    if (error) {
      await logInternalEvent({
        eventKey: "connect4_join_failed",
        source: "api.play.connect4",
        message: error.message,
        user,
        accountType,
        context: { inviteCode },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const updated = Array.isArray(joinedRows) ? joinedRows[0] : null;
    if (!updated) {
      await logInternalEvent({
        eventKey: "connect4_join_not_found",
        source: "api.play.connect4",
        level: "warning",
        message: "Connect4 invite code not found",
        user,
        accountType,
        context: { inviteCode },
      });
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    return NextResponse.json({ match: { ...updated, board: normalizeBoard(updated.board) } });
  }

  if (action === "move") {
    const matchId = String(body.matchId || "");
    const column = Number(body.column);
    const { data: match, error } = await supabase
      .from("connect4_matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();

    if (error) {
      await logInternalEvent({
        eventKey: "connect4_fetch_match_failed",
        source: "api.play.connect4",
        message: error.message,
        user,
        accountType,
        context: { matchId, action: "move" },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!match) {
      await logInternalEvent({
        eventKey: "connect4_move_match_not_found",
        source: "api.play.connect4",
        level: "warning",
        message: "Connect4 move attempted on missing match",
        user,
        accountType,
        context: { matchId },
      });
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.status !== "active") return NextResponse.json({ error: "Match is not active" }, { status: 400 });
    if (match.current_turn_id !== user.id) return NextResponse.json({ error: "Not your turn" }, { status: 403 });

    const token = nextToken(user.id, match.player_one_id);
    const { board, row, placed } = dropToken(match.board, column, token);
    if (!placed) return NextResponse.json({ error: "Column is full" }, { status: 400 });

    const winner = hasWinner(board, row, column, token) ? user.id : null;
    const draw = !winner && boardFull(board);
    const nextTurn =
      winner || draw ? null : user.id === match.player_one_id ? match.player_two_id : match.player_one_id;

    const payload = {
      board,
      move_count: Number(match.move_count || 0) + 1,
      current_turn_id: nextTurn,
      winner_id: winner,
      status: winner || draw ? "finished" : "active",
      updated_at: new Date().toISOString(),
      metadata: { ...(match.metadata || {}), draw },
    };

    const { data: updated, error: updateError } = await supabase
      .from("connect4_matches")
      .update(payload)
      .eq("id", match.id)
      .select("*")
      .single();

    if (updateError) {
      await logInternalEvent({
        eventKey: "connect4_move_update_failed",
        source: "api.play.connect4",
        message: updateError.message,
        user,
        accountType,
        courseId: match.course_id,
        context: { matchId, column },
      });
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (winner || draw) {
      try {
        const adminSupabase = createAdminClient();
        await saveFinishedMatchStats({
          supabase: adminSupabase,
          match,
          winnerId: winner,
          isDraw: draw,
        });
      } catch (statsError) {
        await logInternalEvent({
          eventKey: "connect4_finish_stats_failed",
          source: "api.play.connect4",
          message: statsError.message,
          user,
          accountType,
          courseId: match.course_id,
          context: { matchId, winnerId: winner, draw },
        });
        return NextResponse.json({ error: statsError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ match: { ...updated, board: normalizeBoard(updated.board) } });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
