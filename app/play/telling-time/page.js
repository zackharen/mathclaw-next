import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { buildTellingTimeQuestion } from "@/lib/question-engine/telling-time";
import { GameShell } from "../game-shell";
import TellingTimeClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function TellingTimePage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/telling-time");

  const [allCourses, courses, personalResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "telling_time" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "telling_time")
      .maybeSingle(),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=telling_time");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "telling_time",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  const initialQuestion = buildTellingTimeQuestion("mixed", "multiple_choice", 4);

  return (
    <GameShell
      eyebrow="Math skills · Solo"
      title="Telling Time"
      description="Read an analog clock or move its hands to a target time, with quick practice to the nearest five minutes."
      icon="◷"
      tone="coral"
      badges={["10 rounds", "Read or set", "Interactive clock"]}
    >
      <TellingTimeClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialQuestion={initialQuestion}
      />
    </GameShell>
  );
}
