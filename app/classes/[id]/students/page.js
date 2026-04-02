import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { regenerateStudentJoinCodeAction } from "@/app/classes/actions";

function formatGameLabel(slug) {
  return {
    "2048": "2048",
    connect4: "Connect4",
    integer_practice: "Adding & Subtracting Integers",
    number_compare: "Which Number Is Bigger?",
  }[slug] || slug;
}

function formatStatScope(scope) {
  return scope === "global_fallback" ? "Global stats until class-linked results are saved." : "";
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatDateTime(value, timeZone) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString("en-US", {
    timeZone,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
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

  let courseError = null;
  let course = null;
  try {
    const access = await getCourseAccessForUser(
      supabase,
      user.id,
      id,
      "id, title, class_name, student_join_code, owner_id"
    );
    course = access?.course || null;
  } catch (error) {
    courseError = error;
  }

  if (courseError || !course) {
    redirect("/classes");
  }

  const { data: teacherProfile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const displayTimeZone = teacherProfile?.timezone || "America/New_York";

  const resolvedSearchParams = await searchParams;
  const joinCodeUpdated = resolvedSearchParams?.joinCodeUpdated === "1";
  const joinCodeError = resolvedSearchParams?.joinCodeError || "";
  const admin = createAdminClient();

  const [
    { data: membershipRows, error: membershipsError },
    { data: statsRows, error: statsError },
    { data: recentSessionRows, error: recentSessionsError },
  ] = await Promise.all([
    supabase.rpc("list_course_students", { p_course_id: course.id }),
    supabase.rpc("list_course_student_stats", { p_course_id: course.id }),
    admin
      .from("game_sessions")
      .select("player_id, game_slug, score, created_at")
      .eq("course_id", course.id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const safeMemberships = membershipsError ? [] : membershipRows || [];
  const safeStats = statsError ? [] : statsRows || [];
  const safeRecentSessions = recentSessionsError ? [] : recentSessionRows || [];
  const recentPlayerIds = [
    ...new Set(
      safeRecentSessions
        .map((row) => row.player_id)
        .filter(Boolean)
    ),
  ];

  let recentPlayerProfiles = [];
  if (recentPlayerIds.length > 0) {
    const { data: recentProfiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", recentPlayerIds);
    recentPlayerProfiles = recentProfiles || [];
  }

  const statsByPlayer = new Map();
  for (const row of safeStats) {
    const arr = statsByPlayer.get(row.player_id) || [];
    arr.push(row);
    statsByPlayer.set(row.player_id, arr);
  }

  const membershipByPlayer = new Map(
    safeMemberships.map((membership) => [membership.profile_id, membership])
  );
  const recentProfileByPlayer = new Map(
    recentPlayerProfiles.map((profile) => [profile.id, profile])
  );

  function resolveActivityDisplayName(playerId) {
    const membership = membershipByPlayer.get(playerId);
    const profile = recentProfileByPlayer.get(playerId);
    const baseName =
      membership?.display_name ||
      profile?.display_name ||
      `Student ${playerId.slice(0, 8)}`;

    if (playerId === course.owner_id) {
      return `${baseName} - Teacher`;
    }

    return baseName;
  }

  const gameSummary = new Map();
  for (const row of safeStats) {
    const summary = gameSummary.get(row.game_slug) || {
      gameSlug: row.game_slug,
      players: 0,
      sessions: 0,
      totalAverage: 0,
    };
    summary.players += 1;
    summary.sessions += Number(row.sessions_played || 0);
    summary.totalAverage += Number(row.average_score || 0);
    gameSummary.set(row.game_slug, summary);
  }

  const topGame = [...gameSummary.values()].sort((a, b) => b.sessions - a.sessions)[0] || null;
  const mostRecentSession = safeRecentSessions[0] || null;
  const activeStudents = safeMemberships.filter((membership) => {
    const rows = statsByPlayer.get(membership.profile_id) || [];
    return rows.length > 0;
  }).length;
  const totalTrackedSessions = safeStats.reduce(
    (sum, row) => sum + Number(row.sessions_played || 0),
    0
  );

  const recentActivity = safeRecentSessions.slice(0, 8).map((row) => {
    return {
      ...row,
      displayName: resolveActivityDisplayName(row.player_id),
    };
  });

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Student Progress</h1>
        {joinCodeUpdated ? <p style={{ color: "#0a7a32", fontWeight: 700 }}>Join code updated.</p> : null}
        {joinCodeError === "missing-column" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>
            Join codes are not enabled in Supabase yet. Run the student-games SQL migration, then try again.
          </p>
        ) : null}
        {joinCodeError === "course-not-found" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>That class could not be found for join-code updates.</p>
        ) : null}
        {joinCodeError === "save-failed" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>Could not save a new join code yet. Please try again.</p>
        ) : null}
        {joinCodeError === "duplicate-retry-failed" ? (
          <p style={{ color: "#cd3b3b", fontWeight: 700 }}>
            Could not find a unique join code after several tries. Please try again.
          </p>
        ) : null}
        {joinCodeError &&
        !["missing-column", "course-not-found", "save-failed", "duplicate-retry-failed"].includes(
          joinCodeError
        ) ? (
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
                <input type="hidden" name="return_to" value="students" />
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
        <h2>Class Snapshot</h2>
        <div className="adminSummaryGrid">
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Joined Students</h3>
            <p className="adminStat">{safeMemberships.length}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Active Players</h3>
            <p className="adminStat">{activeStudents}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Total Sessions</h3>
            <p className="adminStat">{totalTrackedSessions}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Most Played Game</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {topGame ? formatGameLabel(topGame.gameSlug) : "No data yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {topGame ? `${topGame.sessions} tracked sessions` : "Students have not saved games yet."}
            </p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Latest Activity</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {mostRecentSession ? resolveActivityDisplayName(mostRecentSession.player_id) : "No activity yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {mostRecentSession
                ? `${formatGameLabel(mostRecentSession.game_slug)} · ${formatDateTime(mostRecentSession.created_at, displayTimeZone)}`
                : "No saved sessions yet."}
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Recent Activity</h2>
        {recentSessionsError ? <p>Recent activity could not load yet.</p> : null}
        {!recentSessionsError && recentActivity.length === 0 ? <p>No saved activity yet.</p> : null}
        {!recentSessionsError && recentActivity.length > 0 ? (
          <div className="list">
            {recentActivity.map((row, index) => (
              <div key={`${row.player_id}-${row.game_slug}-${row.created_at}-${index}`} className="card" style={{ background: "#fff" }}>
                <strong>{row.displayName}</strong>
                <p>
                  {formatGameLabel(row.game_slug)} · Score {formatScore(row.score)} · {formatDateTime(row.created_at, displayTimeZone)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
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
              const totalSessions = playerStats.reduce(
                (sum, row) => sum + Number(row.sessions_played || 0),
                0
              );
              const strongestGame =
                [...playerStats].sort((a, b) => Number(b.average_score || 0) - Number(a.average_score || 0))[0] ||
                null;
              const recentPlayerSession = safeRecentSessions.find(
                (row) => row.player_id === membership.profile_id
              );
              return (
                <article key={membership.profile_id} className="card" style={{ background: "#fff" }}>
                  <h3>{membership.display_name || `Student ${membership.profile_id.slice(0, 8)}`}</h3>
                  <p>
                    Joined {new Date(membership.joined_at).toLocaleDateString()}
                    {membership.school_name ? ` · ${membership.school_name}` : ""}
                  </p>
                  <div className="pillRow" style={{ marginTop: "0.75rem" }}>
                    <span className="pill">Games Tracked: {playerStats.length}</span>
                    <span className="pill">Sessions: {totalSessions}</span>
                    <span className="pill">
                      Latest Save: {recentPlayerSession ? formatDateTime(recentPlayerSession.created_at, displayTimeZone) : "None yet"}
                    </span>
                    <span className="pill">
                      Strongest Game: {strongestGame ? formatGameLabel(strongestGame.game_slug) : "No data yet"}
                    </span>
                  </div>
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
                            Sessions: {row.sessions_played} · Avg: {formatScore(row.average_score)}
                            {" · "}Last 10: {formatScore(row.last_10_average)}
                            {" · "}Best: {row.best_score}
                          </p>
                          {row.stat_scope === "global_fallback" ? (
                            <p style={{ marginTop: "0.35rem", opacity: 0.75 }}>
                              {formatStatScope(row.stat_scope)}
                            </p>
                          ) : null}
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
