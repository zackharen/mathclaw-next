import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import IntegerPracticeClient from "./game-client";

export default async function IntegerPracticePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/integer-practice");
  const courses = await listAccessibleCourses(supabase, user.id);
  return (
    <div className="stack">
      <section className="card">
        <h1>Adding & Subtracting Integers</h1>
        <p>Adaptive fluency practice with options for bigger numbers and multiple choice.</p>
      </section>
      <IntegerPracticeClient courses={courses} />
    </div>
  );
}
