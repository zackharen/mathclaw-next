import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import Connect4Client from "./game-client";

export default async function Connect4Page({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/connect4");
  const [allCourses, courses] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    listAccessibleCourses(supabase, user.id, { gameSlug: "connect4" }),
  ]);

  if (allCourses.length > 0 && courses.length === 0) {
    redirect("/play?game_disabled=connect4");
  }

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <div className="stack">
      <section className="card">
        <h1>Connect4</h1>
        <p>Create a code, share it, and play another MathClaw user live on the site.</p>
      </section>
      <Connect4Client courses={courses} userId={user.id} initialCourseId={initialCourseId} />
    </div>
  );
}
