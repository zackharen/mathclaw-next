export async function listAccessibleCourses(supabase, userId) {
  const [{ data: owned }, { data: joined }] = await Promise.all([
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

  return [...map.values()];
}

export async function userCanAccessCourse(supabase, userId, courseId) {
  if (!courseId) return false;

  const { data: owned } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (owned) return true;

  const { data: joined } = await supabase
    .from("student_course_memberships")
    .select("id")
    .eq("course_id", courseId)
    .eq("profile_id", userId)
    .maybeSingle();

  return Boolean(joined);
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

  const { data: owned } = await supabase
    .from("courses")
    .select("id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return owned?.id || null;
}
