import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import RaceDisplayClient from "./display-client";
import "../styles.css";

export const metadata = { title: "Minesweeper Race Display" };

export default async function MinesweeperRaceDisplayPage({ searchParams }) {
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
  const courseId = resolvePreferredCourseId(courses, requestedCourseId);
  const course = courses.find((entry) => entry.id === courseId) || null;

  if (!course) redirect("/play/minesweeper-race");

  return <RaceDisplayClient courseId={course.id} courseTitle={course.title || course.class_name || ""} />;
}
