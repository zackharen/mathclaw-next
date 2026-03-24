"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id, title")
    .eq("student_join_code", joinCode)
    .maybeSingle();

  if (!course) {
    redirect("/play?join_error=not_found");
  }

  if (course.owner_id !== user.id) {
    const { error } = await supabase.from("student_course_memberships").upsert(
      {
        course_id: course.id,
        profile_id: user.id,
      },
      { onConflict: "course_id,profile_id" }
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/play");
  revalidatePath(`/classes/${course.id}/students`);
  redirect(`/play?join_success=1&course=${course.id}`);
}
