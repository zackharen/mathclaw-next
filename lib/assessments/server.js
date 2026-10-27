import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZACK_ID, eligibleCourse } from "./core";

export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function result(res) {
  if (res.error) fail(res.error.message, 409);
  return res.data;
}
export async function context(courseId, verifiedUser = null) {
  const user =
    verifiedUser || (await (await createClient()).auth.getUser()).data.user;
  if (!user) fail("Please sign in.", 401);
  const admin = createAdminClient(),
    teacher = user.id === ZACK_ID;
  const courses = result(
    await admin
      .from("courses")
      .select(
        "id,owner_id,title,class_name,archived_at,pacing_mode,selected_library_id,schedule_model,ab_meeting_day,school_year_start,school_year_end",
      )
      .eq("owner_id", ZACK_ID)
      .is("archived_at", null),
  ).filter(eligibleCourse);
  const memberships = teacher
    ? []
    : result(
        await admin
          .from("student_course_memberships")
          .select("course_id")
          .eq("profile_id", user.id),
      );
  const allowed = teacher
    ? courses
    : courses.filter((c) => memberships.some((m) => m.course_id === c.id));
  if (!allowed.length)
    fail(
      "This workspace is available to Zack and students in his daytime classes.",
      403,
    );
  const course = courseId ? allowed.find((c) => c.id === courseId) : allowed[0];
  if (!course) fail("Class access denied.", 403);
  return { admin, user, teacher, courses: allowed, course };
}
export function teacherOnly(ctx) {
  if (!ctx.teacher) fail("Only Zack can change this setting.", 403);
}
export async function audit(ctx, action, document) {
  result(
    await ctx.admin.from("mc_assessment_audit").insert({
      actor_id: ctx.user.id,
      course_id: ctx.course.id,
      action,
      document,
    }),
  );
}
export async function cas(admin, table, row, patch) {
  const out = result(
    await admin
      .from(table)
      .update({ ...patch, revision: row.revision + 1 })
      .eq("id", row.id)
      .eq("revision", row.revision)
      .select()
      .maybeSingle(),
  );
  if (!out) fail("This changed in another window. Reload before saving.", 409);
  return out;
}
export async function body(request) {
  if (Number(request.headers.get("content-length") || 0) > 1500000)
    fail("Saved work is too large.", 413);
  const text = await request.text();
  if (text.length > 1500000) fail("Saved work is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    fail("Invalid request.");
  }
}
export function originCheck(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    fail("Invalid request origin.", 403);
}
export function responseError(e) {
  return Response.json(
    {
      error: e.status
        ? e.message
        : "Unable to load this workspace. Please try again.",
    },
    { status: e.status || 500, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(data) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
export function requireRow(row) {
  if (!row) fail("Record not found.", 404);
  return row;
}
