import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegerMasterySettings } from "@/lib/integer-practice/mastery-settings.server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import IntegerPracticeClient from "./game-client";

export default async function IntegerPracticePage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/integer-practice");
  const accountType = await getAccountTypeForUser(supabase, user);
  const admin = createAdminClient();
  const [allCourses, courses, personalResult, savedProgressResult, masterySettings] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "integer_practice" }),
    supabase
      .from("game_player_global_stats")
      .select("average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id)
      .eq("game_slug", "integer_practice")
      .maybeSingle(),
    supabase
      .from("saved_game_progress")
      .select("state")
      .eq("user_id", user.id)
      .eq("game_slug", "integer_practice")
      .maybeSingle(),
    getIntegerMasterySettings(admin),
  ]);

  // Fall back to auth metadata for users who haven't saved since the DB migration.
  const savedIntegerPractice =
    savedProgressResult.data?.state ||
    (user.user_metadata?.saved_games &&
    typeof user.user_metadata.saved_games === "object"
      ? user.user_metadata.saved_games.integer_practice || null
      : null);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=integer_practice");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);
  let initialLeaderboard = [];

  if (initialCourseId) {
    const { data: leaderboardRows } = await supabase.rpc("list_course_game_leaderboard", {
      p_course_id: initialCourseId,
      p_game_slug: "integer_practice",
    });
    initialLeaderboard = leaderboardRows || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Adding & Subtracting Integers</h1>
        <p>Adaptive fluency practice with options for bigger numbers and multiple choice.</p>
      </section>
      <IntegerPracticeClient
        userId={user.id}
        accountType={accountType}
        courses={courses}
        initialCourseId={initialCourseId}
        initialLeaderboard={initialLeaderboard}
        personalStats={personalResult.data}
        savedProfileState={savedIntegerPractice}
        masterySettings={masterySettings}
      />
    </div>
  );
}
