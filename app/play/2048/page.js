import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import Game2048Client from "./game-client";

function sortLeaderboardRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const bestGap = Number(b.best_score || 0) - Number(a.best_score || 0);
    if (bestGap !== 0) return bestGap;
    const avgGap = Number(b.average_score || 0) - Number(a.average_score || 0);
    if (avgGap !== 0) return avgGap;
    return Number(b.last_10_average || 0) - Number(a.last_10_average || 0);
  });
}

export default async function Game2048Page({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/2048");

  const savedGame =
    user.user_metadata?.saved_games &&
    typeof user.user_metadata.saved_games === "object"
      ? user.user_metadata.saved_games["2048"] || null
      : null;

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "2048" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "2048")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=2048");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "2048",
    });
    initialLeaderboard = sortLeaderboardRows(leaderboardRows || []);
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
        savedGame={savedGame}
      />
    </div>
  );
}
