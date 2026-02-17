import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  let { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error && typeof error.message === "string" && error.message.includes("ab_meeting_day")) {
    const retry = await supabase
      .from("courses")
      .select("id, title, class_name, schedule_model, school_year_start, school_year_end")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    courses = (retry.data || []).map((course) => ({ ...course, ab_meeting_day: null }));
    error = retry.error;
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Your Classes</h1>
        <p>Manage class setup and open pacing/announcement workflows.</p>
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
                <p>
                  {course.school_year_start} to {course.school_year_end}
                </p>
                <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>Course ID: {course.id}</p>
                <div className="ctaRow">
                  <Link className="btn" href={`/classes/${course.id}/calendar`}>
                    Open Calendar
                  </Link>
                  <Link className="btn" href={`/classes/${course.id}/plan`}>
                    Open Pacing
                  </Link>
                  <Link className="btn" href={`/classes/${course.id}/announcements`}>
                    Open Announcements
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
