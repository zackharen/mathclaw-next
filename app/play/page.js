import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { joinClassByCodeAction } from "./actions";

function gameHref(slug) {
  if (slug === "integer_practice") return "/play/integer-practice";
  if (slug === "number_compare") return "/play/number-compare";
  return `/play/${slug}`;
}

export default async function PlayPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/play");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding/profile");
  }

  const [courses, gamesResult, statsResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    supabase.from("games").select("slug, name, category, description, is_multiplayer").order("name"),
    supabase
      .from("game_player_global_stats")
      .select("game_slug, average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id),
  ]);

  const statsByGame = new Map((statsResult.data || []).map((row) => [row.game_slug, row]));
  const params = await searchParams;
  const joinedCourseId = typeof params?.course === "string" ? params.course : "";
  const joinedCourse = joinedCourseId ? courses.find((course) => course.id === joinedCourseId) : null;

  return (
    <div className="stack">
      <section className="card">
        <h1>Student Arcade</h1>
        <p>
          Welcome, {profile.display_name}. Join a class with a teacher code, play games,
          and save your progress over time.
        </p>
        <div className="featureGrid" style={{ marginTop: "1rem" }}>
          <form action={joinClassByCodeAction} className="card" style={{ background: "#fff" }}>
            <h2>Join A Math Class</h2>
            <p>Paste the code your teacher gives you and we’ll connect your account right away.</p>
            <div className="ctaRow">
              <input
                className="input"
                style={{ maxWidth: "16rem", textTransform: "uppercase", letterSpacing: "0.08em" }}
                name="join_code"
                placeholder="e.g. 04084F46F9"
                autoComplete="off"
                spellCheck="false"
              />
              <button className="btn primary" type="submit">
                Join Class
              </button>
            </div>
            <p style={{ marginTop: "0.75rem", opacity: 0.8 }}>Codes are not case-sensitive. You can paste them in exactly as your teacher shares them.</p>
            {params?.join_error === "missing" ? <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>Please enter a class code.</p> : null}
            {params?.join_error === "not_found" ? <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>That class code was not found. Double-check the letters and numbers with your teacher.</p> : null}
            {params?.join_success === "1" && joinedCourse ? (
              <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
                <h3 style={{ marginBottom: "0.4rem" }}>You’re in.</h3>
                <p>
                  <strong>{joinedCourse.title}</strong>
                  <br />
                  {joinedCourse.class_name} · {joinedCourse.relationship === "owner" ? "Teacher account" : "Joined as student"}
                </p>
                <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
                  <Link className="btn" href="/play/2048">Play 2048</Link>
                  <Link className="btn" href="/play/integer-practice">Practice Integers</Link>
                </div>
              </div>
            ) : null}
          </form>

          <article className="card" style={{ background: "#fff" }}>
            <h2>Your Math Classes</h2>
            {courses.length === 0 ? (
              <p>No joined classes yet. Once you add a class code, your teacher’s class will show up here.</p>
            ) : (
              <div className="list">
                {courses.map((course) => (
                  <div key={course.id} className="card" style={{ background: joinedCourseId === course.id ? "#e8f1f8" : "#f9fbfc" }}>
                    <strong>{course.title}</strong>
                    <p>
                      {course.class_name} · {course.relationship === "owner" ? "Teacher account" : "Joined as student"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Games</h2>
        <div className="featureGrid">
          {(gamesResult.data || []).map((game) => {
            const stats = statsByGame.get(game.slug);
            return (
              <article key={game.slug} className="card" style={{ background: "#fff" }}>
                <h3>{game.name}</h3>
                <p>{game.description}</p>
                <p style={{ marginTop: "0.6rem", opacity: 0.75 }}>
                  {game.category.replaceAll("_", " ")}{game.is_multiplayer ? " · Multiplayer" : ""}
                </p>
                {stats ? (
                  <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <span>Games Played</span>
                      <strong>{stats.sessions_played}</strong>
                    </div>
                    <div>
                      <span>Average</span>
                      <strong>{Math.round(Number(stats.average_score || 0) * 10) / 10}</strong>
                    </div>
                    <div>
                      <span>Last 10 Avg</span>
                      <strong>{Math.round(Number(stats.last_10_average || 0) * 10) / 10}</strong>
                    </div>
                    <div>
                      <span>Best</span>
                      <strong>{stats.best_score}</strong>
                    </div>
                  </div>
                ) : null}
                <div className="ctaRow">
                  <Link className="btn primary" href={gameHref(game.slug)}>
                    Play {game.name}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
