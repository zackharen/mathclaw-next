import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import MinesweeperClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function MinesweeperPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/minesweeper");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "minesweeper" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "minesweeper")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=minesweeper");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "minesweeper",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <GameShell
      eyebrow="Logic · Solo"
      title="Minesweeper"
      description="Read the clues, mark the danger, and clear every safe square. Your first reveal is always protected."
      icon="💣"
      tone="gold"
      badges={["6–22 square boards", "Safe first move", "Touch flag mode"]}
    >
      <MinesweeperClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialSeed={randomUUID()}
      />
    </GameShell>
  );
}
