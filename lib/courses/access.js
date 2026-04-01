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
  if (!membership?.course_id) return null;

  const { data: sharedCourse, error: sharedCourseError } = await supabase
    .from("courses")
    .select(columns)
    .eq("id", membership.course_id)
    .maybeSingle();

  if (sharedCourseError) throw new Error(sharedCourseError.message);
  if (!sharedCourse) return null;

  return {
    course: sharedCourse,
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

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}
