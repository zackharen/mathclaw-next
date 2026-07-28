import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import NumberCompareClient from "./game-client";
import "../game-shell.css";

export default async function NumberComparePage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/number-compare");
  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "number_compare" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "number_compare")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=number_compare");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "number_compare",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <GameShell
      eyebrow="Math skills · Solo"
      title="Which Number Is Bigger?"
      description="Read both values, trust your number sense, and build a streak across a focused ten-question run."
      icon="↔"
      tone="coral"
      badges={["10 questions", "Adaptive challenge", "Class leaderboards"]}
    >
      <NumberCompareClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
      />
    </GameShell>
  );
}
