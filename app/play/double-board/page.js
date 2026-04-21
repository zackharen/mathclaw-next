import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import {
  listAccessibleCourses,
  resolvePreferredCourseId,
} from "@/lib/student-games/courses";
import DoubleBoardClient from "./game-client";

export default async function DoubleBoardPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/double-board");

  const viewerAccountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: "double_board_review",
    viewerAccountType,
  });

  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const initialCourseId = resolvePreferredCourseId(courses, requestedCourseId);

  return (
    <div className="stack">
      <section className="card">
        <h1>Double Board</h1>
        <p>
          Run two side-by-side boards for whole-class review. You can choose the original integer
          operations version or the new percent-change multiplier version. Missed questions stay in
          play, rise in value, and turn the board into a strategic race instead of a one-and-done worksheet.
        </p>
      </section>
      <DoubleBoardClient
        courses={courses}
        initialCourseId={initialCourseId}
        userId={user.id}
        viewerAccountType={viewerAccountType}
      />
    </div>
  );
}
