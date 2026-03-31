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

  const { data: membership } = await supabase
    .from("course_members")
    .select(`role, courses!inner(${columns})`)
    .eq("course_id", courseId)
    .eq("profile_id", userId)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (!membership?.courses) return null;

  return {
    course: membership.courses,
    role: membership.role || "editor",
    isOwner: membership.role === "owner",
  };
}

export async function listEditableCoursesForUser(
  supabase,
  userId,
  columns = "id, title, class_name, schedule_model, ab_meeting_day, school_year_start, school_year_end, student_join_code, owner_id, created_at"
) {
  if (!supabase || !userId) return [];

  const [ownedRes, sharedRes] = await Promise.all([
    supabase
      .from("courses")
      .select(columns)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("course_members")
      .select(`role, courses!inner(${columns})`)
      .eq("profile_id", userId)
      .in("role", ["owner", "editor"]),
  ]);

  const byId = new Map();

  for (const course of ownedRes.data || []) {
    byId.set(course.id, { ...course, membership_role: "owner", is_shared_course: false });
  }

  for (const row of sharedRes.data || []) {
    const course = row.courses;
    if (!course || byId.has(course.id)) continue;
    byId.set(course.id, {
      ...course,
      membership_role: row.role || "editor",
      is_shared_course: true,
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}
