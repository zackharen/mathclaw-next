import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import Connect4Client from "./game-client";

export default async function Connect4Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/connect4");
  const courses = await listAccessibleCourses(supabase, user.id);

  return (
    <div className="stack">
      <section className="card">
        <h1>Connect4</h1>
        <p>Create a code, share it, and play another MathClaw user live on the site.</p>
      </section>
      <Connect4Client courses={courses} userId={user.id} />
    </div>
  );
}
