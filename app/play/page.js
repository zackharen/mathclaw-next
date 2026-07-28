import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountTypeForUser,
  getPublicDisplayName,
  isStudentAccountType,
} from "@/lib/auth/account-type";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import { createStudentQuestionAction, joinClassByCodeAction } from "./actions";
import { getSiteCopy } from "@/lib/site-config";
import ArcadeLibrary from "./arcade-library";

const REVIEW_GAME_SLUGS = new Set([
  "spiral_review",
  "question_kind_review",
  "double_board_review",
  "lowest_number_wins",
  "open_middle",
]);

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
  if (slug === "lowest_number_wins") return `/play/lowest-number-wins${query}`;
  if (slug === "open_middle") return `/play/open-middle${query}`;
  if (slug === "telling_time") return `/play/telling-time${query}`;
  if (slug === "locker_practice") return `/play/locker-practice${query}`;
  if (slug === "slope_intercept") return `/play/slope-intercept${query}`;
  if (slug === "comet_typing") return `/play/comet-typing${query}`;
  return `/play/${slug}${query}`;
}

function tournamentHref(courseId) {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  return `/play/tournaments${query}`;
}

function describeCourseRelationship(relationship) {
  if (relationship === "owner") return "Teacher account";
  if (relationship === "co_teacher") return "Co-teacher access";
  return "Joined as student";
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

function ArcadeDisclosure({ title, description, open = false, children }) {
  return (
    <section className="card">
      <details className="arcadeSectionDetails" open={open}>
        <summary className="arcadeSectionSummary">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <span className="arcadeSectionToggle">
            <span className="showLabel">Show</span>
            <span className="hideLabel">Hide</span>
          </span>
        </summary>
        <div className="arcadeSectionBody">{children}</div>
      </details>
    </section>
  );
}

export default async function PlayPage({ searchParams }) {
  const siteCopy = await getSiteCopy();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/play");
  }

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError &&
    typeof profileError.message === "string" &&
    profileError.message.includes("nickname")
  ) {
    const retry = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", user.id)
      .maybeSingle();
    profile = retry.data;
    profileError = retry.error;
  }

  if (!profile) {
    redirect("/onboarding/profile");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const isStudent = isStudentAccountType(accountType);

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
  const hasJoinFeedback =
    params?.join_error === "missing" ||
    params?.join_error === "not_found" ||
    params?.join_error === "server" ||
    params?.join_success === "1" ||
    typeof params?.game_disabled === "string";
  const hasQuestionFeedback =
    params?.question_created === "1" ||
    params?.question_error === "missing" ||
    params?.question_error === "course" ||
    params?.question_error === "catalog" ||
    params?.question_error === "save";
  const joinedCourseId = typeof params?.course === "string" ? params.course : "";
  const joinedCourse = joinedCourseId ? courses.find((course) => course.id === joinedCourseId) : null;
  const activeCourse = joinedCourse || courses[0] || null;
  const publicName = getPublicDisplayName(profile, profile?.display_name || "Student");
  const shouldOpenClasses = hasJoinFeedback || (isStudent && courses.length === 0);
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
  const reviewGames = visibleGames.filter((game) => REVIEW_GAME_SLUGS.has(game.slug));
  const arcadeGames = visibleGames
    .filter((game) => game.category === "arcade" || game.slug === "connect4")
    .sort((a, b) => a.name.localeCompare(b.name));
  const mathSkillsGames = visibleGames
    .filter(
      (game) =>
        game.category === "math_skills" &&
        !REVIEW_GAME_SLUGS.has(game.slug)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const survivalSkillsGames = visibleGames
    .filter((game) => game.category === "survival_skills")
    .sort((a, b) => a.name.localeCompare(b.name));
  const libraryGames = [
    ...reviewGames.map((game) => ({ ...game, libraryCategory: "group" })),
    ...arcadeGames.map((game) => ({ ...game, libraryCategory: "arcade" })),
    ...mathSkillsGames.map((game) => ({ ...game, libraryCategory: "math_skills" })),
    ...survivalSkillsGames.map((game) => ({ ...game, libraryCategory: "survival_skills" })),
  ].map((game) => {
    const stats = statsByGame.get(game.slug);
    return {
      slug: game.slug,
      name: game.name,
      description: game.description,
      category: game.libraryCategory,
      isMultiplayer: Boolean(game.is_multiplayer),
      href: gameHref(game.slug, activeCourse?.id || ""),
      stats: stats
        ? {
            sessionsPlayed: Number(stats.sessions_played || 0),
            averageScore: Number(stats.average_score || 0),
            last10Average: Number(stats.last_10_average || 0),
            bestScore: Number(stats.best_score || 0),
          }
        : null,
    };
  });

  return (
    <div className="stack">
      <section className="card">
        <h1>{isStudent ? siteCopy.arcadeStudentTitle : siteCopy.arcadeTeacherTitle}</h1>
        <p>
          {`Welcome, ${publicName}. ${isStudent ? siteCopy.arcadeStudentDescription : siteCopy.arcadeTeacherDescription}`}
        </p>
      </section>

      <div>
      <ArcadeDisclosure
        title={siteCopy.arcadeClassesTitle}
        description={siteCopy.arcadeClassesDescription}
        open={shouldOpenClasses}
      >
            <div className="featureGrid arcadeClassesGrid">
              <form action={joinClassByCodeAction} className="card studentClassCodeCard" style={{ background: "#fff" }}>
                <h2>{isStudent && courses.length === 0 ? "Ask Your Teacher For Your Class Code" : "Join A Math Class"}</h2>
                <p>
                  {isStudent && courses.length === 0
                    ? "You are not connected to a class yet. Enter your teacher's code here so MathClaw can show the right class games and assignments."
                    : "Paste a teacher code any time you want to connect this account to a class."}
                </p>
                <div className="ctaRow">
                  <input
                    className="input"
                    style={{ maxWidth: "16rem", textTransform: "uppercase", letterSpacing: "0.08em" }}
                    name="join_code"
                    placeholder="Ask your teacher for this code"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <SubmitButton className="btn primary" pendingLabel="Joining Class…">
                    Join Class
                  </SubmitButton>
                </div>
                <p style={{ marginTop: "0.75rem", opacity: 0.8 }}>
                  Codes are not case-sensitive. You can paste them in exactly as your teacher shares them.
                </p>
                {params?.join_error === "missing" ? (
                  <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>Please enter a class code.</p>
                ) : null}
                {params?.join_error === "not_found" ? (
                  <p style={{ color: "var(--red)", marginTop: "0.75rem" }}>
                    That class code was not found. Double-check the letters and numbers with your teacher.
                  </p>
                ) : null}
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
                      <Link className="btn" href={gameHref("2048", joinedCourse.id)}>
                        Play 2048
                      </Link>
                      <Link className="btn" href={gameHref("integer_practice", joinedCourse.id)}>
                        Practice Integers
                      </Link>
                    </div>
                  </div>
                ) : null}
              </form>

              <article className="card" style={{ background: "#fff" }}>
                <h2>Your Math Classes</h2>
                {courses.length === 0 ? (
                  <p>No joined classes yet. That’s okay. Add a class code any time and it’ll show up here.</p>
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
      </ArcadeDisclosure>

      <ArcadeLibrary
        games={libraryGames}
        tournamentHref={tournamentHref(activeCourse?.id || "")}
        emptyMessage={
          activeCourse && visibleGames.length === 0
            ? "No games are enabled for this class yet."
            : "Try another search or category."
        }
      />
      <ArcadeDisclosure
        title={siteCopy.arcadeAwardsTitle}
        description={siteCopy.arcadeAwardsDescription}
        open={awards.length > 0}
      >
        {awards.length === 0 ? (
          <p>No awards or extra credit yet.</p>
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
      </ArcadeDisclosure>
      <ArcadeDisclosure
        title={siteCopy.arcadeCreateQuestionTitle}
        description={siteCopy.arcadeCreateQuestionDescription}
        open={hasQuestionFeedback}
      >
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
                  <SubmitButton className="btn primary" pendingLabel="Saving Question…">
                    Save Question
                  </SubmitButton>
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
      </ArcadeDisclosure>
      </div>
    </div>
  );
}
