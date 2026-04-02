import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminAccessContext } from "@/lib/auth/admin-scope";
import { sortCoursesAlphabetically } from "@/lib/student-games/courses";

export async function getCourseAccessForUser(supabase, userId, courseId, columns = "id, owner_id") {
  if (!supabase || !userId || !courseId) return null;

  const { data: ownedCourse } = await supabase
    .from("courses")
    .select(columns)
    .eq("id", courseId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (ownedCourse) {
    return { course: ownedCourse, role: "owner", isOwner: true };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("course_members")
    .select("course_id, role")
    .eq("profile_id", userId)
    .eq("course_id", courseId)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (membershipError) throw new Error(membershipError.message);
  if (!membership?.course_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const adminContext = await getAdminAccessContext(user, admin);

    if (!adminContext.isOwner && adminContext.isAdmin && adminContext.schoolName) {
      const { data: schoolProfiles } = await admin
        .from("profiles")
        .select("id")
        .eq("school_name", adminContext.schoolName);
      const teacherIds = (schoolProfiles || []).map((profile) => profile.id).filter(Boolean);

      if (teacherIds.length > 0) {
        const { data: managedCourse, error: managedCourseError } = await admin
          .from("courses")
          .select(columns)
          .eq("id", courseId)
          .in("owner_id", teacherIds)
          .maybeSingle();

        if (managedCourseError) throw new Error(managedCourseError.message);
        if (managedCourse) {
          return { course: managedCourse, role: "admin", isOwner: managedCourse.owner_id === userId };
        }
      }
    }

    return null;
  }

  let sharedCourse = null;
  let sharedCourseError = null;

  const sharedCourseRes = await supabase
    .from("courses")
    .select(columns)
    .eq("id", membership.course_id)
    .maybeSingle();

  sharedCourse = sharedCourseRes.data;
  sharedCourseError = sharedCourseRes.error;

  if (!sharedCourse) {
    try {
      const admin = createAdminClient();
      const adminRes = await admin
        .from("courses")
        .select(columns)
        .eq("id", membership.course_id)
        .maybeSingle();

      sharedCourse = adminRes.data;
      sharedCourseError = adminRes.error;
    } catch (adminError) {
      if (!sharedCourseError) {
        sharedCourseError = adminError;
      }
    }
  }

  if (sharedCourseError) throw new Error(sharedCourseError.message);
  if (!sharedCourse) return null;

  return {
    course: sharedCourse,
    role: membership.role || "editor",
    isOwner: membership.role === "owner",
  };
}

export function getCourseWriteClient(access, supabase) {
  if (!access?.course || access.isOwner) return supabase;
  return createAdminClient();
}

export async function listEditableCoursesForUser(
  supabase,
  userId,
  columns = "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at"
) {
  if (!supabase || !userId) return [];

  const rpcColumns =
    "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at";

  if (columns === rpcColumns) {
    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_editable_courses");
    if (!rpcError && Array.isArray(rpcRows)) {
      return rpcRows;
    }
  }

  const [ownedRes, sharedMembershipRes] = await Promise.all([
    supabase
      .from("courses")
      .select(columns)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("course_members")
      .select("course_id, role")
      .eq("profile_id", userId)
      .in("role", ["owner", "editor"]),
  ]);

  if (ownedRes.error) throw new Error(ownedRes.error.message);
  if (sharedMembershipRes.error) throw new Error(sharedMembershipRes.error.message);

  const byId = new Map();

  for (const course of ownedRes.data || []) {
    byId.set(course.id, { ...course, membership_role: "owner", is_shared_course: false });
  }

  const sharedCourseIds = (sharedMembershipRes.data || [])
    .map((row) => row.course_id)
    .filter((value) => value && !byId.has(value));

  if (sharedCourseIds.length > 0) {
    const { data: sharedCourses, error: sharedCoursesError } = await supabase
      .from("courses")
      .select(columns)
      .in("id", sharedCourseIds);

    if (sharedCoursesError) throw new Error(sharedCoursesError.message);

    const roleByCourseId = new Map(
      (sharedMembershipRes.data || []).map((row) => [row.course_id, row.role || "editor"])
    );

    for (const course of sharedCourses || []) {
      if (!course || byId.has(course.id)) continue;
      byId.set(course.id, {
        ...course,
        membership_role: roleByCourseId.get(course.id) || "editor",
        is_shared_course: true,
      });
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const adminContext = await getAdminAccessContext(user, admin);

  if (!adminContext.isOwner && adminContext.isAdmin && adminContext.schoolName) {
    const { data: schoolProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("school_name", adminContext.schoolName);

    const teacherIds = (schoolProfiles || []).map((profile) => profile.id).filter(Boolean);

    if (teacherIds.length > 0) {
      const { data: schoolCourses, error: schoolCoursesError } = await admin
        .from("courses")
        .select(columns)
        .in("owner_id", teacherIds);

      if (schoolCoursesError) throw new Error(schoolCoursesError.message);

      for (const course of schoolCourses || []) {
        if (!course || byId.has(course.id)) continue;
        byId.set(course.id, {
          ...course,
          membership_role: course.owner_id === userId ? "owner" : "admin",
          is_shared_course: course.owner_id !== userId,
        });
      }
    }
  }

  return sortCoursesAlphabetically(Array.from(byId.values()));
}
