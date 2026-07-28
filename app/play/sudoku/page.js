import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import SudokuClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function SudokuPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/sudoku");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "sudoku" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "sudoku")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=sudoku");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "sudoku",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <GameShell
      eyebrow="Logic · Solo"
      title="Sudoku"
      description="Complete every row, column, and 3×3 box with focused number placement and three levels of challenge."
      icon="9"
      tone="green"
      badges={["Easy to hard", "Keyboard controls", "Progress scoring"]}
    >
      <SudokuClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialSeed={randomUUID()}
      />
    </GameShell>
  );
}
