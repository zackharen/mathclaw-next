import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findDefaultCourseForUser, userCanAccessCourse } from "@/lib/student-games/courses";
import { upsertGameStats } from "@/lib/student-games/stats";

const ALLOWED_GAMES = new Set(["2048", "integer_practice", "number_compare"]);

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const gameSlug = String(body.gameSlug || "");
  const score = Number(body.score || 0);
  const result = body.result ? String(body.result) : null;
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  let courseId =
    body.courseId && typeof body.courseId === "string" ? body.courseId : null;

  if (!ALLOWED_GAMES.has(gameSlug)) {
    return NextResponse.json({ error: "Unsupported game" }, { status: 400 });
  }

  if (courseId) {
    const canAccess = await userCanAccessCourse(supabase, user.id, courseId);
    if (!canAccess) {
      return NextResponse.json({ error: "Invalid class context" }, { status: 403 });
    }
  } else {
    courseId = await findDefaultCourseForUser(supabase, user.id);
  }

  const { error: insertError } = await supabase.from("game_sessions").insert({
    game_slug: gameSlug,
    player_id: user.id,
    course_id: courseId,
    score: Number.isFinite(score) ? score : 0,
    result,
    metadata,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const stats = await upsertGameStats({
    supabase,
    userId: user.id,
    gameSlug,
    courseId,
    latestStats: metadata,
  });

  return NextResponse.json({ ok: true, stats });
}
