import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountTypeForUser,
  isTeacherAccountType,
  normalizeAccountType,
} from "@/lib/auth/account-type";
import { getSiteCopy } from "@/lib/site-config";
import { listEditableCoursesForUser } from "@/lib/courses/access";
import { sortCoursesAlphabetically } from "@/lib/student-games/courses";
import { listCourseGameSettingsMap, listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  addCoTeacherAction,
  deleteClassAction,
  regenerateStudentJoinCodeAction,
  removeCoTeacherAction,
  updateClassSettingsAction,
  updateCourseGameSettingAction,
} from "@/app/classes/actions";

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function prettyDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  const gameLabel = gameSlug || "that game";
  if (status === "enabled") return `${gameLabel} is now enabled for this class.`;
  if (status === "disabled") return `${gameLabel} is now hidden for this class.`;
  if (status === "missing-data") return "Missing class or game information for that update.";
  if (status === "course-not-found") return "That class could not be found for game-control updates.";
  if (status === "unknown-game") return "That game could not be found.";
  if (status === "save-failed") return `Could not update ${gameLabel} for this class. Please try again.`;
  return "";
}

function formatClassSettingsNotice(status) {
  if (status === "updated") return "Class settings updated.";
  if (status === "missing-data") return "Add both class names before saving.";
  if (status === "course-not-found") return "That class could not be found for settings updates.";
  if (status === "invalid-curriculum") return "Choose a valid curriculum before saving.";
  if (status === "save-failed") return "Could not update class settings. Please try again.";
  return "";
}

function formatCurriculumLabel(library) {
  if (!library) return "No curriculum";
  const providerName = library.curriculum_providers?.name;
  const className = library.class_name || "Curriculum";
  return providerName ? `${className} · ${providerName}` : className;
}

function formatLessonLabel(sourceLessonCode, title) {
  const safeTitle = title || "Untitled Lesson";
  if (!sourceLessonCode) return safeTitle;
  const normalizedCode = String(sourceLessonCode).trim();
  const normalizedTitle = String(safeTitle).trim();

  if (normalizedTitle.toLowerCase().startsWith(`${normalizedCode.toLowerCase()}:`)) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}

