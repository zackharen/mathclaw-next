import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import DoubleBoardClient from "./game-client";

export default async function DoubleBoardPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/double-board");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "double_board_review" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "double_board_review")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=double_board_review");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "double_board_review",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Double Board</h1>
        <p>
          Run paired review boards for whole-class play. Wrong answers leave an X, missed spaces get
          more valuable, and matching spaces can inspire the opposite board.
        </p>
      </section>
      <DoubleBoardClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
      />
    </div>
  );
}
