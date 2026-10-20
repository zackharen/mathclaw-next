export const DATED_ASSIGNMENT_COLUMNS =
  "id, owner_id, course_id, assignment_date, due_date, label, lesson_id, category, provider, url, notes, release_time, due_time, is_draft, source_key, sort_order, updated_at";

// Dated (syllabus) assignments for one class. Tolerates a database where the
// fixed-date migration has not run yet: those classes simply have none.
export async function loadDatedAssignments(client, courseId) {
  const { data, error } = await client
    .from("teacher_announcement_assignments")
    .select(DATED_ASSIGNMENT_COLUMNS)
    .eq("course_id", courseId)
    .order("assignment_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    const message = String(error.message || "");
    if (message.includes("teacher_announcement_assignments") || message.includes("does not exist")) return [];
    throw new Error(message);
  }
  return data || [];
}
