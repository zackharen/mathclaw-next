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
        {qs.coTeacher === "added" ? <p>Co-teacher added.</p> : null}
        {qs.coTeacher === "removed" ? <p>Co-teacher removed.</p> : null}
        {qs.coTeacherError ? <p>Co-teacher tools hit a snag: {decodeURIComponent(qs.coTeacherError)}</p> : null}
        {qs.gameControl === "updated" ? <p>Game controls updated.</p> : null}
        {qs.gameControlError ? <p>Game controls hit a snag: {decodeURIComponent(qs.gameControlError)}</p> : null}
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
                  {course.membership_role === "owner" ? "Role: Owner" : "Role: Co-Teacher"}
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
                  <div className="classGameControlsList">
                    {courseGames.map((game) => (
                      <form
                        key={`${course.id}:${game.slug}`}
                        action={updateCourseGameSettingAction}
                        className="classGameControlItem"
                      >
                        <input type="hidden" name="course_id" value={course.id} />
                        <input type="hidden" name="game_slug" value={game.slug} />
                        <input type="hidden" name="enabled" value={String(!game.enabled)} />
                        <div>
                          <strong>{game.name}</strong>
                          <span>{game.enabled ? "Enabled for this class" : "Hidden from this class"}</span>
                        </div>
                        <button className={`btn ${game.enabled ? "ghost" : "primary"}`} type="submit">
                          {game.enabled ? "Disable" : "Enable"}
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
                      <button className="btn" type="submit">
                        New Join Code
                      </button>
                    </form>
                  ) : null}
                  {course.membership_role === "owner" ? (
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
