import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";

const REVIEW_GAME_SLUGS = new Set([
  "spiral_review",
  "question_kind_review",
  "double_board_review",
  "lowest_number_wins",
  "open_middle",
]);

function reviewHref(slug, courseId) {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  if (slug === "spiral_review") return `/play/spiral-review${query}`;
  if (slug === "question_kind_review") return `/play/question-kind-review${query}`;
  if (slug === "double_board_review") return `/play/double-board${query}`;
  if (slug === "lowest_number_wins") return `/play/lowest-number-wins${query}`;
  if (slug === "open_middle") return `/play/open-middle${query}`;
  return `/play${query}`;
}

export default async function ReviewGamesPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/play/review-games");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id);
  const params = (await searchParams) || {};
  const requestedCourseId = typeof params.course === "string" ? params.course : "";
  const activeCourse = courses.find((course) => course.id === requestedCourseId) || courses[0] || null;
  const visibleGames = (await listGamesWithCourseSettings(supabase, activeCourse?.id || null, {
    viewerAccountType: accountType || "student",
  })).filter(
    (game) => game.enabled
  );
  const reviewGames = visibleGames.filter((game) => REVIEW_GAME_SLUGS.has(game.slug));

  return (
    <div className="stack">
      <section className="card">
        <h1>Review Games</h1>
        <p>
          Review modes help students recognize patterns, revisit older skills, and practice with more variety than a single-skill drill.
        </p>
        {activeCourse ? (
          <p style={{ marginTop: "0.75rem" }}>
            Current class context: <strong>{activeCourse.title}</strong>
            {activeCourse.class_name ? ` · ${activeCourse.class_name}` : ""}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Available Review Modes</h2>
        {reviewGames.length === 0 ? (
          <p>No review modes are enabled for this class yet.</p>
        ) : (
          <div className="reviewGameFamilyGrid" style={{ marginTop: "1rem" }}>
            {reviewGames.map((game) => (
              <article key={game.slug} className="card" style={{ background: "#fff" }}>
                <h3>{game.name}</h3>
                <p>{game.description}</p>
                <div className="ctaRow">
                  <Link className="btn primary" href={reviewHref(game.slug, activeCourse?.id || "")}>
                    Open {game.name}
                  </Link>
                </div>
              </article>
            ))}
            <article className="card reviewFamilyComingSoon" style={{ background: "#f7fafc" }}>
              <h3>Coming Soon</h3>
              <p>Family-style review games, adaptive review paths, and checkpoint events will plug into this hub next.</p>
            </article>
          </div>
        )}
      </section>
    </div>
  );
}
