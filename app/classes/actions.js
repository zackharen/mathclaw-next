"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { generateJoinCode } from "@/lib/student-games/join-code";
import { ensureProfileForUser, normalizeAccountType } from "@/lib/auth/account-type";

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

export async function addCoTeacherAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const profileId = String(formData.get("profile_id") || "").trim();

  if (!courseId || !profileId) {
    redirect("/classes?coTeacherError=missing-data");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect("/classes?coTeacherError=course-not-found");
  }

  if (profileId === user.id) {
    redirect("/classes?coTeacherError=cannot-add-yourself");
  }

  const admin = createAdminClient();
  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profileId);
  if (authUserError) {
    redirect(`/classes?coTeacherError=${encodeURIComponent(authUserError.message)}`);
  }

  const managedUser = authUserData?.user;
  if (!managedUser) {
    redirect("/classes?coTeacherError=user-not-found");
  }

  const accountType = normalizeAccountType(managedUser.user_metadata?.account_type);
  if (accountType === "student") {
    redirect("/classes?coTeacherError=students-cannot-be-co-teachers");
  }

  await ensureProfileForUser(admin, managedUser, "teacher");

  const { error } = await admin
    .from("course_members")
    .upsert(
      {
        course_id: course.id,
        profile_id: profileId,
        role: "editor",
      },
      { onConflict: "course_id,profile_id" }
    );

  if (error) {
    redirect(`/classes?coTeacherError=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/students`);
  redirect("/classes?coTeacher=added");
}

export async function removeCoTeacherAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const profileId = String(formData.get("profile_id") || "").trim();

  if (!courseId || !profileId) {
    redirect("/classes?coTeacherError=missing-data");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect("/classes?coTeacherError=course-not-found");
  }

  if (profileId === user.id || profileId === course.owner_id) {
    redirect("/classes?coTeacherError=cannot-remove-owner");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("course_members")
    .delete()
    .eq("course_id", course.id)
    .eq("profile_id", profileId);

  if (error) {
    redirect(`/classes?coTeacherError=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/students`);
  redirect("/classes?coTeacher=removed");
}
