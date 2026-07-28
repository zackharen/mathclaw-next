import { redirect } from "next/navigation";
import { initialShowdownState } from "@/lib/question-engine/showdown-framework";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import ShowdownFrameworkClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function ShowdownFrameworkPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/showdown-framework");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "showdown_framework" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "showdown_framework")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=showdown_framework");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "showdown_framework",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <GameShell
      eyebrow="Reaction · Solo"
      title="Showdown Framework"
      description="Read Linear Larry's tells, defend at the right moment, and counter through a fast arcade fight."
      icon="SH"
      tone="gold"
      badges={["Keyboard + touch", "Guided tutorial", "Three fight speeds"]}
    >
      <ShowdownFrameworkClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialBattleState={initialShowdownState(0, "easy")}
      />
    </GameShell>
  );
}
