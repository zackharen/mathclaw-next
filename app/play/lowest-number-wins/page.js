import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import {
  listAccessibleCourses,
  resolvePreferredCourseId,
} from "@/lib/student-games/courses";
import LowestNumberWinsClient from "./game-client";

export default async function LowestNumberWinsPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/lowest-number-wins");

  const viewerAccountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "lowest_number_wins",
    viewerAccountType,
  });

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <div className="stack">
      <section className="card">
        <h1>Lowest Number Wins</h1>
        <p>
          Everyone picks a number greater than zero. Whoever picks the lowest number that
          no one else picked wins the round. Simple rule, surprisingly tricky strategy.
        </p>
      </section>
      <LowestNumberWinsClient
        courses={courses}
        initialCourseId={initialCourseId}
        userId={user.id}
        viewerAccountType={viewerAccountType}
      />
    </div>
  );
}
