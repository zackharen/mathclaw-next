import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { listCourseGameSettingsMap, listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  addCoTeacherAction,
  deleteClassAction,
  regenerateStudentJoinCodeAction,
  removeCoTeacherAction,
  updateCourseGameSettingAction,
} from "./actions";

function getBestDisplayName(profile, metadata, email, fallback = "-") {
  return (
    profile?.display_name ||
    metadata?.display_name ||
    metadata?.full_name ||
    metadata?.name ||
    (email ? String(email).split("@")[0] : "") ||
    fallback
  );
}

function formatJoinCodeNotice(status) {
  if (status === "1") return "Class join code updated.";
  if (status === "course-not-found") return "That class could not be found for join-code updates.";
  if (status === "missing-column")
    return "Join codes are not enabled in Supabase yet. Run the student-games SQL migration, then try again.";
  if (status === "save-failed") return "Could not save a new class join code. Please try again.";
  if (status === "duplicate-retry-failed")
    return "Could not find a unique class join code after several tries. Please try again.";
  return "";
}

function formatCoTeacherNotice(status) {
  if (status === "added") return "Co-teacher added.";
  if (status === "removed") return "Co-teacher removed.";
  if (status === "missing-data") return "Choose a class and teacher before updating co-teachers.";
  if (status === "course-not-found") return "That class could not be found for co-teacher updates.";
  if (status === "cannot-add-yourself") return "You are already the owner of this class.";
  if (status === "lookup-failed") return "Could not look up that teacher account right now.";
  if (status === "user-not-found") return "That teacher account could not be found.";
  if (status === "students-cannot-be-co-teachers") return "Student accounts cannot be added as co-teachers.";
  if (status === "save-failed") return "Could not add that co-teacher. Please try again.";
  if (status === "remove-failed") return "Could not remove that co-teacher. Please try again.";
  if (status === "cannot-remove-owner") return "The class owner cannot be removed from the class.";
  return "";
}

function formatGameControlNotice(status, gameSlug) {
  const gameLabel = gameSlug
    ? {
        "2048": "2048",
        connect4: "Connect4",
        integer_practice: "Adding & Subtracting Integers",
        money_counting: "Money Counting",
        minesweeper: "Minesweeper",
        number_compare: "Which Number Is Bigger?",
        spiral_review: "Spiral Review",
        telling_time: "Telling Time",
        sudoku: "Sudoku",
        comet_typing: "Comet Typing",
      }[gameSlug] || gameSlug
    : "that game";

  if (status === "enabled") return `${gameLabel} is now enabled for this class.`;
  if (status === "disabled") return `${gameLabel} is now hidden for this class.`;
  if (status === "missing-data") return "Missing class or game information for that update.";
  if (status === "course-not-found") return "That class could not be found for game-control updates.";
  if (status === "unknown-game") return "That game could not be found.";
  if (status === "save-failed") return `Could not update ${gameLabel} for this class. Please try again.`;
  return "";
}

function getGameSupportCopy(game) {
  if (game.slug === "connect4") return "Students can open multiplayer matches from the Student Arcade.";
  if (game.slug === "2048") return "Students can practice solo strategy and build high scores.";
  if (game.slug === "integer_practice") return "Students practice integer addition and subtraction with quick rounds.";
  if (game.slug === "money_counting") return "Students count money and build target amounts with coins and dollars.";
  if (game.slug === "minesweeper") return "Students clear safe squares, flag mines, and race the clock.";
  if (game.slug === "number_compare") return "Students compare values quickly and build number sense.";
  if (game.slug === "spiral_review") return "Students cycle through mixed review questions pulled from multiple skill types.";
  if (game.slug === "telling_time") return "Students read clocks and set times to the nearest five minutes.";
  if (game.slug === "sudoku") return "Students fill the grid by keeping every row, column, and 3x3 box valid.";
  if (game.slug === "comet_typing") return "Students guide Nova the courier by typing words accurately and building streaks.";
  return game.description || "Students can launch this game from the Student Arcade when it is enabled.";
}

