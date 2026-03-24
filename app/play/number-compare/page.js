import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import NumberCompareClient from "./game-client";

export default async function NumberComparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/number-compare");
  const courses = await listAccessibleCourses(supabase, user.id);

  return (
    <div className="stack">
      <section className="card">
        <h1>Which Number Is Bigger?</h1>
        <p>Mix decimals, negatives, fractions, and radicals, then click the larger value.</p>
      </section>
      <NumberCompareClient courses={courses} />
    </div>
  );
}
