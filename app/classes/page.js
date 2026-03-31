import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { deleteClassAction, regenerateStudentJoinCodeAction } from "./actions";

export default async function ClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (accountType === "student") {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding/profile");
  }

  let error = null;
  let courses = [];
  try {
    courses = await listEditableCoursesForUser(
      supabase,
      user.id,
      "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at"
    );
  } catch (loadError) {
    error = loadError;
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Your Classes</h1>
        <p>Manage class setup and open planning workflows.</p>
        <div className="ctaRow">
          <Link className="btn primary" href="/classes/new">
            Add Class
          </Link>
        </div>
      </section>

      <section className="card">
        {error ? <p>Could not load classes: {error.message}</p> : null}

        {!error && (!courses || courses.length === 0) ? (
          <p>No classes yet. Use Add Class to create your first section.</p>
        ) : null}

        {!error && courses && courses.length > 0 ? (
          <div className="list">
            {courses.map((course) => (
              <article key={course.id} className="card" style={{ background: "#fff" }}>
                <h3>{course.title}</h3>
                <p>
                  {course.class_name} | {course.schedule_model === "ab" ? `AB (${course.ab_meeting_day || "A/B"})` : "Every Day"}
                </p>
                <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
                  {course.membership_role === "owner" ? "Role: Owner" : "Role: Co-Teacher"}
                </p>
                <p>
                  {course.school_year_start} to {course.school_year_end}
                </p>
                {course.student_join_code ? (
                  <p style={{ fontSize: "0.95rem" }}>
                    Student Join Code: <strong>{course.student_join_code}</strong>
                  </p>
                ) : null}
                <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>Course ID: {course.id}</p>
                <div className="ctaRow">
                  <Link className="btn" href={`/classes/${course.id}/plan`}>
                    Open Plan
                  </Link>
                  <Link className="btn" href={`/classes/${course.id}/students`}>
                    Student Progress
                  </Link>
                  {course.student_join_code ? (
                    <form action={regenerateStudentJoinCodeAction}>
                      <input type="hidden" name="course_id" value={course.id} />
                      <button className="btn" type="submit">
                        New Join Code
                      </button>
                    </form>
                  ) : null}
                  {course.membership_role === "owner" ? (
                    <form action={deleteClassAction}>
                      <input type="hidden" name="course_id" value={course.id} />
                      <button className="btn danger" type="submit">
                        Delete Class
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
