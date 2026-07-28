import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { buildMoneyQuestion } from "@/lib/question-engine/money-counting";
import { GameShell } from "../game-shell";
import MoneyCountingClient from "./game-client";
import "../game-shell.css";
import "./styles.css";

export default async function MoneyCountingPage({ searchParams }) {
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

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "money_counting",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  const initialQuestion = buildMoneyQuestion("mixed", 4);

  return (
    <GameShell
      eyebrow="Math skills · Solo"
      title="Money Counting"
      description="Count real-looking coins and bills, or build an exact target amount with a fast hands-on money challenge."
      icon="$"
      tone="green"
      badges={["10 rounds", "Count or build", "Class leaderboards"]}
    >
      <MoneyCountingClient
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        initialQuestion={initialQuestion}
      />
    </GameShell>
  );
}
