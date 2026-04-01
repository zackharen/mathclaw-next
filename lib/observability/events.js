import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logInternalEvent({
  eventKey,
  source,
  level = "error",
  message,
  user = null,
  accountType = null,
  courseId = null,
  context = null,
}) {
  try {
    const admin = createAdminClient();
    await admin.from("internal_event_logs").insert({
      event_key: eventKey,
      source,
      level,
      message,
      user_id: user?.id || null,
      user_email: user?.email || null,
      account_type: accountType || null,
      course_id: courseId || null,
      context: context || {},
    });
  } catch (error) {
    console.error("Failed to write internal event log", {
      eventKey,
      source,
      level,
      message,
      courseId,
      context,
      loggingError: error?.message || error,
    });
  }
}
