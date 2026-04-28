import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import {
  listAccessibleCourses,
  resolvePreferredCourseId,
} from "@/lib/student-games/courses";
import OpenMiddleHubClient from "./game-client";

export default async function OpenMiddlePage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/open-middle");

  const viewerAccountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "open_middle",
    viewerAccountType,
  });
  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <div className="stack">
      <section className="card">
        <h1>Open Middle</h1>
        <p>
          Build reusable digit puzzles, launch them live with a classroom timer, and reveal every
          student solution together at the end. The goal is discussion and strategy, not instant
          right-or-wrong feedback.
        </p>
      </section>
      <OpenMiddleHubClient
        courses={courses}
        initialCourseId={initialCourseId}
        userId={user.id}
        viewerAccountType={viewerAccountType}
      />
    </div>
  );
}
