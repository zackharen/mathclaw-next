import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regenerateStudentJoinCodeAction } from "@/app/classes/actions";

function formatGameLabel(slug) {
  return {
    "2048": "2048",
    connect4: "Connect4",
    integer_practice: "Adding & Subtracting Integers",
    number_compare: "Which Number Is Bigger?",
  }[slug] || slug;
}

export default async function StudentsPage({ params, searchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/students`);
  }

  let {
    data: course,
    error: courseError,
  } = await supabase
    .from("courses")
    .select("id, title, class_name, student_join_code")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (
    courseError &&
    typeof courseError.message === "string" &&
    courseError.message.includes("student_join_code")
  ) {
    const retry = await supabase
      .from("courses")
      .select("id, title, class_name")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    course = retry.data ? { ...retry.data, student_join_code: null } : null;
    courseError = retry.error;
  }

  if (courseError || !course) {
    redirect("/classes");
  }

  const resolvedSearchParams = await searchParams;
  const joinCodeUpdated = resolvedSearchParams?.join_code_updated === "1";
  const joinCodeError = resolvedSearchParams?.join_code_error || "";

  const [{ data: memberships, error: membershipsError }, { data: stats, error: statsError }] = await Promise.all([
    supabase
      .from("student_course_memberships")
      .select("profile_id, joined_at")
      .eq("course_id", course.id)
      .order("joined_at", { ascending: false }),
    supabase
      .from("course_game_player_stats")
      .select("player_id, game_slug, average_score, last_10_average, best_score, sessions_played")
      .eq("course_id", course.id),
  ]);

  const safeMemberships = membershipsError ? [] : memberships || [];
  const safeStats = statsError ? [] : stats || [];
  const profileIds = [...new Set(safeMemberships.map((membership) => membership.profile_id).filter(Boolean))];

  let profileById = new Map();

  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, school_name")
      .in("id", profileIds);

    profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  const statsByPlayer = new Map();
  for (const row of safeStats) {
    const arr = statsByPlayer.get(row.player_id) || [];
    arr.push(row);
    statsByPlayer.set(row.player_id, arr);
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Student Progress</h1>
        {joinCodeUpdated ? <p style={{ color: "#0a7a32", fontWeight: 700 }}>Join code updated.</p> : null}
        {joinCodeError === "missing_column" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>
            Join codes are not enabled in Supabase yet. Run the student-games SQL migration, then try again.
          </p>
        ) : null}
        {joinCodeError && joinCodeError !== "missing_column" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>Could not generate a join code yet. Please try again.</p>
        ) : null}
        <p>
          Students join this class from the Student Arcade using your class code. Once they join and play,
          their progress will show up here.
        </p>
        <div className="list">
          <div className="card" style={{ background: "#fff" }}>
            <h2>How Students Join</h2>
            <p>1. Open the Student Arcade.</p>
            <p>2. Sign in or create a student account.</p>
            <p>3. Enter your class join code.</p>
            <p>4. Start playing games. Their progress will automatically attach to this class.</p>
          </div>
          <div className="card" style={{ background: "#fff" }}>
            <h2>Class Join Code</h2>
            <p style={{ marginBottom: "0.75rem" }}>
              {course.student_join_code
                ? "Share this code with students so they can add themselves to your class."
                : "Generate a join code to let students add themselves to this class."}
            </p>
            <div className="ctaRow">
              <span className="pill">Join Code: {course.student_join_code || "Not set yet"}</span>
              <form action={regenerateStudentJoinCodeAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <button className="btn" type="submit">
                  {course.student_join_code ? "Generate New Code" : "Generate Join Code"}
                </button>
              </form>
              <Link className="btn" href="/play">
                Open Student Arcade
              </Link>
              <Link className="btn" href={`/classes/${course.id}/plan`}>
                Back To Plan
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Joined Students</h2>
        {membershipsError ? <p>Student list could not load yet. Try refreshing in a moment.</p> : null}
        {!membershipsError && safeMemberships.length === 0 ? (
          <p>No students have joined yet.</p>
        ) : null}

        {!membershipsError && safeMemberships.length > 0 ? (
          <div className="list">
            {safeMemberships.map((membership) => {
              const playerStats = statsByPlayer.get(membership.profile_id) || [];
              const profile = profileById.get(membership.profile_id) || null;
              return (
                <article key={membership.profile_id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile?.display_name || `Student ${membership.profile_id.slice(0, 8)}`}</h3>
                  <p>
                    Joined {new Date(membership.joined_at).toLocaleDateString()}
                    {profile?.school_name ? ` · ${profile.school_name}` : ""}
                  </p>
                  {statsError ? <p style={{ marginTop: "0.75rem" }}>Game stats are not available yet.</p> : null}
                  {!statsError && playerStats.length === 0 ? (
                    <p style={{ marginTop: "0.75rem" }}>No game data yet.</p>
                  ) : null}
                  {!statsError && playerStats.length > 0 ? (
                    <div className="list" style={{ marginTop: "0.75rem" }}>
                      {playerStats.map((row) => (
                        <div key={`${row.player_id}-${row.game_slug}`} className="card" style={{ background: "#f9fbfc" }}>
                          <strong>{formatGameLabel(row.game_slug)}</strong>
                          <p>
                            Sessions: {row.sessions_played} · Avg: {Math.round(Number(row.average_score || 0) * 10) / 10}
                            {" · "}Last 10: {Math.round(Number(row.last_10_average || 0) * 10) / 10}
                            {" · "}Best: {row.best_score}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
