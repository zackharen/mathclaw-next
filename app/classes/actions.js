"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { generateJoinCode } from "@/lib/student-games/join-code";

export async function deleteClassAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  const { error } = await supabase.from("courses").delete().eq("id", course.id);
  if (error) throw new Error(error.message);

  revalidatePath("/classes");
}

export async function regenerateStudentJoinCodeAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${courseId}/students`);
  }

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) {
    redirect("/classes?join_code_error=course_not_found");
  }
  const writeClient = getCourseWriteClient(access, supabase);

  let joinCode = generateJoinCode();
  let attempts = 0;

  while (attempts < 5) {
    const { error } = await writeClient
      .from("courses")
      .update({ student_join_code: joinCode, updated_at: new Date().toISOString() })
      .eq("id", course.id);

    if (!error) {
      revalidatePath("/classes");
      revalidatePath(`/classes/${course.id}/students`);
      redirect(`/classes/${course.id}/students?join_code_updated=1`);
    }

    const message = String(error.message || "");
    if (message.includes("student_join_code")) {
      redirect(`/classes/${course.id}/students?join_code_error=missing_column`);
    }

    if (!message.includes("duplicate")) {
      redirect(`/classes/${course.id}/students?join_code_error=save_failed`);
    }

    attempts += 1;
    joinCode = generateJoinCode();
  }

  redirect(`/classes/${course.id}/students?join_code_error=duplicate_retry_failed`);
}
