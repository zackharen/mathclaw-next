import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";

const ALLOWED_GAMES = new Set(["2048", "integer_practice", "number_compare"]);

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

  return NextResponse.json({ leaderboard: data || [] });
}
