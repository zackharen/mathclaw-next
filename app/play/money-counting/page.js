import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import MoneyCountingClient from "./game-client";

export default async function MoneyCountingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/money-counting");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "money_counting" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "money_counting")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=money_counting");
  }

  const initialCourseId = courses[0]?.id || "";
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "money_counting",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Money Counting</h1>
        <p>Count money or build the right amount using coins and simple dollar amounts.</p>
      </section>
      <MoneyCountingClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
      />
    </div>
  );
}
