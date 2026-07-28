import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountTypeForUser,
  isTeacherAccountType,
  normalizeAccountType,
} from "@/lib/auth/account-type";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { getSiteCopy } from "@/lib/site-config";
import { listCourseGameSettingsMap, listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  addCoTeacherAction,
  deleteClassAction,
  regenerateStudentJoinCodeAction,
  removeCoTeacherAction,
  updateCourseGameSettingAction,
} from "./actions";
import { sortCoursesAlphabetically } from "@/lib/student-games/courses";

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function courseMonogram(course) {
  const words = String(course.title || course.class_name || "Class")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function courseRoleLabel(role) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Co-Teacher";
}

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
  if (status === "invalid-account-type") return "Only teacher accounts can be added as co-teachers.";
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
        skill_builder: "Skill Builder",
        showdown_framework: "Showdown Framework",
        spiral_review: "Spiral Review",
        question_kind_review: "What Kind Of Question Is This?",
        telling_time: "Telling Time",
        slope_intercept: "Slope & Y-Intercept",
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
  if (game.slug === "skill_builder") return "Students choose a target skill, build mastery over a focused run, and raise their level.";
  if (game.slug === "showdown_framework") return "Students work through a Punch-Out-inspired round framework with math-triggered attacks and stamina swings.";
  if (game.slug === "spiral_review") return "Students cycle through mixed review questions pulled from multiple skill types.";
  if (game.slug === "question_kind_review") return "Students identify the kind of math question they are seeing before they solve it.";
  if (game.slug === "telling_time") return "Students read clocks and set times to the nearest five minutes.";
  if (game.slug === "slope_intercept") return "Students read a graphed line and identify its slope and y-intercept.";
  if (game.slug === "sudoku") return "Students fill the grid by keeping every row, column, and 3x3 box valid.";
  if (game.slug === "comet_typing") return "Students guide Nova the courier by typing words accurately and building streaks.";
  return game.description || "Students can launch this game from the Student Arcade when it is enabled.";
}

