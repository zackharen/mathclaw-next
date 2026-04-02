import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";
import { GAME_SLUGS } from "@/lib/student-games/catalog";

const ALLOWED_GAMES = GAME_SLUGS;

function sortLeaderboardRows(gameSlug, rows) {
  if (gameSlug === "2048") {
    return [...rows].sort((a, b) => {
      const bestGap = Number(b.best_score || 0) - Number(a.best_score || 0);
      if (bestGap !== 0) return bestGap;
      const avgGap = Number(b.average_score || 0) - Number(a.average_score || 0);
      if (avgGap !== 0) return avgGap;
      return Number(b.last_10_average || 0) - Number(a.last_10_average || 0);
    });
  }
  return rows;
}

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId");
  const gameSlug = searchParams.get("gameSlug");

  if (!courseId || !gameSlug || !ALLOWED_GAMES.has(gameSlug)) {
    return NextResponse.json({ error: "Invalid leaderboard request" }, { status: 400 });
  }

  const canAccess = await userCanAccessCourse(supabase, user.id, courseId, {
    gameSlug,
  });
  if (!canAccess) {
    return NextResponse.json(
      { error: "This game is not enabled for that class." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.rpc("list_course_game_leaderboard", {
    p_course_id: courseId,
    p_game_slug: gameSlug,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ leaderboard: sortLeaderboardRows(gameSlug, data || []) });
}
