import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let courses = [];
  if (user) {
    const { data } = await supabase
      .from("courses")
      .select("id, title, class_name, schedule_model, ab_meeting_day")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    courses = data || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Mission</h1>
        <p>
          MathClaw helps math teachers plan with less friction: align curriculum,
          maintain pacing, and produce clear daily communication from one source
          of truth.
        </p>
      </section>

      {user ? (
        <section className="card">
          <h2>Your Classes</h2>
          {courses.length === 0 ? (
            <p>No classes yet. Create one to get started.</p>
          ) : (
            <div className="list" style={{ marginTop: "0.75rem" }}>
              {courses.map((course) => (
                <article key={course.id} className="card" style={{ background: "#fff" }}>
                  <h3>{course.title}</h3>
                  <p>
                    {course.class_name} | {course.schedule_model === "ab" ? `AB (${course.ab_meeting_day || "A/B"})` : "Every Day"}
                  </p>
                  <div className="ctaRow">
                    <Link className="btn" href={`/classes/${course.id}/plan`}>
                      Open Plan
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
