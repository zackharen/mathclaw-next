import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import { joinClassByCodeAction } from "./actions";

function gameHref(slug) {
  if (slug === "integer_practice") return "/play/integer-practice";
  if (slug === "number_compare") return "/play/number-compare";
  return `/play/${slug}`;
}

function describeCourseRelationship(relationship) {
  if (relationship === "owner") return "Teacher account";
  if (relationship === "co_teacher") return "Co-teacher access";
  return "Joined as student";
}

function getGameTags(game) {
  const tags = [];

  if (game.category === "arcade" || game.slug === "connect4") {
    tags.push("#arcade");
  }

  if (game.category === "math_skills") {
    tags.push("#mathskills");
  }

  if (game.is_multiplayer) {
    tags.push("#multiplayer");
  }

  return tags;
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

  const [courses, statsResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    supabase
      .from("game_player_global_stats")
      .select("game_slug, average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id),
  ]);

  const statsByGame = new Map((statsResult.data || []).map((row) => [row.game_slug, row]));
  const params = await searchParams;
  const joinedCourseId = typeof params?.course === "string" ? params.course : "";
  const joinedCourse = joinedCourseId ? courses.find((course) => course.id === joinedCourseId) : null;
  const activeCourse = joinedCourse || courses[0] || null;
  const games = await listGamesWithCourseSettings(supabase, activeCourse?.id || null);
  const visibleGames = games.filter((game) => game.enabled);
  const arcadeGames = visibleGames.filter(
    (game) => game.category === "arcade" || game.slug === "connect4"
  );
  const mathSkillsGames = visibleGames.filter((game) => game.category === "math_skills");

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
            {params?.join_error === "server" ? (
              <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
                Something went wrong while joining that class. Please try again or report the bug.
              </p>
            ) : null}
            {typeof params?.game_disabled === "string" ? (
              <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
                That game is not enabled for any of your current classes.
              </p>
            ) : null}
            {params?.join_success === "1" && joinedCourse ? (
              <div className="card" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
                <h3 style={{ marginBottom: "0.4rem" }}>You’re in.</h3>
                <p>
                  <strong>{joinedCourse.title}</strong>
                  <br />
                  {joinedCourse.class_name} · {describeCourseRelationship(joinedCourse.relationship)}
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
                  <Link
                    key={course.id}
                    href={`/play?course=${course.id}`}
                    className="card"
                    style={{
                      background: activeCourse?.id === course.id ? "#e8f1f8" : "#f9fbfc",
                      display: "block",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{course.title}</strong>
                    <p>
                      {course.class_name} · {describeCourseRelationship(course.relationship)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="card">
        <h2>{activeCourse ? `Games For ${activeCourse.title}` : "Games"}</h2>
        {activeCourse ? (
          <p>
            This arcade view is using <strong>{activeCourse.class_name}</strong> as the current class context.
          </p>
        ) : null}
        {activeCourse && visibleGames.length === 0 ? (
          <p style={{ marginTop: "0.75rem" }}>No games are enabled for this class yet.</p>
        ) : null}
        <div className="arcadeColumns">
          <div className="arcadeColumn">
            <div className="arcadeColumnHeader">
              <h3>#arcade</h3>
              <p>Arcade-style games and head-to-head play.</p>
            </div>
            <div className="arcadeGameList">
              {arcadeGames.map((game) => {
                const stats = statsByGame.get(game.slug);
                return (
                  <article key={game.slug} className="card arcadeGameCard" style={{ background: "#fff" }}>
                    <h3>{game.name}</h3>
                    <p>{game.description}</p>
                    <p className="arcadeGameTags">{getGameTags(game).join(", ")}</p>
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
          </div>

          <div className="arcadeColumn">
            <div className="arcadeColumnHeader">
              <h3>#mathskills</h3>
              <p>Quick skill practice and fluency-building games.</p>
            </div>
            <div className="arcadeGameList">
              {mathSkillsGames.map((game) => {
                const stats = statsByGame.get(game.slug);
                return (
                  <article key={game.slug} className="card arcadeGameCard" style={{ background: "#fff" }}>
                    <h3>{game.name}</h3>
                    <p>{game.description}</p>
                    <p className="arcadeGameTags">{getGameTags(game).join(", ")}</p>
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
          </div>
        </div>
      </section>
    </div>
  );
}
