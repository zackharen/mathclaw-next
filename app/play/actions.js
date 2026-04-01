"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import { normalizeJoinCode } from "@/lib/student-games/join-code";

export async function joinClassByCodeAction(formData) {
  const rawCode = formData.get("join_code");
  const joinCode = normalizeJoinCode(rawCode);

  if (!joinCode) {
    redirect("/play?join_error=missing");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/play`);
  }

  const accountType = await getAccountTypeForUser(supabase, user);

  let course = null;

  const { data: rpcResult, error: rpcError } = await supabase.rpc("join_course_by_code", {
    p_join_code: joinCode,
  });

  if (rpcError) {
    await logInternalEvent({
      eventKey: "join_class_rpc_failed",
      source: "play.joinClassByCodeAction",
      message: rpcError.message,
      user,
      accountType,
      context: { joinCode },
    });
  }

  if (!rpcError && Array.isArray(rpcResult) && rpcResult[0]) {
    course = rpcResult[0];
  }

  try {
    if (!course) {
      const admin = createAdminClient();
      const { data: adminCourses, error: adminError } = await admin
        .from("courses")
        .select("id, owner_id, title")
        .ilike("student_join_code", joinCode)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (adminError) {
        await logInternalEvent({
          eventKey: "join_class_admin_lookup_failed",
          source: "play.joinClassByCodeAction",
          message: adminError.message,
          user,
          accountType,
          context: { joinCode },
        });
        throw adminError;
      }

      course = adminCourses?.[0] ?? null;
    }
  } catch (error) {
    console.error("Failed admin join code lookup", error);
    await logInternalEvent({
      eventKey: "join_class_admin_lookup_exception",
      source: "play.joinClassByCodeAction",
      message: error?.message || "Admin join lookup failed",
      user,
      accountType,
      context: { joinCode },
    });
  }

  if (!course) {
    const { data: directCourses } = await supabase
      .from("courses")
      .select("id, owner_id, title")
      .ilike("student_join_code", joinCode)
      .order("updated_at", { ascending: false })
      .limit(1);

    course = directCourses?.[0] ?? null;
  }

  if (!course) {
    await logInternalEvent({
      eventKey: "join_class_not_found",
      source: "play.joinClassByCodeAction",
      level: "warning",
      message: "Class code not found during join flow",
      user,
      accountType,
      context: { joinCode },
    });
    redirect("/play?join_error=not_found");
  }

  if (course.owner_id !== user.id) {
    if (!rpcResult || !Array.isArray(rpcResult) || !rpcResult[0]) {
    let membershipError = null;

      try {
        const admin = createAdminClient();
        const { error } = await admin.from("student_course_memberships").upsert(
          {
            course_id: course.id,
            profile_id: user.id,
          },
          { onConflict: "course_id,profile_id" }
        );

        membershipError = error;
      } catch (error) {
        membershipError = error;
      }

      if (membershipError) {
        const { error } = await supabase.from("student_course_memberships").upsert(
          {
            course_id: course.id,
            profile_id: user.id,
          },
          { onConflict: "course_id,profile_id" }
        );

        membershipError = error;
      }

      if (membershipError) {
        await logInternalEvent({
          eventKey: "join_class_membership_failed",
          source: "play.joinClassByCodeAction",
          message: membershipError.message,
          user,
          accountType,
          courseId: course.id,
          context: { joinCode },
        });
        redirect("/play?join_error=server");
      }
    }
  }

  revalidatePath("/play");
  revalidatePath(`/classes/${course.id}/students`);
  redirect(`/play?join_success=1&course=${course.id}`);
}
