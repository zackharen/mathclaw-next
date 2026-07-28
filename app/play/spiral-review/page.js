import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import {
  buildSpiralReviewQuestion,
  serializeSpiralReviewQuestion,
} from "@/lib/question-engine/spiral-review";
import { GameShell } from "../game-shell";
import SpiralReviewClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function SpiralReviewPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/spiral-review");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "spiral_review" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "spiral_review")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=spiral_review");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "spiral_review",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  const initialQuestion = serializeSpiralReviewQuestion(buildSpiralReviewQuestion("mixed"));

  return (
    <GameShell
      eyebrow="Math skills · Solo"
      title="Spiral Review"
      description="Keep older skills warm with a fast, mixed practice run that moves between integer work and number comparisons."
      icon="↻"
      tone="green"
      badges={["12 questions", "Mixed practice", "Class leaderboards"]}
    >
      <SpiralReviewClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialQuestion={initialQuestion}
      />
    </GameShell>
  );
}
