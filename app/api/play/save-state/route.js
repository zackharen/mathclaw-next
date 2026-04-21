import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";

const ALLOWED_SAVE_GAMES = new Set(["2048", "integer_practice"]);

function isValid2048Board(board) {
  return (
    Array.isArray(board) &&
    board.length === 4 &&
    board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        row.every((cell) => Number.isInteger(cell) && cell >= 0)
    )
  );
}

function isValidIntegerProfileState(state) {
  if (!state || typeof state !== "object") return false;
  const currentLevelId = Number(state.currentLevelId || 0);
  const highestLevelReached = Number(state.highestLevelReached || 0);
  const rollingHistory = Array.isArray(state.rollingHistory) ? state.rollingHistory : null;

  return (
    Number.isInteger(currentLevelId) &&
    currentLevelId >= 1 &&
    Number.isInteger(highestLevelReached) &&
    highestLevelReached >= 1 &&
    rollingHistory !== null
  );
}

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
  const courseId = body.courseId && typeof body.courseId === "string" ? body.courseId : null;
  const state = body.state && typeof body.state === "object" ? body.state : null;

  if (!ALLOWED_SAVE_GAMES.has(gameSlug)) {
    return NextResponse.json({ error: "Unsupported saved game" }, { status: 400 });
  }

  if (gameSlug === "2048") {
    if (!state || !isValid2048Board(state.board) || !Number.isFinite(Number(state.score || 0))) {
      return NextResponse.json({ error: "Invalid 2048 save state." }, { status: 400 });
    }
  } else if (gameSlug === "integer_practice") {
    if (!state || !isValidIntegerProfileState(state.profile)) {
      return NextResponse.json({ error: "Invalid integer practice save state." }, { status: 400 });
    }
  }

  if (courseId) {
    const canAccess = await userCanAccessCourse(supabase, user.id, courseId, { gameSlug });
    if (!canAccess) {
      return NextResponse.json(
        { error: "This game is not enabled for that class." },
        { status: 403 }
      );
    }
  }

  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();

  let newState;
  if (gameSlug === "integer_practice") {
    // Fetch existing row to merge profilesByCourse across different courses.
    const { data: existing } = await admin
      .from("saved_game_progress")
      .select("state")
      .eq("user_id", user.id)
      .eq("game_slug", "integer_practice")
      .maybeSingle();

    const currentSave =
      existing?.state && typeof existing.state === "object" ? existing.state : { profilesByCourse: {} };
    const profilesByCourse =
      currentSave.profilesByCourse && typeof currentSave.profilesByCourse === "object"
        ? { ...currentSave.profilesByCourse }
        : {};

    const courseKey = courseId || "none";
    profilesByCourse[courseKey] = { courseId, profile: state.profile, updatedAt };

    newState = {
      ...currentSave,
      profilesByCourse,
      lastCourseId: courseId,
      updatedAt,
    };
  } else {
    newState = { courseId, state, updatedAt };
  }

  const { error } = await admin
    .from("saved_game_progress")
    .upsert(
      { user_id: user.id, game_slug: gameSlug, state: newState, updated_at: updatedAt },
      { onConflict: "user_id,game_slug" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameSlug = String(searchParams.get("gameSlug") || "");

  if (!ALLOWED_SAVE_GAMES.has(gameSlug)) {
    return NextResponse.json({ error: "Unsupported saved game" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("saved_game_progress")
    .delete()
    .eq("user_id", user.id)
    .eq("game_slug", gameSlug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
