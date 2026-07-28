import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import {
  buildSkillBuilderQuestion,
  serializeSkillBuilderQuestion,
} from "@/lib/question-engine/skill-builder";
import { GameShell } from "../game-shell";
import SkillBuilderClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function SkillBuilderPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/skill-builder");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "skill_builder" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "skill_builder")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=skill_builder");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "skill_builder",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  const initialQuestion = serializeSkillBuilderQuestion(
    buildSkillBuilderQuestion("integers", 1)
  );

  return (
    <GameShell
      eyebrow="Adaptive practice · Solo"
      title="Skill Builder"
      description="Choose a math target, build a streak, and watch the challenge adapt as your mastery grows."
      icon="↗"
      tone="green"
      badges={["12 focused questions", "Adaptive difficulty", "Class leaderboards"]}
    >
      <SkillBuilderClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialQuestion={initialQuestion}
      />
    </GameShell>
  );
}
