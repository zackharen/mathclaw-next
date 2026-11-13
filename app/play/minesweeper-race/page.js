import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import { GameShell } from "../game-shell";
import MinesweeperRaceClient from "./race-client";
import "../game-shell.css";
import "../minesweeper/styles.css";
import "./styles.css";

export default async function MinesweeperRacePage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/minesweeper-race");

  const viewerAccountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "minesweeper",
    viewerAccountType,
  });

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <GameShell
      eyebrow="Logic · Whole class"
      title="Minesweeper Race"
      description="Everyone gets the exact same minefield at the exact same moment. Clear every safe square first to win the round."
      icon="💣"
      tone="gold"
      badges={["Same board for everyone", "Shared starting patch", "Points every round"]}
    >
      <MinesweeperRaceClient courses={courses} initialCourseId={initialCourseId} userId={user.id} />
    </GameShell>
  );
}
