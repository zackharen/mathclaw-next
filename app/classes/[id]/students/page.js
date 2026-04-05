import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { assignStudentAwardAction, regenerateStudentJoinCodeAction } from "@/app/classes/actions";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";

function formatGameLabel(slug) {
  return {
    "2048": "2048",
    connect4: "Connect4",
    integer_practice: "Adding & Subtracting Integers",
    money_counting: "Money Counting",
    minesweeper: "Minesweeper",
    number_compare: "Which Number Is Bigger?",
    skill_builder: "Skill Builder",
    spiral_review: "Spiral Review",
    question_kind_review: "What Kind Of Question Is This?",
    telling_time: "Telling Time",
    sudoku: "Sudoku",
    comet_typing: "Comet Typing",
    student_created_questions: "Student-Created Questions",
  }[slug] || slug;
}

function formatStatScope(scope) {
  return scope === "global_fallback" ? "Global stats until class-linked results are saved." : "";
}

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

const WORD_WALL_TERMS = [
  {
    key: "integer",
    label: "Integer",
    gameSlug: "integer_practice",
    description: "A whole number that can be positive, negative, or zero.",
  },
  {
    key: "absolute-value",
    label: "Absolute Value",
    gameSlug: "integer_practice",
    description: "How far a number is from zero on the number line.",
  },
  {
    key: "compare",
    label: "Compare",
    gameSlug: "number_compare",
    description: "Decide which value is greater, smaller, or the same.",
  },
  {
    key: "digit",
    label: "Digit",
    gameSlug: "sudoku",
    description: "One number symbol from 0 to 9 used to build a number.",
  },
  {
    key: "coin",
    label: "Coin",
    gameSlug: "money_counting",
    description: "A piece of money like a penny, nickel, dime, or quarter.",
  },
  {
    key: "value",
    label: "Value",
    gameSlug: "money_counting",
    description: "How much a number, coin, bill, or answer is worth.",
  },
  {
    key: "minute-hand",
    label: "Minute Hand",
    gameSlug: "telling_time",
    description: "The longer clock hand that shows how many minutes have passed.",
  },
  {
    key: "hour-hand",
    label: "Hour Hand",
    gameSlug: "telling_time",
    description: "The shorter clock hand that shows the hour.",
  },
  {
    key: "row",
    label: "Row",
    gameSlug: "sudoku",
    description: "A straight line of boxes that goes across from left to right.",
  },
  {
    key: "column",
    label: "Column",
    gameSlug: "sudoku",
    description: "A straight line of boxes that goes up and down.",
  },
  {
    key: "pattern",
    label: "Pattern",
    gameSlug: "spiral_review",
    description: "Something that repeats or follows a rule you can notice.",
  },
  {
    key: "strategy",
    label: "Strategy",
    gameSlug: "2048",
    description: "A plan you use to make strong moves and avoid mistakes.",
  },
  {
    key: "streak",
    label: "Streak",
    gameSlug: "comet_typing",
    description: "A run of correct answers or hits in a row.",
  },
  {
    key: "question-type",
    label: "Question Type",
    gameSlug: "question_kind_review",
    description: "The kind of thinking a problem is asking you to do.",
  },
  {
    key: "safe-square",
    label: "Safe Square",
    gameSlug: "minesweeper",
    description: "A square you can reveal without hitting a mine.",
  },
];

const TEACHER_AWARD_PRESETS = [
  "Weekly Star",
  "Most Improved",
  "Problem Solver",
  "Great Teammate",
  "Effort Award",
  "Extra Credit",
];

function formatQuestionTypeLabel(value) {
  return {
    integer: "Integer Question",
    comparison: "Comparison Question",
    money: "Money Question",
    time: "Time Question",
    question_kind: "Question Type Challenge",
  }[String(value || "").trim()] || "Student Question";
}

function formatAwardPoints(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return "No extra credit points";
  return "+" + Math.round(parsed) + " extra credit point" + (Math.round(parsed) === 1 ? "" : "s");
}

