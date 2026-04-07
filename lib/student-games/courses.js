import { filterCoursesForGame, isGameEnabledForCourse } from "@/lib/student-games/game-controls";

function courseLabel(course) {
  return String(course?.title || course?.class_name || "").trim().toLowerCase();
}

export function sortCoursesAlphabetically(courses) {
  return [...(courses || [])].sort((a, b) => {
    const primary = courseLabel(a).localeCompare(courseLabel(b));
    if (primary !== 0) return primary;
    return String(a?.class_name || "").localeCompare(String(b?.class_name || ""));
  });
}

export function resolvePreferredCourseId(courses, preferredCourseId) {
  if (preferredCourseId && courses.some((course) => course.id === preferredCourseId)) {
    return preferredCourseId;
  }
  return courses[0]?.id || "";
}

function inferViewerAccountType(courses, fallback = "student") {
  return (courses || []).some((course) => course.relationship === "owner" || course.relationship === "co_teacher")
    ? "teacher"
    : fallback;
}

export async function listAccessibleCourses(supabase, userId, options = {}) {
  const gameSlug = options?.gameSlug || null;
  const { data: rpcCourses, error: rpcError } = await supabase.rpc("list_accessible_courses");

  if (!rpcError && Array.isArray(rpcCourses)) {
    const sortedCourses = sortCoursesAlphabetically(rpcCourses);
    const viewerAccountType = options?.viewerAccountType || inferViewerAccountType(sortedCourses);
    return gameSlug ? filterCoursesForGame(sortedCourses, gameSlug, { viewerAccountType }) : sortedCourses;
  }

  const [{ data: owned }, { data: joined }, { data: shared }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, class_name, student_join_code, owner_id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_course_memberships")
      .select("course_id, courses!inner(id, title, class_name, student_join_code, owner_id)")
      .eq("profile_id", userId)
      .order("joined_at", { ascending: false }),
    supabase
      .from("course_members")
      .select("role, courses!inner(id, title, class_name, student_join_code, owner_id)")
      .eq("profile_id", userId)
      .in("role", ["owner", "editor"]),
  ]);

  const map = new Map();

  for (const course of owned || []) {
    map.set(course.id, { ...course, relationship: "owner" });
  }

  for (const row of joined || []) {
    const course = row.courses;
    if (!course) continue;
    if (map.has(course.id)) continue;
    map.set(course.id, { ...course, relationship: "student" });
  }

  for (const row of shared || []) {
    const course = row.courses;
    if (!course) continue;
    if (map.has(course.id)) continue;
    map.set(course.id, { ...course, relationship: "co_teacher" });
  }

  const courses = sortCoursesAlphabetically([...map.values()]);
  const viewerAccountType = options?.viewerAccountType || inferViewerAccountType(courses);
  return gameSlug ? filterCoursesForGame(courses, gameSlug, { viewerAccountType }) : courses;
}

export async function userCanAccessCourse(supabase, userId, courseId, options = {}) {
  const gameSlug = options?.gameSlug || null;
  if (!courseId) return false;

  const { data: owned } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (owned) {
    const viewerAccountType = options?.viewerAccountType || "teacher";
    return gameSlug ? isGameEnabledForCourse(courseId, gameSlug, { viewerAccountType }) : true;
  }

  const { data: joined } = await supabase
    .from("student_course_memberships")
    .select("id")
    .eq("course_id", courseId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (joined) {
    const viewerAccountType = options?.viewerAccountType || "student";
    return gameSlug ? isGameEnabledForCourse(courseId, gameSlug, { viewerAccountType }) : true;
  }

  const { data: shared } = await supabase
    .from("course_members")
    .select("role")
    .eq("course_id", courseId)
    .eq("profile_id", userId)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  const canAccess = Boolean(shared);
  if (!canAccess || !gameSlug) return canAccess;
  const viewerAccountType = options?.viewerAccountType || "teacher";
  return isGameEnabledForCourse(courseId, gameSlug, { viewerAccountType });
}

export async function findDefaultCourseForUser(supabase, userId) {
  if (!userId) return null;

  const { data: joined } = await supabase
    .from("student_course_memberships")
    .select("course_id, joined_at")
    .eq("profile_id", userId)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (joined?.course_id) return joined.course_id;

  const { data: sharedMemberships } = await supabase
    .from("course_members")
    .select("course_id")
    .eq("profile_id", userId)
    .in("role", ["owner", "editor"]);

  const sharedCourseIds = (sharedMemberships || [])
    .map((row) => row.course_id)
    .filter(Boolean);

  if (sharedCourseIds.length > 0) {
    const { data: sharedCourse } = await supabase
      .from("courses")
      .select("id, created_at")
      .in("id", sharedCourseIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sharedCourse?.id) return sharedCourse.id;
  }

  const { data: owned } = await supabase
    .from("courses")
    .select("id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return owned?.id || null;
}
