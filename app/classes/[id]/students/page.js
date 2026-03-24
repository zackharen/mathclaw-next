import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regenerateStudentJoinCodeAction } from "@/app/classes/actions";

export default async function StudentsPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/students`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, class_name, student_join_code")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect("/classes");
  }

  const [{ data: memberships }, { data: stats }] = await Promise.all([
    supabase
      .from("student_course_memberships")
      .select("profile_id, joined_at, profiles!inner(display_name, school_name)")
      .eq("course_id", course.id)
      .order("joined_at", { ascending: false }),
    supabase
      .from("course_game_player_stats")
      .select("player_id, game_slug, average_score, last_10_average, best_score, sessions_played")
      .eq("course_id", course.id),
  ]);

  const statsByPlayer = new Map();
  for (const row of stats || []) {
    const arr = statsByPlayer.get(row.player_id) || [];
    arr.push(row);
    statsByPlayer.set(row.player_id, arr);
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Student Progress</h1>
        <p>Give students this code so they can join your class from the arcade.</p>
        <div className="ctaRow">
          <span className="pill">Join Code: {course.student_join_code || "Not set yet"}</span>
          <form action={regenerateStudentJoinCodeAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <button className="btn" type="submit">
              Generate New Code
            </button>
          </form>
          <Link className="btn" href={`/classes/${course.id}/plan`}>
            Back To Plan
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Joined Students</h2>
        {!memberships || memberships.length === 0 ? (
          <p>No students have joined yet.</p>
        ) : (
          <div className="list">
            {memberships.map((membership) => {
              const playerStats = statsByPlayer.get(membership.profile_id) || [];
              const profile = Array.isArray(membership.profiles)
                ? membership.profiles[0]
                : membership.profiles;
              return (
                <article key={membership.profile_id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile?.display_name || "Student"}</h3>
                  <p>
                    Joined {new Date(membership.joined_at).toLocaleDateString()}
                    {profile?.school_name ? ` · ${profile.school_name}` : ""}
                  </p>
                  {playerStats.length === 0 ? (
                    <p style={{ marginTop: "0.75rem" }}>No game data yet.</p>
                  ) : (
                    <div className="list" style={{ marginTop: "0.75rem" }}>
                      {playerStats.map((row) => (
                        <div key={`${row.player_id}-${row.game_slug}`} className="card" style={{ background: "#f9fbfc" }}>
                          <strong>{row.game_slug}</strong>
                          <p>
                            Sessions: {row.sessions_played} · Avg: {Math.round(Number(row.average_score || 0) * 10) / 10}
                            {" · "}Last 10: {Math.round(Number(row.last_10_average || 0) * 10) / 10}
                            {" · "}Best: {row.best_score}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
