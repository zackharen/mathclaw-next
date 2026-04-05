"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import { normalizeJoinCode } from "@/lib/student-games/join-code";
import { listAccessibleCourses } from "@/lib/student-games/courses";

const STUDENT_CREATED_QUESTIONS_GAME = {
  slug: "student_created_questions",
  name: "Student-Created Questions",
  category: "performance_tasks",
  description: "Student-authored math questions saved as performance tasks.",
  is_multiplayer: false,
};

async function ensureStudentCreatedQuestionsGame(admin) {
  const { error } = await admin.from("games").upsert(STUDENT_CREATED_QUESTIONS_GAME, {
    onConflict: "slug",
    ignoreDuplicates: false,
  });

  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(error.message);
  }
}

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

export async function createStudentQuestionAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const questionType = String(formData.get("question_type") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const correctAnswer = String(formData.get("correct_answer") || "").trim();
  const explanation = String(formData.get("explanation") || "").trim();

  if (!courseId || !questionType || !prompt || !correctAnswer) {
    redirect(`/play?question_error=missing&course=${encodeURIComponent(courseId)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/play");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id);
  const selectedCourse = courses.find((course) => course.id === courseId);

  if (!selectedCourse) {
    redirect(`/play?question_error=course&course=${encodeURIComponent(courseId)}`);
  }

  const admin = createAdminClient();

  try {
    await ensureStudentCreatedQuestionsGame(admin);
  } catch (error) {
    await logInternalEvent({
      eventKey: "student_created_question_catalog_failed",
      source: "play.createStudentQuestionAction",
      message: error.message,
      user,
      accountType,
      courseId,
      context: { questionType },
    });
    redirect(`/play?question_error=catalog&course=${encodeURIComponent(courseId)}`);
  }

  const { error } = await admin.from("game_sessions").insert({
    game_slug: STUDENT_CREATED_QUESTIONS_GAME.slug,
    player_id: user.id,
    course_id: courseId,
    score: 1,
    result: "student_created_question",
    metadata: {
      questionType,
      prompt,
      correctAnswer,
      explanation,
      createdById: user.id,
      createdByName:
        user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Student",
      source: "student_created_questions",
    },
  });

  if (error) {
    await logInternalEvent({
      eventKey: "student_created_question_save_failed",
      source: "play.createStudentQuestionAction",
      message: error.message,
      user,
      accountType,
      courseId,
      context: { questionType },
    });
    redirect(`/play?question_error=save&course=${encodeURIComponent(courseId)}`);
  }

  revalidatePath("/play");
  revalidatePath(`/classes/${courseId}/students`);
  redirect(`/play?question_created=1&course=${encodeURIComponent(courseId)}`);
}