export default async function ClassesPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const siteCopy = await getSiteCopy();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (!isTeacherAccountType(accountType)) {
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
      listGamesWithCourseSettings(supabase, null, {
        viewerAccountType: "teacher",
        includeDisabledBySite: true,
      }),
    ]);
    gameSettingsByKey = await listCourseGameSettingsMap(courses.map((course) => course.id));
    courses = sortCoursesAlphabetically(courses);

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
          return normalizeAccountType(metadataType) === "teacher";
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

  const ownerCourseCount = courses.filter((course) => course.membership_role === "owner").length;
  const readyCourseCount = courses.filter((course) => Boolean(course.student_join_code)).length;

  return (
    <div className="stack classesWorkspace">
      <section className="classesWorkspaceHero">
        <div className="classesWorkspaceHeroCopy">
          <p className="eyebrow">Teacher workspace</p>
          <h1>{siteCopy.classesTitle}</h1>
          <p>{siteCopy.classesDescription}</p>
          <div className="classesWorkspaceHeroActions">
            <Link className="btn primary" href="/classes/new">
              <span aria-hidden="true">＋</span> Add Class
            </Link>
            <Link className="btn secondary" href="/dashboard">
              Open Dashboard
            </Link>
          </div>
        </div>
        <div className="classesWorkspaceStats" aria-label="Classes overview">
          <div>
            <strong>{courses.length}</strong>
            <span>Active {courses.length === 1 ? "class" : "classes"}</span>
          </div>
          <div>
            <strong>{readyCourseCount}</strong>
            <span>Join-code ready</span>
          </div>
          <div>
            <strong>{games.length}</strong>
            <span>Game options</span>
          </div>
          <div>
            <strong>{ownerCourseCount}</strong>
            <span>You own</span>
          </div>
        </div>
      </section>

      <section className="classesWorkspaceContent">
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
          <div className="classesWorkspaceEmpty">
            <span aria-hidden="true">＋</span>
            <h2>Create your first class</h2>
            <p>Set up a section, choose its schedule, and invite students when you are ready.</p>
            <Link className="btn primary" href="/classes/new">
              Add Class
            </Link>
          </div>
        ) : null}

        {!error && courses && courses.length > 0 ? (
          <>
            <div className="classesWorkspaceSectionHeader">
              <div>
                <p className="eyebrow">Your teaching portfolio</p>
                <h2>Your classes</h2>
              </div>
              <p>Select a class to plan, review student progress, or adjust access.</p>
            </div>
            <div className="classesWorkspaceGrid">
            {courses.map((course, index) => {
              const currentCoTeachers = coTeacherState.byCourseId.get(course.id) || [];
              const availableCoTeachers =
                coTeacherState.candidateOptionsByCourseId.get(course.id) || [];
              const courseGames = games.map((game) => ({
                ...game,
                courseEnabled: gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true,
                enabled: (gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true) && game.siteVisibleToViewer,
                studentEnabled:
                  (gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true) && game.siteVisibleToStudents,
              }));
              const liveGameCount = courseGames.filter((game) => game.studentEnabled).length;

              return (
                <article key={course.id} className={`classCourseCard classCourseTone${index % 5}`}>
                  <div className="classCourseOverview">
                    <div className="classCourseIdentity">
                      <div className="classCourseMonogram" aria-hidden="true">
                        {courseMonogram(course)}
                      </div>
                      <div className="classCourseTitle">
                        <h2>{course.title}</h2>
                        <p>{course.class_name}</p>
                      </div>
                    </div>
                    <div className="classCourseStatusRow">
                      <span>{course.schedule_model === "ab" ? `A/B · ${course.ab_meeting_day || "A/B"}` : "Every day"}</span>
                      <span>{liveGameCount} games live</span>
                      <span>{courseRoleLabel(course.membership_role)}</span>
                    </div>
                    <div className="classCourseJoinCode">
                      <span>Student join code</span>
                      <strong>{course.student_join_code || "Not set"}</strong>
                    </div>
                  </div>

                  <nav className="classCourseQuickActions" aria-label={`${course.title} shortcuts`}>
                    <Link href={`/classes/${course.id}/plan`}>
                      <span className="classCourseActionIcon" aria-hidden="true">▤</span>
                      <span><strong>Class Plan</strong><small>Lessons and pacing</small></span>
                    </Link>
                    <Link href={`/classes/${course.id}/students`}>
                      <span className="classCourseActionIcon" aria-hidden="true">◎</span>
                      <span><strong>Students</strong><small>Progress and awards</small></span>
                    </Link>
                    <Link href={`/classes/${course.id}/announcements`}>
                      <span className="classCourseActionIcon" aria-hidden="true">◈</span>
                      <span><strong>Announcements</strong><small>Daily class display</small></span>
                    </Link>
                  </nav>

                  <details className="classCourseDetails">
                    <summary className="classCourseManageSummary">
                      <span>
                        <strong>Manage class</strong>
                        <small>Access, co-teachers, and game visibility</small>
                      </span>
                      <span className="classCourseManageToggle" aria-hidden="true">＋</span>
                    </summary>
                    <div className="classCourseBody">
                      <div className="classCourseMetaGrid">
                        <div>
                          <strong>Role</strong>
                          <span>{courseRoleLabel(course.membership_role)}</span>
                        </div>
                        <div>
                          <strong>Dates</strong>
                          <span>{shortDate(course.school_year_start)} to {shortDate(course.school_year_end)}</span>
                        </div>
                        <div>
                          <strong>Join Code</strong>
                          <span>{course.student_join_code || "Not set yet"}</span>
                        </div>
                      </div>

                      <div className="classCourseManagementActions">
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

                      {course.membership_role === "owner" ? (
                        <details className="gameControlsDetails classNestedDetails">
                          <summary className="gameControlsSummary">
                            <div>
                              <h2>Co-Teachers</h2>
                              <p>{currentCoTeachers.length} co-teacher{currentCoTeachers.length === 1 ? "" : "s"} connected</p>
                            </div>
                            <span className="gameControlsToggle">
                              <span className="showLabel">Show</span>
                              <span className="hideLabel">Hide</span>
                            </span>
                          </summary>
                          <div className="gameControlsBody classNestedBody">
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
                        </details>
                      ) : null}

                      <details className="gameControlsDetails classNestedDetails">
                        <summary className="gameControlsSummary">
                          <div>
                            <h2>Game Controls</h2>
                            <p>
                              {courseGames.filter((game) => game.studentEnabled).length} of {courseGames.length} games live for students
                            </p>
                          </div>
                          <span className="gameControlsToggle">
                            <span className="showLabel">Show</span>
                            <span className="hideLabel">Hide</span>
                          </span>
                        </summary>
                        <div className="gameControlsBody classNestedBody">
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
                                    <span className={`pill classGameStatusPill ${game.studentEnabled ? "isEnabled" : "isHidden"}`}>
                                      {game.studentEnabled ? "Live for students" : "Hidden from students"}
                                    </span>
                                  </div>
                                  <span>{game.studentEnabled ? "Students in this class can launch it now." : "Students will not see this in their class game list."}</span>
                                  <p>{getGameSupportCopy(game)}</p>
                                  <p><strong>Site-wide rollout:</strong> {game.siteStatusLabel}</p>
                                </div>
                                <button className={`btn ${game.courseEnabled ? "ghost" : "primary"}`} type="submit">
                                  {game.courseEnabled ? "Hide Game" : "Show Game"}
                                </button>
                              </form>
                            ))}
                          </div>
                        </div>
                      </details>
                    </div>
                  </details>
                </article>
              );
            })}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
