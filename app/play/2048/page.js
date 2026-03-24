import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import Game2048Client from "./game-client";

export default async function Game2048Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/2048");

  const [courses, leaderboardResult, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    supabase
      .from("game_player_global_stats")
      .select("player_id, average_score, last_10_average, best_score, sessions_played, profiles!inner(display_name)")
      .eq("game_slug", "2048")
      .order("average_score", { ascending: false })
      .limit(10),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "2048")
      .maybeSingle(),
  ]);

  return (
    <div className="stack">
      <section className="card">
        <h1>2048</h1>
        <p>Merge tiles, chase bigger powers of two, and save every run to your MathClaw profile.</p>
      </section>
      <Game2048Client courses={courses} personalStats={personalResult.data} leaderboard={leaderboardResult.data || []} />
    </div>
  );
}
