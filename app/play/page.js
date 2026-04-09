import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import { createStudentQuestionAction, joinClassByCodeAction } from "./actions";

function gameHref(slug, courseId) {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  if (slug === "integer_practice") return `/play/integer-practice${query}`;
  if (slug === "money_counting") return `/play/money-counting${query}`;
  if (slug === "number_compare") return `/play/number-compare${query}`;
  if (slug === "skill_builder") return `/play/skill-builder${query}`;
  if (slug === "showdown_framework") return `/play/showdown-framework${query}`;
  if (slug === "review_games") return `/play/review-games${query}`;
  if (slug === "spiral_review") return `/play/spiral-review${query}`;
  if (slug === "question_kind_review") return `/play/question-kind-review${query}`;
  if (slug === "double_board_review") return `/play/double-board${query}`;
  if (slug === "telling_time") return `/play/telling-time${query}`;
  if (slug === "comet_typing") return `/play/comet-typing${query}`;
  return `/play/${slug}${query}`;
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

function formatStatNumber(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  if (Math.abs(parsed - Math.round(parsed)) < 0.05) return String(Math.round(parsed));
  return String(Math.round(parsed * 10) / 10);
}

function formatPercent(value) {
  const parsed = Number(value || 0);
  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return `${Math.round(normalized)}%`;
}

function formatAwardPoints(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return "No extra credit points";
  return "+" + Math.round(parsed) + " extra credit point" + (Math.round(parsed) === 1 ? "" : "s");
}

function formatAwardDate(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STUDENT_QUESTION_TYPE_OPTIONS = [
  { slug: "integer", label: "Integer Question" },
  { slug: "comparison", label: "Comparison Question" },
  { slug: "money", label: "Money Question" },
  { slug: "time", label: "Time Question" },
  { slug: "question_kind", label: "Question Type Challenge" },
];

function statRowsForGame(game, stats) {
  if (!stats) return [];

  if (game.slug === "2048") {
    return [
      ["Games Played", stats.sessions_played],
      ["High Score", stats.best_score],
      ["Average", formatStatNumber(stats.average_score)],
      ["Last 10 Avg", formatStatNumber(stats.last_10_average)],
    ];
  }

  if (game.slug === "connect4") {
    return [
      ["Games Played", stats.sessions_played],
      ["Win %", formatPercent(stats.average_score)],
      ["Last 10 Win %", formatPercent(stats.last_10_average)],
      ["Streak", stats.best_score],
    ];
  }

  return [
    ["Games Played", stats.sessions_played],
    ["Average", formatStatNumber(stats.average_score)],
    ["Last 10 Avg", formatStatNumber(stats.last_10_average)],
    ["Best", formatStatNumber(stats.best_score)],
  ];
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

  const accountType = await getAccountTypeForUser(supabase, user);

  const [courses, statsResult, awardsResult, studentQuestionsResult] = await Promise.all([
    listAccessibleCourses(supabase, user.id),
    supabase
      .from("game_player_global_stats")
      .select("game_slug, average_score, last_10_average, best_score, sessions_played")
      .eq("player_id", user.id),
    supabase
      .from("game_sessions")
      .select("course_id, score, result, metadata, created_at")
      .eq("player_id", user.id)
      .eq("game_slug", "teacher_awards")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("game_sessions")
      .select("course_id, metadata, created_at")
      .eq("player_id", user.id)
      .eq("game_slug", "student_created_questions")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const statsByGame = new Map((statsResult.data || []).map((row) => [row.game_slug, row]));
  const params = await searchParams;
  const joinedCourseId = typeof params?.course === "string" ? params.course : "";
  const joinedCourse = joinedCourseId ? courses.find((course) => course.id === joinedCourseId) : null;
  const activeCourse = joinedCourse || courses[0] || null;
  const games = await listGamesWithCourseSettings(supabase, activeCourse?.id || null, {
    viewerAccountType: accountType || "student",
  });
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const awards = (awardsResult.data || []).map((row) => ({
    ...row,
    courseTitle: courseById.get(row.course_id)?.title || "Your class",
    className: courseById.get(row.course_id)?.class_name || "",
    awardLabel: String(row.metadata?.awardLabel || row.result || "Teacher Award").trim() || "Teacher Award",
    note: String(row.metadata?.note || "").trim(),
    awardedByName: String(row.metadata?.awardedByName || "Teacher").trim() || "Teacher",
  }));
  const studentCreatedQuestions = (studentQuestionsResult.data || []).map((row) => ({
    ...row,
    courseTitle: courseById.get(row.course_id)?.title || "Your class",
    questionType: String(row.metadata?.questionType || "question").trim(),
    prompt: String(row.metadata?.prompt || "").trim(),
    correctAnswer: String(row.metadata?.correctAnswer || "").trim(),
    explanation: String(row.metadata?.explanation || "").trim(),
  }));
  const visibleGames = games.filter((game) => game.enabled);
  const spiralReviewGame = visibleGames.find((game) => game.slug === "spiral_review") || null;
  const questionKindReviewGame =
    visibleGames.find((game) => game.slug === "question_kind_review") || null;
  const doubleBoardReviewGame =
    visibleGames.find((game) => game.slug === "double_board_review") || null;
  const reviewGames = [spiralReviewGame, questionKindReviewGame, doubleBoardReviewGame].filter(Boolean);
  const arcadeGames = visibleGames
    .filter((game) => game.category === "arcade" || game.slug === "connect4")
    .sort((a, b) => a.name.localeCompare(b.name));
  const mathSkillsGames = visibleGames
    .filter(
      (game) =>
        game.category === "math_skills" &&
        game.slug !== "spiral_review" &&
        game.slug !== "question_kind_review" &&
        game.slug !== "double_board_review"
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
                      <Link className="btn" href={gameHref("2048", joinedCourse.id)}>Play 2048</Link>
                      <Link className="btn" href={gameHref("integer_practice", joinedCourse.id)}>Practice Integers</Link>
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
        <h2>Your Awards And Extra Credit</h2>
        {awards.length === 0 ? (
          <p>Your teacher awards and extra credit will show up here once they start handing them out.</p>
        ) : (
          <div className="list">
            {awards.map((award, index) => (
              <article
                key={(award.course_id || "course") + "-" + award.created_at + "-" + index}
                className="card"
                style={{ background: "#fff" }}
              >
                <strong>{award.awardLabel}</strong>
                <p>
                  {formatAwardPoints(award.score)} · {award.courseTitle}
                  {award.className ? ` · ${award.className}` : ""} · {formatAwardDate(award.created_at)}
                </p>
                <p style={{ marginTop: "0.35rem", opacity: 0.8 }}>Awarded by {award.awardedByName}</p>
                {award.note ? <p style={{ marginTop: "0.5rem" }}>{award.note}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <h2>Create A Math Question</h2>
        <p>
          Turn what you know into a performance task by writing your own question, answer, and short explanation for your class.
        </p>
        {params?.question_created === "1" ? (
          <p style={{ color: "#0a7a32", fontWeight: 700, marginTop: "0.75rem" }}>
            Your question was saved for this class.
          </p>
        ) : null}
        {params?.question_error === "missing" ? (
          <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
            Choose a class, question type, prompt, and correct answer before saving.
          </p>
        ) : null}
        {params?.question_error === "course" ? (
          <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
            That class could not be used for your question submission.
          </p>
        ) : null}
        {params?.question_error === "catalog" || params?.question_error === "save" ? (
          <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
            Your question could not be saved yet. Please try again.
          </p>
        ) : null}
        {courses.length === 0 ? (
          <p style={{ marginTop: "0.75rem" }}>
            Join a class first so your question can be attached to your teacher’s class.
          </p>
        ) : (
          <div className="featureGrid" style={{ marginTop: "1rem" }}>
            <form action={createStudentQuestionAction} className="card" style={{ background: "#fff" }}>
              <div className="stack">
                <label className="stack" style={{ gap: "0.35rem" }}>
                  <span>Class</span>
                  <select className="input" name="course_id" defaultValue={activeCourse?.id || courses[0]?.id || ""}>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                        {course.class_name ? ` · ${course.class_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack" style={{ gap: "0.35rem" }}>
                  <span>Question type</span>
                  <select className="input" name="question_type" defaultValue="integer">
                    {STUDENT_QUESTION_TYPE_OPTIONS.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack" style={{ gap: "0.35rem" }}>
                  <span>Your question prompt</span>
                  <textarea
                    className="input"
                    name="prompt"
                    rows={4}
                    placeholder="Example: What is -8 + 13?"
                  />
                </label>
                <label className="stack" style={{ gap: "0.35rem" }}>
                  <span>Correct answer</span>
                  <input className="input" name="correct_answer" placeholder="Example: 5" />
                </label>
                <label className="stack" style={{ gap: "0.35rem" }}>
                  <span>Short explanation (optional)</span>
                  <textarea
                    className="input"
                    name="explanation"
                    rows={3}
                    placeholder="Example: Starting at -8 and moving 13 to the right lands on 5."
                  />
                </label>
                <div className="ctaRow">
                  <button className="btn primary" type="submit">
                    Save Question
                  </button>
                </div>
              </div>
            </form>
            <article className="card" style={{ background: "#fff" }}>
              <h3>Your Recent Question Tasks</h3>
              {studentCreatedQuestions.length === 0 ? (
                <p style={{ marginTop: "0.75rem" }}>
                  Your saved question tasks will show up here after you submit one.
                </p>
              ) : (
                <div className="list" style={{ marginTop: "0.75rem" }}>
                  {studentCreatedQuestions.map((row, index) => (
                    <div
                      key={`${row.course_id || "course"}-${row.created_at}-${index}`}
                      className="card"
                      style={{ background: "#f9fbfc" }}
                    >
                      <strong>{row.courseTitle}</strong>
                      <p style={{ marginTop: "0.35rem" }}>
                        {row.questionType.replaceAll("_", " ")} · {formatAwardDate(row.created_at)}
                      </p>
                      <p style={{ marginTop: "0.5rem" }}>{row.prompt}</p>
                      <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>
                        Answer: {row.correctAnswer}
                      </p>
                      {row.explanation ? (
                        <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>{row.explanation}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        )}
      </section>
      {reviewGames.length > 0 ? (
        <section className="card">
          <h2>Review Games</h2>
          <p>
            Use these modes when you want mixed review, strategy reminders, and more of a checkpoint feeling than a single-skill drill.
          </p>
          <div className="ctaRow" style={{ marginTop: "0.9rem" }}>
            <Link className="btn primary" href={gameHref("review_games", activeCourse?.id || "")}>
              Open Review Hub
            </Link>
          </div>
          <div className="reviewGameFamilyGrid" style={{ marginTop: "1rem" }}>
            {reviewGames.map((game) => (
              <article key={game.slug} className="card arcadeGameCard" style={{ background: "#fff" }}>
                <h3>{game.name}</h3>
                <p>{game.description}</p>
                <p className="arcadeGameTags">#review, #mathskills</p>
                {statsByGame.get(game.slug) ? (
                  <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
                    {statRowsForGame(game, statsByGame.get(game.slug)).map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="ctaRow">
                  <Link className="btn" href={gameHref(game.slug, activeCourse?.id || "")}>
                    Open {game.name}
                  </Link>
                </div>
              </article>
            ))}
            <article className="card reviewFamilyComingSoon" style={{ background: "#f7fafc" }}>
              <h3>More Review Modes</h3>
              <p>Adaptive review paths, family-style review games, and future checkpoints will land here next.</p>
            </article>
          </div>
        </section>
      ) : null}
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
                        {statRowsForGame(game, stats).map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="ctaRow">
                      <Link className="btn primary" href={gameHref(game.slug, activeCourse?.id || "")}>
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
                        {statRowsForGame(game, stats).map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="ctaRow">
                      <Link className="btn primary" href={gameHref(game.slug, activeCourse?.id || "")}>
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
