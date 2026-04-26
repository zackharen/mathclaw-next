import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import { ensureGameCatalog, GAME_SLUGS } from "@/lib/student-games/catalog";

const ALLOWED_GAMES = GAME_SLUGS;

// Maximum score accepted per session for each game. Values are generous upper bounds
// for what a legitimate single-session run can produce. Scores above the ceiling are
// clamped rather than rejected so valid-but-surprising runs still get recorded.
const SCORE_CEILINGS = {
  "2048": 500_000,
  connect4: 1,
  integer_practice: 500,
  money_counting: 500,
  minesweeper: 10_000,
  number_compare: 500,
  telling_time: 500,
  locker_practice: 100,
  slope_intercept: 500,
  sudoku: 500,
  spiral_review: 500,
  question_kind_review: 500,
  double_board_review: 2_000,
  skill_builder: 500,
  showdown_framework: 500,
  comet_typing: 10_000,
};

function clampScore(gameSlug, rawScore) {
  const ceiling = SCORE_CEILINGS[gameSlug];
  if (ceiling === undefined) return Math.max(0, rawScore);
  return Math.max(0, Math.min(ceiling, rawScore));
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountType = await getAccountTypeForUser(supabase, user);

  const body = await request.json();
  const gameSlug = String(body.gameSlug || "");
  const score = clampScore(gameSlug, Number(body.score || 0));
  const result = body.result ? String(body.result) : null;
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const courseId =
    body.courseId && typeof body.courseId === "string" ? body.courseId : null;

  if (!ALLOWED_GAMES.has(gameSlug)) {
    await logInternalEvent({
      eventKey: "game_session_unsupported_game",
      source: "api.play.session",
      level: "warning",
      message: `Unsupported game slug: ${gameSlug}`,
      user,
      accountType,
      context: { gameSlug, courseId },
    });
    return NextResponse.json({ error: "Unsupported game" }, { status: 400 });
  }

  try {
    await ensureGameCatalog();
  } catch (catalogError) {
    await logInternalEvent({
      eventKey: "game_session_catalog_sync_failed",
      source: "api.play.session",
      message: String(catalogError?.message || "Could not sync game catalog."),
      user,
      accountType,
      courseId,
      context: { gameSlug },
    });
  }

  if (courseId) {
    const canAccess = await userCanAccessCourse(supabase, user.id, courseId, {
      gameSlug,
    });
    if (!canAccess) {
      await logInternalEvent({
        eventKey: "game_session_forbidden_course",
        source: "api.play.session",
        level: "warning",
        message: "Tried to save score for disabled or inaccessible class",
        user,
        accountType,
        courseId,
        context: { gameSlug },
      });
      return NextResponse.json(
        { error: "This game is not enabled for that class." },
        { status: 403 }
      );
    }
  }

  const { data: saveRows, error: saveError } = await supabase.rpc("record_game_session", {
    p_game_slug: gameSlug,
    p_score: Number.isFinite(score) ? score : 0,
    p_result: result,
    p_metadata: metadata,
    p_requested_course_id: courseId,
  });

  if (saveError) {
    await logInternalEvent({
      eventKey: "game_session_rpc_failed",
      source: "api.play.session",
      message: saveError.message,
      user,
      accountType,
      courseId,
      context: { gameSlug, result, score },
    });
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  const rawStats = Array.isArray(saveRows) ? saveRows[0] || null : null;
  const stats = rawStats
    ? {
        course_id: rawStats.saved_course_id ?? null,
        sessions_played: rawStats.sessions_played,
        average_score: rawStats.average_score,
        last_10_average: rawStats.last_10_average,
        best_score: rawStats.best_score,
      }
    : null;

  return NextResponse.json({ ok: true, stats });
}
