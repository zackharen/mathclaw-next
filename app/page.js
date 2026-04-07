import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses, sortCoursesAlphabetically } from "@/lib/student-games/courses";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { getSiteCopy } from "@/lib/site-config";

function describeCourseRelationship(relationship) {
  if (relationship === "owner") return "teacher";
  if (relationship === "co_teacher") return "co-teacher";
  return "student";
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let courses = [];
  let playCourses = [];
  let accountType = null;
  const siteCopy = await getSiteCopy();

  if (user) {
    accountType = await getAccountTypeForUser(supabase, user);
    if (accountType !== "student") {
      const { data } = await supabase
        .from("courses")
        .select("id, title, class_name, schedule_model, ab_meeting_day")
        .eq("owner_id", user.id)
        .order("title", { ascending: true });
      courses = sortCoursesAlphabetically(data || []);
    }
    playCourses = await listAccessibleCourses(supabase, user.id);
  }

  const isStudent = accountType === "student";

  return (
    <div className="stack">
      {siteCopy.homeBanner ? (
        <section className="card" style={{ background: "#fff4d6", borderColor: "#cd3b3b" }}>
          <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{siteCopy.homeBanner}</p>
        </section>
      ) : null}

      <section className="card">
        <h1>MathClaw</h1>
        <p>{siteCopy.homeIntro}</p>
        <div className="featureGrid" style={{ marginTop: "1rem" }}>
          {!isStudent ? (
            <article className="card" style={{ background: "#fff" }}>
              <h2>Teacher Site</h2>
              <p>{siteCopy.teacherCardCopy}</p>
              <div className="ctaRow">
                <Link className="btn primary" href={user ? "/classes" : "/auth/sign-in?redirect=/classes"}>
                  Open Teacher Workspace
                </Link>
              </div>
            </article>
          ) : null}
          <article className="card" style={{ background: "#fff" }}>
            <h2>Student Games</h2>
            <p>{siteCopy.studentCardCopy}</p>
            <div className="ctaRow">
              <Link className="btn primary" href={user ? "/play" : "/auth/sign-in?redirect=/play"}>
                Open Student Arcade
              </Link>
            </div>
          </article>
        </div>
      </section>

      {user && !isStudent ? (
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
                    <strong>{course.title}</strong> — {course.class_name} ({describeCourseRelationship(course.relationship)})
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

      {user && isStudent ? (
        <section className="card">
          <h2>Your Student Arcade</h2>
          <p>
            Student accounts focus on games, class join codes, and progress tracking. Use the arcade to join a class and start playing.
          </p>
          {playCourses.length > 0 ? (
            <ul className="list" style={{ marginTop: "0.75rem" }}>
              {playCourses.map((course) => (
                <li key={course.id} className="card" style={{ background: "#fff", listStyle: "none" }}>
                  <strong>{course.title}</strong> — {course.class_name} ({describeCourseRelationship(course.relationship)})
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: "0.75rem" }}>You have not joined a class yet. Use a teacher join code in the Student Arcade.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
