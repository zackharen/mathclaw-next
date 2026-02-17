import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateAnnouncementsAction } from "./actions";
import CopyButton from "./copy-button";

function prettyDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ClassAnnouncementsPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/announcements`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, class_name")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!course) {
    redirect("/classes");
  }

  const { data: announcements, error } = await supabase
    .from("course_announcements")
    .select("class_date, content, copied_at")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Announcements</h1>
        <p>{course.class_name}</p>
        <div className="ctaRow">
          <Link className="btn" href="/classes">
            Back to Classes
          </Link>
          <Link className="btn" href={`/classes/${course.id}/plan`}>
            Open Pacing
          </Link>
          <form action={generateAnnouncementsAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <button className="btn primary" type="submit">
              Generate Announcements
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2>Daily Announcements</h2>
        {error ? <p>Could not load announcements: {error.message}</p> : null}

        {!error && (!announcements || announcements.length === 0) ? (
          <p>No announcements yet. Generate from pacing.</p>
        ) : null}

        {!error && announcements && announcements.length > 0 ? (
          <div className="list">
            {announcements.map((row) => (
              <article className="card" style={{ background: "#fff" }} key={row.class_date}>
                <h3>{prettyDate(row.class_date)}</h3>
                <pre className="announcementText">{row.content}</pre>
                <div className="ctaRow">
                  <CopyButton text={row.content} />
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