function formatAwardLabel(row) {
  return String(row?.metadata?.awardLabel || row?.result || "Teacher Award").trim() || "Teacher Award";
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

function getPlayerDisplayName(membership) {
  return membership?.display_name || `Student ${String(membership?.profile_id || "").slice(0, 8)}`;
}

function averageForPlayerRows(rows) {
  if (!rows || rows.length === 0) return 0;
  return (
    rows.reduce((sum, row) => sum + Number(row.average_score || 0), 0) /
    Math.max(rows.length, 1)
  );
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
  const awardAdded = resolvedSearchParams?.awardAdded === "1";
  const awardError = resolvedSearchParams?.awardError || "";
  const awardStudentId = typeof resolvedSearchParams?.studentId === "string" ? resolvedSearchParams.studentId : "";
  const admin = createAdminClient();

  const [
    courseGames,
    { data: membershipRows, error: membershipsError },
    { data: statsRows, error: statsError },
    { data: recentSessionRows, error: recentSessionsError },
    { data: awardRows, error: awardRowsError },
    { data: studentQuestionRows, error: studentQuestionRowsError },
  ] = await Promise.all([
    listGamesWithCourseSettings(supabase, course.id),
    supabase.rpc("list_course_students", { p_course_id: course.id }),
    supabase.rpc("list_course_student_stats", { p_course_id: course.id }),
    admin
      .from("game_sessions")
      .select("player_id, game_slug, score, created_at")
      .eq("course_id", course.id)
      .neq("game_slug", "teacher_awards")
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("game_sessions")
      .select("player_id, score, result, metadata, created_at")
      .eq("course_id", course.id)
      .eq("game_slug", "teacher_awards")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("game_sessions")
      .select("player_id, metadata, created_at")
      .eq("course_id", course.id)
      .eq("game_slug", "student_created_questions")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const safeMemberships = membershipsError ? [] : membershipRows || [];
  const safeStats = statsError ? [] : statsRows || [];
  const safeRecentSessions = recentSessionsError ? [] : recentSessionRows || [];
  const safeAwards = awardRowsError ? [] : awardRows || [];
  const safeStudentQuestions = studentQuestionRowsError ? [] : studentQuestionRows || [];
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

  const awardsByPlayer = new Map();
  for (const row of safeAwards) {
    const arr = awardsByPlayer.get(row.player_id) || [];
    arr.push(row);
    awardsByPlayer.set(row.player_id, arr);
  }

  const recentAwards = safeAwards.slice(0, 8).map((row) => ({
    ...row,
    displayName: resolveActivityDisplayName(row.player_id),
  }));
  const studentQuestionsByPlayer = new Map();
  for (const row of safeStudentQuestions) {
    const arr = studentQuestionsByPlayer.get(row.player_id) || [];
    arr.push(row);
    studentQuestionsByPlayer.set(row.player_id, arr);
  }
  const recentStudentQuestions = safeStudentQuestions.slice(0, 8).map((row) => ({
    ...row,
    displayName: resolveActivityDisplayName(row.player_id),
  }));

  const recentActivity = safeRecentSessions.slice(0, 8).map((row) => {
    return {
      ...row,
      displayName: resolveActivityDisplayName(row.player_id),
    };
  });

  const enabledGameSlugs = new Set(
    (courseGames || []).filter((game) => game.enabled).map((game) => game.slug)
  );
  const playedGameSlugs = new Set(safeStats.map((row) => row.game_slug).filter(Boolean));
  const relevantGameSlugs = new Set([...enabledGameSlugs, ...playedGameSlugs]);
  const wordWallTerms = WORD_WALL_TERMS.filter((term) => relevantGameSlugs.has(term.gameSlug)).slice(0, 12);
  const fallbackWordWallTerms = WORD_WALL_TERMS.filter(
    (term) =>
      term.gameSlug === "integer_practice" ||
      term.gameSlug === "number_compare" ||
      term.gameSlug === "telling_time" ||
      term.gameSlug === "money_counting"
  ).slice(0, 8);
  const displayedWordWallTerms = wordWallTerms.length > 0 ? wordWallTerms : fallbackWordWallTerms;

  const playerCards = safeMemberships.map((membership) => {
    const playerStats = statsByPlayer.get(membership.profile_id) || [];
    const playerAwards = awardsByPlayer.get(membership.profile_id) || [];
    const playerCreatedQuestions = studentQuestionsByPlayer.get(membership.profile_id) || [];
    const totalSessions = playerStats.reduce(
      (sum, row) => sum + Number(row.sessions_played || 0),
      0
    );
    const strongestGame =
      [...playerStats].sort((a, b) => Number(b.average_score || 0) - Number(a.average_score || 0))[0] ||
      null;
    const recentPlayerSession = safeRecentSessions.find((row) => row.player_id === membership.profile_id);
    const lastSevenDaysSessions = safeRecentSessions.filter((row) => {
      if (row.player_id !== membership.profile_id || !row.created_at) return false;
      return Date.now() - new Date(row.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    return {
      membership,
      playerStats,
      playerAwards,
      playerCreatedQuestions,
      totalSessions,
      strongestGame,
      recentPlayerSession,
      averageScore: averageForPlayerRows(playerStats),
      awardCount: playerAwards.length,
      questionCount: playerCreatedQuestions.length,
      lastSevenDaysSessions,
    };
  });

  const mostActiveStudent =
    [...playerCards].sort((a, b) => b.totalSessions - a.totalSessions)[0] || null;
  const classAverageLeader =
    [...playerCards].filter((card) => card.playerStats.length > 0).sort((a, b) => b.averageScore - a.averageScore)[0] ||
    null;
  const awardLeader =
    [...playerCards].filter((card) => card.awardCount > 0).sort((a, b) => b.awardCount - a.awardCount)[0] ||
    null;
  const momentumLeader =
    [...playerCards].filter((card) => card.lastSevenDaysSessions > 0).sort((a, b) => b.lastSevenDaysSessions - a.lastSevenDaysSessions)[0] ||
    null;
  const gameWallCards = [...gameSummary.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 4)
    .map((row) => ({
      ...row,
      averageScore: row.players > 0 ? row.totalAverage / row.players : 0,
    }));

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Student Progress</h1>
        {joinCodeUpdated ? <p style={{ color: "#0a7a32", fontWeight: 700 }}>Join code updated.</p> : null}
        {awardAdded ? (
          <p style={{ color: "#0a7a32", fontWeight: 700 }}>
            Award saved{awardStudentId ? ' for ' + (membershipByPlayer.get(awardStudentId)?.display_name || 'that student') : ''}.
          </p>
        ) : null}
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
        {awardError === "missing-data" ? <p style={{ color: "#cd3b3b", fontWeight: 700 }}>Choose a student and an award title before saving.</p> : null}
        {awardError === "student-not-found" ? <p style={{ color: "#cd3b3b", fontWeight: 700 }}>That student is not currently joined to this class.</p> : null}
        {awardError === "catalog-failed" ? <p style={{ color: "#cd3b3b", fontWeight: 700 }}>Could not prepare the awards system yet. Please try again.</p> : null}
        {awardError === "save-failed" ? <p style={{ color: "#cd3b3b", fontWeight: 700 }}>Could not save that award yet. Please try again.</p> : null}
        {awardError === "course-not-found" ? <p style={{ color: "#cd3b3b", fontWeight: 700 }}>That class could not be found for awards.</p> : null}
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
        <h2>Data Wall</h2>
        <p>
          A quick teacher view of who is active, who is building momentum, and which games are driving the most class practice.
        </p>
        <div className="adminSummaryGrid" style={{ marginTop: "1rem" }}>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Most Active Student</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {mostActiveStudent ? getPlayerDisplayName(mostActiveStudent.membership) : "No data yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {mostActiveStudent ? `${mostActiveStudent.totalSessions} saved sessions` : "Students have not saved enough games yet."}
            </p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Top Average Across Games</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {classAverageLeader ? getPlayerDisplayName(classAverageLeader.membership) : "No data yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {classAverageLeader ? formatScore(classAverageLeader.averageScore) : "No cross-game averages yet."}
            </p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Weekly Award Leader</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {awardLeader ? getPlayerDisplayName(awardLeader.membership) : "No awards yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {awardLeader ? `${awardLeader.awardCount} awards saved` : "Start using weekly awards to highlight progress."}
            </p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Recent Momentum</h3>
            <p style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {momentumLeader ? getPlayerDisplayName(momentumLeader.membership) : "No recent streak yet"}
            </p>
            <p style={{ marginTop: "0.35rem" }}>
              {momentumLeader ? `${momentumLeader.lastSevenDaysSessions} saved sessions in the last 7 days` : "No saved sessions in the last week yet."}
            </p>
          </div>
        </div>
        <div className="dataWallGrid" style={{ marginTop: "1rem" }}>
          <div className="card" style={{ background: "#fff" }}>
            <h3>Most Used Games</h3>
            {gameWallCards.length === 0 ? (
              <p>No game trends yet.</p>
            ) : (
              <div className="list" style={{ marginTop: "0.75rem" }}>
                {gameWallCards.map((row) => (
                  <div key={row.gameSlug} className="dataWallRow">
                    <div>
                      <strong>{formatGameLabel(row.gameSlug)}</strong>
                      <p>{row.players} students tracked</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong>{row.sessions} sessions</strong>
                      <p>Avg {formatScore(row.averageScore)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ background: "#fff" }}>
            <h3>Class Momentum Notes</h3>
            <div className="list" style={{ marginTop: "0.75rem" }}>
              <div className="dataWallNote">
                <strong>Participation</strong>
                <p>{formatPercent(safeMemberships.length > 0 ? (activeStudents / safeMemberships.length) * 100 : 0)} of joined students have saved at least one game.</p>
              </div>
              <div className="dataWallNote">
                <strong>Recognition</strong>
                <p>{safeAwards.length} total award entries have been saved for this class.</p>
              </div>
              <div className="dataWallNote">
                <strong>Favorite Skill Area</strong>
                <p>{topGame ? formatGameLabel(topGame.gameSlug) : "No favorite yet"} is leading the class right now.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Word Wall</h2>
        <p>
          A reusable class vocabulary board pulled from the games and review modes students are actually seeing in this class.
        </p>
        <div className="wordWallGrid" style={{ marginTop: "1rem" }}>
          {displayedWordWallTerms.map((term) => (
            <article key={term.key} className="card wordWallCard" style={{ background: "#fff" }}>
              <span className="pill">{formatGameLabel(term.gameSlug)}</span>
              <h3>{term.label}</h3>
              <p>{term.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Weekly Awards And Extra Credit</h2>
        {awardRowsError ? <p>Award history could not load yet.</p> : null}
        {!awardRowsError && recentAwards.length === 0 ? <p>No awards saved yet.</p> : null}
        {!awardRowsError && recentAwards.length > 0 ? (
          <div className="list">
            {recentAwards.map((row, index) => (
              <div key={String(row.player_id) + '-award-' + String(row.created_at) + '-' + String(index)} className="card" style={{ background: "#fff" }}>
                <strong>{row.displayName}</strong>
                <p>
                  {formatAwardLabel(row)} · {formatAwardPoints(row.score)} · {formatDateTime(row.created_at, displayTimeZone)}
                </p>
                {row.metadata?.note ? <p style={{ marginTop: "0.35rem" }}>{row.metadata.note}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Student-Created Questions</h2>
        {studentQuestionRowsError ? <p>Student question submissions could not load yet.</p> : null}
        {!studentQuestionRowsError && recentStudentQuestions.length === 0 ? (
          <p>No student-created question tasks saved yet.</p>
        ) : null}
        {!studentQuestionRowsError && recentStudentQuestions.length > 0 ? (
          <div className="list">
            {recentStudentQuestions.map((row, index) => (
              <div
                key={`${row.player_id}-question-${row.created_at}-${index}`}
                className="card"
                style={{ background: "#fff" }}
              >
                <strong>{row.displayName}</strong>
                <p>
                  {formatQuestionTypeLabel(row.metadata?.questionType)} · {formatDateTime(row.created_at, displayTimeZone)}
                </p>
                {row.metadata?.prompt ? <p style={{ marginTop: "0.5rem" }}>{row.metadata.prompt}</p> : null}
                {row.metadata?.correctAnswer ? (
                  <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>
                    Answer: {row.metadata.correctAnswer}
                  </p>
                ) : null}
                {row.metadata?.explanation ? (
                  <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>{row.metadata.explanation}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
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
            {playerCards.map(({ membership, playerStats, playerAwards, playerCreatedQuestions, totalSessions, strongestGame, recentPlayerSession, questionCount }) => {
              return (
                <article key={membership.profile_id} className="card" style={{ background: "#fff" }}>
                  <h3>{getPlayerDisplayName(membership)}</h3>
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
                    <span className="pill">Created Questions: {questionCount}</span>
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
                  <div className="card" style={{ background: "#f9fbfc", marginTop: "0.9rem" }}>
                    <h4>Assign Weekly Award</h4>
                    <form action={assignStudentAwardAction} className="stack" style={{ marginTop: "0.75rem" }}>
                      <input type="hidden" name="course_id" value={course.id} />
                      <input type="hidden" name="student_id" value={membership.profile_id} />
                      <input type="hidden" name="return_to" value="students" />
                      <label className="stack" style={{ gap: "0.35rem" }}>
                        <span>Award title</span>
                        <select className="input" name="award_label" defaultValue="Weekly Star">
                          {TEACHER_AWARD_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="stack" style={{ gap: "0.35rem" }}>
                        <span>Custom title (optional)</span>
                        <input className="input" name="custom_award_label" placeholder="Example: Fraction Hero" />
                      </label>
                      <label className="stack" style={{ gap: "0.35rem" }}>
                        <span>Extra credit points</span>
                        <input className="input" type="number" name="points" min="0" max="100" defaultValue="0" />
                      </label>
                      <label className="stack" style={{ gap: "0.35rem" }}>
                        <span>Note (optional)</span>
                        <textarea
                          className="input"
                          name="note"
                          rows={3}
                          placeholder="Add a short reason the student earned it."
                        />
                      </label>
                      <div className="ctaRow">
                        <button className="btn primary" type="submit">
                          Save Award
                        </button>
                      </div>
                    </form>
                    {playerAwards.length > 0 ? (
                      <div className="list" style={{ marginTop: "0.9rem" }}>
                        {playerAwards.slice(0, 4).map((row, index) => (
                          <div
                            key={membership.profile_id + "-award-history-" + row.created_at + "-" + index}
                            className="card"
                            style={{ background: "#fff" }}
                          >
                            <strong>{formatAwardLabel(row)}</strong>
                            <p>
                              {formatAwardPoints(row.score)} · {formatDateTime(row.created_at, displayTimeZone)}
                            </p>
                            {row.metadata?.note ? (
                              <p style={{ marginTop: "0.35rem" }}>{row.metadata.note}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ marginTop: "0.75rem" }}>No awards saved for this student yet.</p>
                    )}
                  </div>
                  <div className="card" style={{ background: "#f9fbfc", marginTop: "0.9rem" }}>
                    <h4>Student-Created Question Tasks</h4>
                    {playerCreatedQuestions.length > 0 ? (
                      <div className="list" style={{ marginTop: "0.75rem" }}>
                        {playerCreatedQuestions.slice(0, 3).map((row, index) => (
                          <div
                            key={`${membership.profile_id}-created-question-${row.created_at}-${index}`}
                            className="card"
                            style={{ background: "#fff" }}
                          >
                            <strong>{formatQuestionTypeLabel(row.metadata?.questionType)}</strong>
                            <p style={{ marginTop: "0.35rem" }}>
                              {formatDateTime(row.created_at, displayTimeZone)}
                            </p>
                            {row.metadata?.prompt ? <p style={{ marginTop: "0.5rem" }}>{row.metadata.prompt}</p> : null}
                            {row.metadata?.correctAnswer ? (
                              <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>
                                Answer: {row.metadata.correctAnswer}
                              </p>
                            ) : null}
                            {row.metadata?.explanation ? (
                              <p style={{ marginTop: "0.35rem", opacity: 0.85 }}>{row.metadata.explanation}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ marginTop: "0.75rem" }}>No student-created question tasks saved for this student yet.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
