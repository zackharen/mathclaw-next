"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let course = null;

  try {
    const admin = createAdminClient();
    const { data: adminCourses, error: adminError } = await admin
      .from("courses")
      .select("id, owner_id, title")
      .ilike("student_join_code", joinCode)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (adminError) {
      throw adminError;
    }

    course = adminCourses?.[0] ?? null;
  } catch (error) {
    console.error("Failed admin join code lookup", error);
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
    redirect("/play?join_error=not_found");
  }

  if (course.owner_id !== user.id) {
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
      throw new Error(membershipError.message);
    }
  }

  revalidatePath("/play");
  revalidatePath(`/classes/${course.id}/students`);
  redirect(`/play?join_success=1&course=${course.id}`);
}
