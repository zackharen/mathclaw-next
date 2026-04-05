"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { generateJoinCode } from "@/lib/student-games/join-code";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import { ensureProfileForUser, getAccountTypeForUser, normalizeAccountType } from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";

function normalizeReturnTo(value) {
  return value === "students" ? "students" : "classes";
}

function buildRedirectPath({ returnTo, courseId, params }) {
  const targetPath =
    returnTo === "students" && courseId ? `/classes/${courseId}/students` : "/classes";
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
  const queryString = query.toString();
  return queryString ? `${targetPath}?${queryString}` : targetPath;
}

const TEACHER_AWARDS_GAME = {
  slug: "teacher_awards",
  name: "Teacher Awards",
  category: "teacher_tools",
  description: "Teacher-awarded recognitions and extra credit.",
  is_multiplayer: false,
};

async function ensureTeacherAwardsGame(admin) {
  const { error } = await admin.from("games").upsert(TEACHER_AWARDS_GAME, {
    onConflict: "slug",
    ignoreDuplicates: false,
  });

  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function deleteClassAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) return;

  const writeClient = getCourseWriteClient(access, supabase);
  const { error } = await writeClient.from("courses").delete().eq("id", course.id);
  if (error) throw new Error(error.message);

  revalidatePath("/classes");
}

export async function regenerateStudentJoinCodeAction(formData) {
  const courseId = formData.get("course_id");
  const returnTo = normalizeReturnTo(String(formData.get("return_to") || ""));
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${courseId}/students`);
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  const course = access?.course;

  if (!course) {
    await logInternalEvent({
      eventKey: "teacher_join_code_course_not_found",
      source: "classes.actions",
      level: "warning",
      message: "Teacher attempted to regenerate a join code for a missing course",
      user,
      accountType,
      courseId,
      context: { returnTo },
    });
    redirect(
      buildRedirectPath({
        returnTo,
        courseId,
        params: { joinCodeError: "course-not-found" },
      })
    );
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
      redirect(
        buildRedirectPath({
          returnTo,
          courseId: course.id,
          params: { joinCodeUpdated: "1" },
        })
      );
    }

    const message = String(error.message || "");
    if (message.includes("student_join_code")) {
      await logInternalEvent({
        eventKey: "teacher_join_code_missing_column",
        source: "classes.actions",
        message: error.message,
        user,
        accountType,
        courseId: course.id,
        context: { returnTo },
      });
      redirect(
        buildRedirectPath({
          returnTo,
          courseId: course.id,
          params: { joinCodeError: "missing-column" },
        })
      );
    }

    if (!message.includes("duplicate")) {
      await logInternalEvent({
        eventKey: "teacher_join_code_save_failed",
        source: "classes.actions",
        message: error.message,
        user,
        accountType,
        courseId: course.id,
        context: { returnTo },
      });
      redirect(
        buildRedirectPath({
          returnTo,
          courseId: course.id,
          params: { joinCodeError: "save-failed" },
        })
      );
    }

    attempts += 1;
    joinCode = generateJoinCode();
  }

  await logInternalEvent({
    eventKey: "teacher_join_code_duplicate_retry_failed",
    source: "classes.actions",
    message: "Failed to generate a unique join code after repeated retries",
    user,
    accountType,
    courseId: course.id,
    context: { attempts, returnTo },
  });
  redirect(
    buildRedirectPath({
      returnTo,
      courseId: course.id,
      params: { joinCodeError: "duplicate-retry-failed" },
    })
  );
}

export async function addCoTeacherAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const profileId = String(formData.get("profile_id") || "").trim();
  const returnTo = normalizeReturnTo(String(formData.get("return_to") || ""));

  if (!courseId || !profileId) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { coTeacherError: "missing-data" } }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!course) {
    await logInternalEvent({
      eventKey: "teacher_co_teacher_course_not_found",
      source: "classes.actions",
      level: "warning",
      message: "Teacher attempted to add a co-teacher to a missing or inaccessible course",
      user,
      accountType,
      courseId,
      context: { profileId, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId, params: { coTeacherError: "course-not-found" } }));
  }

  if (profileId === user.id) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { coTeacherError: "cannot-add-yourself" } }));
  }

  const admin = createAdminClient();
  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profileId);
  if (authUserError) {
    await logInternalEvent({
      eventKey: "teacher_co_teacher_lookup_failed",
      source: "classes.actions",
      message: authUserError.message,
      user,
      accountType,
      courseId: course.id,
      context: { profileId, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacherError: "lookup-failed" } }));
  }

  const managedUser = authUserData?.user;
  if (!managedUser) {
    redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacherError: "user-not-found" } }));
  }

  const managedAccountType = normalizeAccountType(managedUser.user_metadata?.account_type);
  if (managedAccountType === "student") {
    redirect(
      buildRedirectPath({
        returnTo,
        courseId: course.id,
        params: { coTeacherError: "students-cannot-be-co-teachers" },
      })
    );
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
    await logInternalEvent({
      eventKey: "teacher_co_teacher_add_failed",
      source: "classes.actions",
      message: error.message,
      user,
      accountType,
      courseId: course.id,
      context: { profileId, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacherError: "save-failed" } }));
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/students`);
  redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacher: "added" } }));
}