function paceDeltaLabel(delta) {
  if (delta === 0) return "On pace";
  if (delta > 0) return `${delta} day${delta === 1 ? "" : "s"} ahead`;
  const behind = Math.abs(delta);
  return `${behind} day${behind === 1 ? "" : "s"} behind`;
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

export default async function DashboardPage({ searchParams }) {
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
    redirect("/auth/sign-in?redirect=/dashboard");
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
  let curriculumLibraries = [];
  let gameSettingsByKey = new Map();
  let coTeacherState = {
    byCourseId: new Map(),
    candidateOptionsByCourseId: new Map(),
  };

  try {
    [courses, games, curriculumLibraries] = await Promise.all([
      listEditableCoursesForUser(
        supabase,
        user.id,
        "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at, selected_library_id"
      ),
      listGamesWithCourseSettings(supabase, null, {
        viewerAccountType: "teacher",
        includeDisabledBySite: true,
      }),
      supabase
        .from("curriculum_libraries")
        .select("id, class_code, class_name, curriculum_providers!inner(code, name)")
        .eq("curriculum_providers.code", "math_medic")
        .order("class_name", { ascending: true })
        .then(({ data, error: librariesError }) => {
          if (librariesError) throw new Error(librariesError.message);
          return data || [];
        }),
    ]);
    courses = sortCoursesAlphabetically(courses);
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
          ? admin.from("profiles").select("id, display_name").in("id", managedUserIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesById = new Map((profiles || []).map((item) => [item.id, item]));
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
        .filter((authUser) => normalizeAccountType(authUser?.user_metadata?.account_type) === "teacher")
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

  if (error) {
    return (
      <div className="stack">
        <section className="card">
          <h1>{siteCopy.dashboardTitle}</h1>
          <p>Could not load dashboard data: {error.message}</p>
        </section>
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="stack">
        <section className="card">
          <h1>{siteCopy.dashboardTitle}</h1>
          <p>No classes yet. Create one to see pacing status.</p>
          <div className="ctaRow">
            <Link className="btn primary" href="/classes/new">
              Add Class
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const courseIds = courses.map((course) => course.id);
  const classNames = [...new Set(courses.map((course) => course.class_name).filter(Boolean))];
  const selectedLibraryIds = [
    ...new Set(courses.map((course) => course.selected_library_id).filter(Boolean)),
  ];
  const { data: planRows } = await supabase
    .from("course_lesson_plan")
    .select("course_id, class_date, lesson_slot, status, curriculum_lessons(source_lesson_code, title)")
    .in("course_id", courseIds)
    .order("class_date", { ascending: true })
    .order("lesson_slot", { ascending: true });

  const lessonCountByCourse = new Map();
  const lessonCountByLibrary = new Map();
  await Promise.all(
    selectedLibraryIds.map(async (libraryId) => {
      const { count } = await supabase
        .from("curriculum_lessons")
        .select("id", { count: "exact", head: true })
        .eq("library_id", libraryId);

      lessonCountByLibrary.set(libraryId, count || 0);
    })
  );
  for (const course of courses) {
    lessonCountByCourse.set(
      course.id,
      course.selected_library_id ? lessonCountByLibrary.get(course.selected_library_id) || 0 : 0
    );
  }

  const rowsByCourse = new Map();
  for (const row of planRows || []) {
    const arr = rowsByCourse.get(row.course_id) || [];
    arr.push(row);
    rowsByCourse.set(row.course_id, arr);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const curriculumById = new Map(curriculumLibraries.map((library) => [library.id, library]));

  const { data: connectionRows } = await supabase
    .from("teacher_connections")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq("status", "accepted");

  const connectedUserIds = [
    ...new Set(
      (connectionRows || []).map((row) =>
        row.requester_id === user.id ? row.addressee_id : row.requester_id
      )
    ),
  ];

  const { data: colleagueCourses } =
    connectedUserIds.length && classNames.length
      ? await supabase
          .from("courses")
          .select("id, owner_id, class_name")
          .in("owner_id", connectedUserIds)
          .in("class_name", classNames)
      : { data: [] };

  const colleagueCourseIds = (colleagueCourses || []).map((course) => course.id);
  const { data: colleagueCompletedRows } = colleagueCourseIds.length
    ? await supabase
        .from("course_lesson_plan")
        .select("course_id")
        .in("course_id", colleagueCourseIds)
        .eq("status", "completed")
    : { data: [] };

  const completedByColleagueCourse = new Map();
  for (const row of colleagueCompletedRows || []) {
    const next = (completedByColleagueCourse.get(row.course_id) || 0) + 1;
    completedByColleagueCourse.set(row.course_id, next);
  }

  const colleagueStatsByClass = new Map();
  for (const course of colleagueCourses || []) {
    const completed = completedByColleagueCourse.get(course.id) || 0;
    const stats = colleagueStatsByClass.get(course.class_name) || { totalCompleted: 0, samples: 0 };
    stats.totalCompleted += completed;
    stats.samples += 1;
    colleagueStatsByClass.set(course.class_name, stats);
  }

  const cards = courses.map((course) => {
    const rows = rowsByCourse.get(course.id) || [];
    const totalLessons = lessonCountByCourse.get(course.id) || rows.length || 0;
    const completedRows = rows.filter((row) => row.status === "completed");
    const completed = completedRows.length;
    const remaining = Math.max(totalLessons - completed, 0);
    const expectedByNow = rows.filter((row) => row.class_date <= todayIso).length;
    const delta = completed - expectedByNow;
    const currentRow = completedRows[completedRows.length - 1] || null;
    const projectedRow = rows[rows.length - 1] || null;
    const colleagueStats = colleagueStatsByClass.get(course.class_name) || null;
    const colleagueAvg = colleagueStats
      ? Math.round((colleagueStats.totalCompleted / colleagueStats.samples) * 10) / 10
      : null;
    const colleagueDelta =
      colleagueAvg == null ? null : Math.round((completed - colleagueAvg) * 10) / 10;
    const progressPct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
    const courseGames = games.map((game) => ({
      ...game,
      courseEnabled: gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true,
      enabled: (gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true) && game.siteVisibleToViewer,
      studentEnabled:
        (gameSettingsByKey.get(`${course.id}:${game.slug}`) ?? true) && game.siteVisibleToStudents,
    }));

    return {
      course,
      courseGames,
      curriculumLabel: formatCurriculumLabel(curriculumById.get(course.selected_library_id)),
      currentCoTeachers: coTeacherState.byCourseId.get(course.id) || [],
      availableCoTeachers: coTeacherState.candidateOptionsByCourseId.get(course.id) || [],
      completed,
      remaining,
      totalLessons,
      delta,
      progressPct,
      currentLesson: currentRow?.curriculum_lessons
        ? formatLessonLabel(
            currentRow.curriculum_lessons.source_lesson_code,
            currentRow.curriculum_lessons.title
          )
        : "Not started",
      projectedEnd: projectedRow?.class_date || course.school_year_end,
      colleagueAvg,
      colleagueCount: colleagueStats?.samples || 0,
      colleagueDelta,
    };
  });

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.dashboardTitle}</h1>
        <p>{siteCopy.dashboardDescription}</p>
        <div className="ctaRow">
          <Link className="btn primary" href="/classes/new">
            Add Class
          </Link>
        </div>
      </section>

      {qs.joinCodeUpdated === "1" ? <div className="card noticeSuccess"><p>{formatJoinCodeNotice("1")}</p></div> : null}
      {qs.joinCodeError ? <div className="card noticeError"><p>{formatJoinCodeNotice(String(qs.joinCodeError))}</p></div> : null}
      {qs.coTeacher ? <div className="card noticeSuccess"><p>{formatCoTeacherNotice(String(qs.coTeacher))}</p></div> : null}
      {qs.coTeacherError ? <div className="card noticeError"><p>{formatCoTeacherNotice(String(qs.coTeacherError))}</p></div> : null}
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
      {qs.classSettings ? (
        <div className="card noticeSuccess">
          <p>{formatClassSettingsNotice(String(qs.classSettings))}</p>
        </div>
      ) : null}
      {qs.classSettingsError ? (
        <div className="card noticeError">
          <p>{formatClassSettingsNotice(String(qs.classSettingsError))}</p>
        </div>
      ) : null}

      <div className="list">
        {cards.map((card) => (
          <article key={card.course.id} className="card classCourseCard">
            <details className="arcadeSectionDetails classCourseDetails">
              <summary className="arcadeSectionSummary classCourseSummary">
                <div>
                  <h2>{card.course.title}</h2>
                  <p>
                    {card.course.class_name} ·{" "}
                    {card.course.schedule_model === "ab"
                      ? `AB (${card.course.ab_meeting_day || "A/B"})`
                      : "Every Day"} · {card.completed}/{card.totalLessons} lessons ·{" "}
                    {paceDeltaLabel(card.delta)}
                  </p>
                </div>
                <span className="arcadeSectionToggle">
                  <span className="showLabel">Show</span>
                  <span className="hideLabel">Hide</span>
                </span>
              </summary>
              <div className="arcadeSectionBody classCourseBody">
                <div className="kv" style={{ marginTop: 0 }}>
                  <div>
                    <strong>Current Unit Position</strong>
                    <span>{card.currentLesson}</span>
                  </div>
                  <div>
                    <strong>Completed</strong>
                    <span>{card.completed}/{card.totalLessons} ({card.progressPct}%)</span>
                  </div>
                  <div>
                    <strong>Remaining Lessons</strong>
                    <span>{card.remaining}</span>
                  </div>
                  <div>
                    <strong>Projected Final Lesson Date</strong>
                    <span>{prettyDate(card.projectedEnd)}</span>
                  </div>
                  <div>
                    <strong>Pacing Delta</strong>
                    <span>{paceDeltaLabel(card.delta)}</span>
                  </div>
                  <div>
                    <strong>Colleague Comparison</strong>
                    <span>
                      {card.colleagueAvg == null
                        ? "No connected colleague data"
                        : `Avg completed: ${card.colleagueAvg} (${card.colleagueCount} class${
                            card.colleagueCount === 1 ? "" : "es"
                          }) | You ${
                            card.colleagueDelta === 0
                              ? "match"
                              : card.colleagueDelta > 0
                                ? `lead by ${card.colleagueDelta}`
                                : `trail by ${Math.abs(card.colleagueDelta)}`
                          }`}
                    </span>
                  </div>
                </div>

                <div className="classCourseMetaGrid">
                  <div>
                    <strong>Role</strong>
                    <span>
                      {card.course.membership_role === "owner"
                        ? "Owner"
                        : card.course.membership_role === "admin"
                          ? "Admin"
                          : "Co-Teacher"}
                    </span>
                  </div>
                  <div>
                    <strong>Dates</strong>
                    <span>{shortDate(card.course.school_year_start)} to {shortDate(card.course.school_year_end)}</span>
                  </div>
                  <div>
                    <strong>Curriculum</strong>
                    <span>{card.curriculumLabel}</span>
                  </div>
                  <div>
                    <strong>Join Code</strong>
                    <span>{card.course.student_join_code || "Not set yet"}</span>
                  </div>
                </div>

                <div className="ctaRow">
                  <Link className="btn" href={`/classes/${card.course.id}/plan`}>
                    Open Plan
                  </Link>
                  <Link className="btn" href={`/classes/${card.course.id}/students`}>
                    Student Progress
                  </Link>
                  {card.course.student_join_code ? (
                    <form action={regenerateStudentJoinCodeAction}>
                      <input type="hidden" name="course_id" value={card.course.id} />
                      <input type="hidden" name="return_to" value="dashboard" />
                      <button className="btn" type="submit">New Join Code</button>
                    </form>
                  ) : null}
                  {card.course.membership_role === "owner" || card.course.membership_role === "admin" ? (
                    <form action={deleteClassAction}>
                      <input type="hidden" name="course_id" value={card.course.id} />
                      <button className="btn danger" type="submit">Delete Class</button>
                    </form>
                  ) : null}
                </div>

                <details className="gameControlsDetails classNestedDetails">
                  <summary className="gameControlsSummary">
                    <div>
                      <h2>Class Settings</h2>
                      <p>Rename the class card, class label, and curriculum</p>
                    </div>
                    <span className="gameControlsToggle">
                      <span className="showLabel">Show</span>
                      <span className="hideLabel">Hide</span>
                    </span>
                  </summary>
                  <div className="gameControlsBody classNestedBody">
                    <form action={updateClassSettingsAction} className="classCoTeacherForm classSettingsForm">
                      <input type="hidden" name="course_id" value={card.course.id} />
                      <input type="hidden" name="return_to" value="dashboard" />
                      <label>
                        <span>Dashboard name</span>
                        <input className="input" name="title" defaultValue={card.course.title || ""} required />
                      </label>
                      <label>
                        <span>Class label</span>
                        <input className="input" name="class_name" defaultValue={card.course.class_name || ""} required />
                      </label>
                      <label>
                        <span>Curriculum</span>
                        <select
                          className="input"
                          name="selected_library_id"
                          defaultValue={card.course.selected_library_id || ""}
                        >
                          <option value="">No curriculum</option>
                          {curriculumLibraries.map((library) => (
                            <option key={library.id} value={library.id}>
                              {formatCurriculumLabel(library)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="btn primary" type="submit">Save Class Settings</button>
                    </form>
                  </div>
                </details>

                {card.course.membership_role === "owner" ? (
                  <details className="gameControlsDetails classNestedDetails">
                    <summary className="gameControlsSummary">
                      <div>
                        <h2>Co-Teachers</h2>
                        <p>{card.currentCoTeachers.length} co-teacher{card.currentCoTeachers.length === 1 ? "" : "s"} connected</p>
                      </div>
                      <span className="gameControlsToggle">
                        <span className="showLabel">Show</span>
                        <span className="hideLabel">Hide</span>
                      </span>
                    </summary>
                    <div className="gameControlsBody classNestedBody">
                      {card.currentCoTeachers.length > 0 ? (
                        <div className="classCoTeacherList">
                          {card.currentCoTeachers.map((teacher) => (
                            <div key={teacher.profileId} className="classCoTeacherItem">
                              <div>
                                <strong>{teacher.displayName}</strong>
                                <span>{teacher.email}</span>
                              </div>
                              <form action={removeCoTeacherAction}>
                                <input type="hidden" name="course_id" value={card.course.id} />
                                <input type="hidden" name="profile_id" value={teacher.profileId} />
                                <input type="hidden" name="return_to" value="dashboard" />
                                <button className="btn ghost" type="submit">Remove Co-Teacher</button>
                              </form>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="classCoTeacherEmpty">No co-teachers yet.</p>
                      )}
                      <form action={addCoTeacherAction} className="classCoTeacherForm">
                        <input type="hidden" name="course_id" value={card.course.id} />
                        <input type="hidden" name="return_to" value="dashboard" />
                        <select className="input" name="profile_id" defaultValue="" disabled={card.availableCoTeachers.length === 0}>
                          <option value="" disabled>
                            {card.availableCoTeachers.length > 0 ? "Add a co-teacher" : "No more teachers available"}
                          </option>
                          {card.availableCoTeachers.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.displayName}
                              {candidate.email ? ` · ${candidate.email}` : ""}
                            </option>
                          ))}
                        </select>
                        <button className="btn ghost" type="submit" disabled={card.availableCoTeachers.length === 0}>
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
                        {card.courseGames.filter((game) => game.studentEnabled).length} of {card.courseGames.length} games live for students
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
                      {card.courseGames.map((game) => (
                        <form
                          key={`${card.course.id}:${game.slug}`}
                          action={updateCourseGameSettingAction}
                          className={`classGameControlItem ${game.enabled ? "isEnabled" : "isHidden"}`}
                        >
                          <input type="hidden" name="course_id" value={card.course.id} />
                          <input type="hidden" name="game_slug" value={game.slug} />
                          <input type="hidden" name="enabled" value={String(!game.enabled)} />
                          <input type="hidden" name="return_to" value="dashboard" />
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
        ))}
      </div>
    </div>
  );
}
