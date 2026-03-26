import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let courses = [];
  let playCourses = [];
  if (user) {
    const { data } = await supabase
      .from("courses")
      .select("id, title, class_name, schedule_model, ab_meeting_day")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    courses = data || [];
    playCourses = await listAccessibleCourses(supabase, user.id);
  }

  return (
    <div className="stack">
      <section className="card" style={{ background: "#fff4d6", borderColor: "#cd3b3b" }}>
        <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Ahily won Wingstop!</p>
      </section>

      <section className="card">
        <h1>MathClaw</h1>
        <p>
          MathClaw helps math teachers plan with less friction: align curriculum,
          maintain pacing, produce clear daily communication, and build playful
          math habits for students from one shared platform.
        </p>
        <div className="featureGrid" style={{ marginTop: "1rem" }}>
          <article className="card" style={{ background: "#fff" }}>
            <h2>Teacher Site</h2>
            <p>
              Build classes, control pacing, edit calendars, and generate what your
              class needs each day.
            </p>
            <div className="ctaRow">
              <Link className="btn primary" href={user ? "/classes" : "/auth/sign-in?redirect=/classes"}>
                Open Teacher Workspace
              </Link>
            </div>
          </article>
          <article className="card" style={{ background: "#fff" }}>
            <h2>Student Games</h2>
            <p>
              Practice, compete, and track progress across arcade games and quick math
              challenges.
            </p>
            <div className="ctaRow">
              <Link className="btn primary" href={user ? "/play" : "/auth/sign-in?redirect=/play"}>
                Open Student Arcade
              </Link>
            </div>
          </article>
        </div>
      </section>

      {user ? (
        <>
          <section className="card">
            <h2>Your Teaching Classes</h2>
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
                      <Link className="btn" href={`/classes/${course.id}/students`}>
                        View Student Progress
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Your Arcade Access</h2>
            <p>
              Teachers can jump into games too. Any class you own or join can become a
              leaderboard context.
            </p>
            {playCourses.length > 0 ? (
              <ul className="list" style={{ marginTop: "0.75rem" }}>
                {playCourses.map((course) => (
                  <li key={course.id} className="card" style={{ background: "#fff", listStyle: "none" }}>
                    <strong>{course.title}</strong> — {course.class_name} ({course.relationship})
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