export async function assignStudentAwardAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const studentId = String(formData.get("student_id") || "").trim();
  const awardLabel = String(formData.get("award_label") || "").trim();
  const customAwardLabel = String(formData.get("custom_award_label") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const returnTo = normalizeReturnTo(String(formData.get("return_to") || ""));
  const rawPoints = Number(formData.get("points") || 0);
  const points = Number.isFinite(rawPoints) ? Math.max(0, Math.round(rawPoints)) : 0;
  const finalAwardLabel = customAwardLabel || awardLabel;

  if (!courseId || !studentId || !finalAwardLabel) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { awardError: "missing-data" } }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, title, owner_id");

  if (!access?.course) {
    await logInternalEvent({
      eventKey: "teacher_award_course_not_found",
      source: "classes.actions",
      level: "warning",
      message: "Teacher attempted to assign an award for a missing or inaccessible course",
      user,
      accountType,
      courseId,
      context: { studentId, awardLabel: finalAwardLabel, points, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId, params: { awardError: "course-not-found" } }));
  }

  const admin = createAdminClient();
  const [{ data: membership }, { data: studentProfile }] = await Promise.all([
    admin
      .from("student_course_memberships")
      .select("course_id, student_id")
      .eq("course_id", access.course.id)
      .eq("student_id", studentId)
      .maybeSingle(),
    admin.from("profiles").select("id, display_name").eq("id", studentId).maybeSingle(),
  ]);

  if (!membership?.student_id) {
    redirect(
      buildRedirectPath({
        returnTo,
        courseId: access.course.id,
        params: { awardError: "student-not-found" },
      })
    );
  }

  try {
    await ensureTeacherAwardsGame(admin);
  } catch (error) {
    await logInternalEvent({
      eventKey: "teacher_award_catalog_failed",
      source: "classes.actions",
      message: error.message,
      user,
      accountType,
      courseId: access.course.id,
      context: { studentId, awardLabel: finalAwardLabel, points, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId: access.course.id, params: { awardError: "catalog-failed" } }));
  }

  const { error } = await admin.from("game_sessions").insert({
    game_slug: TEACHER_AWARDS_GAME.slug,
    player_id: studentId,
    course_id: access.course.id,
    score: points,
    result: "teacher_award",
    metadata: {
      awardLabel: finalAwardLabel,
      note,
      awardedById: user.id,
      awardedByName:
        user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Teacher",
      source: "teacher_awards",
      studentDisplayName: studentProfile?.display_name || null,
    },
  });

  if (error) {
    await logInternalEvent({
      eventKey: "teacher_award_save_failed",
      source: "classes.actions",
      message: error.message,
      user,
      accountType,
      courseId: access.course.id,
      context: { studentId, awardLabel: finalAwardLabel, points, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId: access.course.id, params: { awardError: "save-failed" } }));
  }

  revalidatePath("/play");
  revalidatePath('/classes/' + access.course.id + '/students');
  redirect(
    buildRedirectPath({
      returnTo,
      courseId: access.course.id,
      params: { awardAdded: "1", studentId },
    })
  );
}

