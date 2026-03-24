"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  let joinCode = generateJoinCode();
  let attempts = 0;

  while (attempts < 5) {
    const { error } = await supabase
      .from("courses")
      .update({ student_join_code: joinCode, updated_at: new Date().toISOString() })
      .eq("id", course.id)
      .eq("owner_id", user.id);

    if (!error) {
      revalidatePath("/classes");
      revalidatePath(`/classes/${course.id}/students`);
      return;
    }

    if (!String(error.message || "").includes("duplicate")) {
      throw new Error(error.message);
    }

    attempts += 1;
    joinCode = generateJoinCode();
  }

  throw new Error("Could not generate a unique join code.");
}
