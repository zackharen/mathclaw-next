import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { userCanAccessCourse } from "@/lib/student-games/courses";

const ALLOWED_SAVE_GAMES = new Set(["2048"]);

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

function buildSavedGamesMetadata(user) {
  const current = user?.user_metadata?.saved_games;
  return current && typeof current === "object" ? { ...current } : {};
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

  if (!state || !isValid2048Board(state.board) || !Number.isFinite(Number(state.score || 0))) {
    return NextResponse.json({ error: "Invalid 2048 save state." }, { status: 400 });
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
  const savedGames = buildSavedGamesMetadata(user);
  savedGames[gameSlug] = {
    courseId,
    state,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      saved_games: savedGames,
    },
  });

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
  const savedGames = buildSavedGamesMetadata(user);
  delete savedGames[gameSlug];

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      saved_games: savedGames,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
