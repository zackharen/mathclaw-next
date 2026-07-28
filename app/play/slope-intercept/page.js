import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { buildSlopeInterceptRound } from "@/lib/question-engine/slope-intercept";
import { GameShell } from "../game-shell";
import SlopeInterceptClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function SlopeInterceptPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/slope-intercept");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "slope_intercept" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "slope_intercept")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=slope_intercept");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "slope_intercept",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  const initialRound = buildSlopeInterceptRound();

  return (
    <GameShell
      eyebrow="Algebra · Solo"
      title="Slope & Y-Intercept"
      description="Study a graphed line, identify its slope and y-intercept, and sharpen the connection between equations and graphs."
      icon="y="
      tone="blue"
      badges={["10 graphs", "Desmos powered", "Class leaderboards"]}
    >
      <SlopeInterceptClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialRound={initialRound}
      />
    </GameShell>
  );
}
