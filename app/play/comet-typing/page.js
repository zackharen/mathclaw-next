import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildCometTypingPrompt } from "@/lib/question-engine/comet-typing";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import CometTypingClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function CometTypingPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/comet-typing");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "comet_typing" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "comet_typing")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=comet_typing");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "comet_typing",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <GameShell
      eyebrow="Typing · Solo"
      title="Comet Typing"
      description="Guide Nova across the star lane with clean, quick word deliveries and a streak that keeps the boosters lit."
      icon="☄"
      tone="blue"
      badges={["15-word runs", "Three difficulties", "Class leaderboards"]}
    >
      <CometTypingClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialPrompt={buildCometTypingPrompt("medium")}
      />
    </GameShell>
  );
}