export async function removeCoTeacherAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const profileId = String(formData.get("profile_id") || "").trim();
  const returnTo = normalizeReturnTo(String(formData.get("return_to") || ""));

  if (!courseId || !profileId) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { coTeacherError: "missing-data" } }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!course) {
    await logInternalEvent({
      eventKey: "teacher_co_teacher_course_not_found",
      source: "classes.actions",
      level: "warning",
      message: "Teacher attempted to remove a co-teacher from a missing or inaccessible course",
      user,
      accountType,
      courseId,
      context: { profileId, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId, params: { coTeacherError: "course-not-found" } }));
  }

  if (profileId === user.id || profileId === course.owner_id) {
    redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacherError: "cannot-remove-owner" } }));
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("course_members")
    .delete()
    .eq("course_id", course.id)
    .eq("profile_id", profileId);

  if (error) {
    await logInternalEvent({
      eventKey: "teacher_co_teacher_remove_failed",
      source: "classes.actions",
      message: error.message,
      user,
      accountType,
      courseId: course.id,
      context: { profileId, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacherError: "remove-failed" } }));
  }

  revalidatePath("/classes");
  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/students`);
  redirect(buildRedirectPath({ returnTo, courseId: course.id, params: { coTeacher: "removed" } }));
}

export async function updateCourseGameSettingAction(formData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const gameSlug = String(formData.get("game_slug") || "").trim();
  const enabled = String(formData.get("enabled") || "").trim() === "true";
  const returnTo = normalizeReturnTo(String(formData.get("return_to") || ""));

  if (!courseId || !gameSlug) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { gameControlError: "missing-data" } }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes");
  }

  const accountType = await getAccountTypeForUser(supabase, user);
  const access = await getCourseAccessForUser(supabase, user.id, courseId, "id, owner_id");
  if (!access?.course) {
    await logInternalEvent({
      eventKey: "teacher_game_control_course_not_found",
      source: "classes.actions",
      level: "warning",
      message: "Teacher attempted to update game controls for a missing or inaccessible course",
      user,
      accountType,
      courseId,
      context: { gameSlug, enabled, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId, params: { gameControlError: "course-not-found" } }));
  }

  const games = await listGamesWithCourseSettings(supabase);
  if (!games.some((game) => game.slug === gameSlug)) {
    redirect(buildRedirectPath({ returnTo, courseId, params: { gameControlError: "unknown-game" } }));
  }

  const writeClient = getCourseWriteClient(access, supabase);
  const { error } = await writeClient
    .from("course_game_settings")
    .upsert(
      {
        course_id: courseId,
        game_slug: gameSlug,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "course_id,game_slug" }
    );

  if (error) {
    await logInternalEvent({
      eventKey: "teacher_game_control_update_failed",
      source: "classes.actions",
      message: error.message,
      user,
      accountType,
      courseId,
      context: { gameSlug, enabled, returnTo },
    });
    redirect(buildRedirectPath({ returnTo, courseId, params: { gameControlError: "save-failed" } }));
  }

  revalidatePath("/classes");
  revalidatePath("/play");
  revalidatePath("/play/2048");
  revalidatePath("/play/integer-practice");
  revalidatePath("/play/number-compare");
  revalidatePath("/play/connect4");
  redirect(
    buildRedirectPath({
      returnTo,
      courseId,
      params: {
        gameControl: enabled ? "enabled" : "disabled",
        gameSlug,
      },
    })
  );
}