export default async function ClassesPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (accountType === "student") {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding/profile");
  }

  let error = null;
  let courses = [];
  let games = [];
  let coTeacherState = {
    byCourseId: new Map(),
    candidateOptionsByCourseId: new Map(),
  };
  let gameSettingsByKey = new Map();
  try {
    [courses, games] = await Promise.all([
      listEditableCoursesForUser(
        supabase,
        user.id,
          "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at"
      ),
      listGamesWithCourseSettings(supabase),
    ]);
    gameSettingsByKey = await listCourseGameSettingsMap(courses.map((course) => course.id));

    const ownerCourses = courses.filter((course) => course.membership_role === "owner");
    const ownerCourseIds = ownerCourses.map((course) => course.id);

    if (ownerCourseIds.length > 0) {
      const admin = createAdminClient();
      const { data: authUsersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      const authUsers = (authUsersData?.users || []).filter(
        (authUser) => authUser?.app_metadata?.account_deleted !== true
      );
      const authUsersById = new Map(authUsers.map((authUser) => [authUser.id, authUser]));
      const managedUserIds = authUsers.map((authUser) => authUser.id);

      const [{ data: memberships }, { data: profiles }] = await Promise.all([
        admin
          .from("course_members")
          .select("course_id, profile_id, role")
          .in("course_id", ownerCourseIds)
          .in("role", ["owner", "editor"]),
        managedUserIds.length > 0
          ? admin
              .from("profiles")
              .select("id, display_name")
              .in("id", managedUserIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const currentByCourseId = new Map();

      for (const membership of memberships || []) {
        if (!membership?.profile_id) continue;
        const course = ownerCourses.find((item) => item.id === membership.course_id);
        if (!course || membership.profile_id === course.owner_id) continue;

        const authUser = authUsersById.get(membership.profile_id);
        const profile = profilesById.get(membership.profile_id);
        const displayName = getBestDisplayName(profile, authUser?.user_metadata, authUser?.email);
        const current = currentByCourseId.get(membership.course_id) || [];
        current.push({
          profileId: membership.profile_id,
          role: membership.role || "editor",
          displayName,
          email: authUser?.email || "",
        });
        currentByCourseId.set(membership.course_id, current);
      }

      const teacherCandidates = authUsers
        .filter((authUser) => {
          const metadataType = authUser?.user_metadata?.account_type;
          return metadataType !== "student";
        })
        .map((authUser) => {
          const profile = profilesById.get(authUser.id);
          return {
            id: authUser.id,
            email: authUser.email || "",
            displayName: getBestDisplayName(profile, authUser.user_metadata, authUser.email),
          };
        });

      const candidateOptionsByCourseId = new Map();
      for (const course of ownerCourses) {
        const currentMembers = new Set([
          course.owner_id,
          ...(currentByCourseId.get(course.id) || []).map((member) => member.profileId),
        ]);
        candidateOptionsByCourseId.set(
          course.id,
          teacherCandidates.filter((candidate) => !currentMembers.has(candidate.id))
        );
      }

      coTeacherState = {
        byCourseId: currentByCourseId,
        candidateOptionsByCourseId,
      };
    }
  } catch (loadError) {
    error = loadError;
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Your Classes</h1>
        <p>Manage class setup and open planning workflows.</p>
        <div className="ctaRow">
          <Link className="btn primary" href="/classes/new">
            Add Class
          </Link>
        </div>
      </section>

      <section className="card">
        {qs.joinCodeUpdated === "1" ? (
          <div className="card noticeSuccess">
            <p>{formatJoinCodeNotice("1")}</p>
          </div>
        ) : null}
        {qs.joinCodeError ? (
          <div className="card noticeError">
            <p>{formatJoinCodeNotice(String(qs.joinCodeError))}</p>
          </div>
        ) : null}
        {qs.coTeacher ? (
          <div className="card noticeSuccess">
            <p>{formatCoTeacherNotice(String(qs.coTeacher))}</p>
          </div>
        ) : null}
        {qs.coTeacherError ? (
          <div className="card noticeError">
            <p>{formatCoTeacherNotice(String(qs.coTeacherError))}</p>
          </div>
        ) : null}
        {qs.gameControl ? (
          <div className="card noticeSuccess">
            <p>{formatGameControlNotice(String(qs.gameControl), String(qs.gameSlug || ""))}</p>
          </div>
        ) : null}
        {qs.gameControlError ? (
          <div className="card noticeError">
            <p>{formatGameControlNotice(String(qs.gameControlError), String(qs.gameSlug || ""))}</p>
          </div>
        ) : null}
        {error ? <p>Could not load classes: {error.message}</p> : null}

        {!error && (!courses || courses.length === 0) ? (
          <p>No classes yet. Use Add Class to create your first section.</p>
        ) : null}

        {!error && courses && courses.length > 0 ? (
          <div className="list">
            {courses.map((course) => {
              const currentCoTeachers = coTeacherState.byCourseId.get(course.id) || [];
              const availableCoTeachers =
                coTeacherState.candidateOptionsByCourseId.get(course.id) || [];
              const courseGames = games.map((game) => ({
                ...game,
                enabled: gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true,
              }));

              return (
              <article key={course.id} className="card" style={{ background: "#fff" }}>
                <h3>{course.title}</h3>
                <p>
                  {course.class_name} | {course.schedule_model === "ab" ? `AB (${course.ab_meeting_day || "A/B"})` : "Every Day"}
                </p>
                <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
                  {course.membership_role === "owner"
                    ? "Role: Owner"
                    : course.membership_role === "admin"
                      ? "Role: Admin"
                      : "Role: Co-Teacher"}
                </p>
                <p>
                  {course.school_year_start} to {course.school_year_end}
                </p>
                {course.student_join_code ? (
                  <p style={{ fontSize: "0.95rem" }}>
                    Student Join Code: <strong>{course.student_join_code}</strong>
                  </p>
                ) : null}
                <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>Course ID: {course.id}</p>
                {course.membership_role === "owner" ? (
                  <div className="classCoTeacherBlock">
                    <p className="classCoTeacherHeading">Co-Teachers</p>
                    {currentCoTeachers.length > 0 ? (
                      <div className="classCoTeacherList">
                        {currentCoTeachers.map((teacher) => (
                          <div key={teacher.profileId} className="classCoTeacherItem">
                            <div>
                              <strong>{teacher.displayName}</strong>
                              <span>{teacher.email}</span>
                            </div>
                            <form action={removeCoTeacherAction}>
                              <input type="hidden" name="course_id" value={course.id} />
                              <input type="hidden" name="profile_id" value={teacher.profileId} />
                              <input type="hidden" name="return_to" value="classes" />
                              <button className="btn ghost" type="submit">
                                Remove Co-Teacher
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="classCoTeacherEmpty">No co-teachers yet.</p>
                    )}
                    <form action={addCoTeacherAction} className="classCoTeacherForm">
                      <input type="hidden" name="course_id" value={course.id} />
                      <input type="hidden" name="return_to" value="classes" />
                      <select className="input" name="profile_id" defaultValue="" disabled={availableCoTeachers.length === 0}>
                        <option value="" disabled>
                          {availableCoTeachers.length > 0 ? "Add a co-teacher" : "No more teachers available"}
                        </option>
                        {availableCoTeachers.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.displayName}
                            {candidate.email ? ` · ${candidate.email}` : ""}
                          </option>
                        ))}
                      </select>
                      <button className="btn ghost" type="submit" disabled={availableCoTeachers.length === 0}>
                        Add Co-Teacher
                      </button>
                    </form>
                  </div>
                ) : null}
                <div className="classGameControlsBlock">
                  <p className="classCoTeacherHeading">Game Controls</p>
                  <p className="classGameControlsIntro">
                    Enabled games appear in the Student Arcade for this class. Hidden games stay out of students&apos; class-linked game list.
                  </p>
                  <div className="classGameControlsList">
                    {courseGames.map((game) => (
                      <form
                        key={`${course.id}:${game.slug}`}
                        action={updateCourseGameSettingAction}
                        className={`classGameControlItem ${game.enabled ? "isEnabled" : "isHidden"}`}
                        >
                          <input type="hidden" name="course_id" value={course.id} />
                          <input type="hidden" name="game_slug" value={game.slug} />
                          <input type="hidden" name="enabled" value={String(!game.enabled)} />
                          <input type="hidden" name="return_to" value="classes" />
                          <div className="classGameControlCopy">
                          <div className="classGameControlTopline">
                            <strong>{game.name}</strong>
                            <span className={`pill classGameStatusPill ${game.enabled ? "isEnabled" : "isHidden"}`}>
                              {game.enabled ? "Live for students" : "Hidden from students"}
                            </span>
                          </div>
                          <span>{game.enabled ? "Students in this class can launch it now." : "Students will not see this in their class game list."}</span>
                          <p>{getGameSupportCopy(game)}</p>
                        </div>
                        <button className={`btn ${game.enabled ? "ghost" : "primary"}`} type="submit">
                          {game.enabled ? "Hide Game" : "Show Game"}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
                <div className="ctaRow">
                  <Link className="btn" href={`/classes/${course.id}/plan`}>
                    Open Plan
                  </Link>
                  <Link className="btn" href={`/classes/${course.id}/students`}>
                    Student Progress
                  </Link>
                  {course.student_join_code ? (
                    <form action={regenerateStudentJoinCodeAction}>
                      <input type="hidden" name="course_id" value={course.id} />
                      <input type="hidden" name="return_to" value="classes" />
                      <button className="btn" type="submit">
                        New Join Code
                      </button>
                    </form>
                  ) : null}
                  {course.membership_role === "owner" || course.membership_role === "admin" ? (
                    <form action={deleteClassAction}>
                      <input type="hidden" name="course_id" value={course.id} />
                      <button className="btn danger" type="submit">
                        Delete Class
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            )})}
          </div>
        ) : null}
      </section>
    </div>
  );
}
