import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listAccessibleCourses, resolvePreferredCourseId } from "@/lib/student-games/courses";
import TournamentClient from "./tournament-client";
import "../connect4/styles.css";
import "./styles.css";

export default async function TournamentsPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/tournaments");

  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "connect4",
    viewerAccountType: accountType,
  });
  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <div className="stack tournamentShell">
      <section className="card tournamentHero">
        <div>
          <p className="eyebrow">Group Activities</p>
          <h1>Tournaments</h1>
          <p>
            Connect 4 is the first tournament game. Students join the lobby from this page,
            then the teacher generates a random bracket from the students who are present.
          </p>
        </div>
      </section>
      <TournamentClient
        courses={courses}
        userId={user.id}
        accountType={accountType}
        initialCourseId={initialCourseId}
      />
    </div>
  );
}
