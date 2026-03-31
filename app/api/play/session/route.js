import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";

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
  const courseId =
    body.courseId && typeof body.courseId === "string" ? body.courseId : null;

  if (!ALLOWED_GAMES.has(gameSlug)) {
    return NextResponse.json({ error: "Unsupported game" }, { status: 400 });
  }

  if (courseId) {
    const canAccess = await userCanAccessCourse(supabase, user.id, courseId);
    if (!canAccess) {
      return NextResponse.json({ error: "Invalid class context" }, { status: 403 });
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
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  const stats = Array.isArray(saveRows) ? saveRows[0] || null : null;

  return NextResponse.json({ ok: true, stats });
}
