import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAccountType } from "@/lib/auth/account-type";

export const EMPTY_CO_TEACHER_STATE = {
  byCourseId: new Map(),
  candidateOptionsByCourseId: new Map(),
  unavailable: false,
};

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

// Loads current and assignable co-teachers for the courses this user owns.
// Streamed behind Suspense on /classes and /dashboard, so a failure here degrades
// to an unavailable notice inside the co-teacher disclosure instead of failing the page.
export async function loadCoTeacherState(ownerCourses) {
  const courses = (ownerCourses || []).filter((course) => course?.id);
  if (courses.length === 0) return EMPTY_CO_TEACHER_STATE;

  try {
    const admin = createAdminClient();
    const ownerCourseIds = courses.map((course) => course.id);
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
    const byCourseId = new Map();

    for (const membership of memberships || []) {
      if (!membership?.profile_id) continue;
      const course = courses.find((item) => item.id === membership.course_id);
      if (!course || membership.profile_id === course.owner_id) continue;

      const authUser = authUsersById.get(membership.profile_id);
      const profile = profilesById.get(membership.profile_id);
      const displayName = getBestDisplayName(profile, authUser?.user_metadata, authUser?.email);
      const current = byCourseId.get(membership.course_id) || [];
      current.push({
        profileId: membership.profile_id,
        role: membership.role || "editor",
        displayName,
        email: authUser?.email || "",
      });
      byCourseId.set(membership.course_id, current);
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
    for (const course of courses) {
      const currentMembers = new Set([
        course.owner_id,
        ...(byCourseId.get(course.id) || []).map((member) => member.profileId),
      ]);
      candidateOptionsByCourseId.set(
        course.id,
        teacherCandidates.filter((candidate) => !currentMembers.has(candidate.id))
      );
    }

    return { byCourseId, candidateOptionsByCourseId, unavailable: false };
  } catch {
    return {
      byCourseId: new Map(),
      candidateOptionsByCourseId: new Map(),
      unavailable: true,
    };
  }
}
