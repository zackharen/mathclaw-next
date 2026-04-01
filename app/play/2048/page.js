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

  const [courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "2048")
      .maybeSingle(),
  ]);

  const initialCourseId = courses[0]?.id || "";
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "2048",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>2048</h1>
        <p>
          Merge tiles, chase bigger powers of two, and save every run to your MathClaw
          profile. Pick a class if you want that score tied back to a teacher’s view.
        </p>
      </section>
      <Game2048Client
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
      />
    </div>
  );
}
