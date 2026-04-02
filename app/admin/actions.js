"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerUser } from "@/lib/auth/owner";
import {
  ensureProfileForUser,
  normalizeAccountType,
  splitDisplayName,
} from "@/lib/auth/account-type";

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/admin");
  }

  if (!isOwnerUser(user)) {
    redirect("/");
  }

  return { user, supabase };
}

function isMissingColumnError(error, columnName) {
  return (
    error &&
    typeof error.message === "string" &&
    error.message.includes(`'${columnName}'`)
  );
}

async function getManagedAuthUser(admin, userId) {
  const { data: authUserData, error: getUserError } = await admin.auth.admin.getUserById(userId);
  if (getUserError) {
    redirect(`/admin?error=${encodeURIComponent(getUserError.message)}`);
  }
  return authUserData?.user || null;
}

async function ensureManagedProfile(admin, authUser) {
  const currentMetadata = authUser?.user_metadata || {};
  const inferredAccountType = normalizeAccountType(
    currentMetadata.account_type ||
      currentMetadata.role ||
      currentMetadata.user_type
  );

  await ensureProfileForUser(admin, authUser, inferredAccountType);

  return currentMetadata;
}

async function saveSchoolName(admin, userId, authUser, schoolName) {
  const currentMetadata = await ensureManagedProfile(admin, authUser);

  let { error: profileError } = await admin
    .from("profiles")
    .update({
      school_name: schoolName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError && isMissingColumnError(profileError, "updated_at")) {
    const retry = await admin
      .from("profiles")
      .update({
        school_name: schoolName || null,
      })
      .eq("id", userId);
    profileError = retry.error;
  }

  if (profileError) {
    return profileError;
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      school_name: schoolName || null,
    },
  });

  return authError || null;
}

async function addUserToClass(admin, userId, courseId, authUser) {
  await ensureManagedProfile(admin, authUser);

  const { error } = await admin
    .from("student_course_memberships")
    .upsert(
      {
        course_id: courseId,
        profile_id: userId,
      },
      { onConflict: "course_id,profile_id" }
    );

  return error || null;
}

async function softDeleteAccount(admin, userId, ownerId, authUser) {
  const currentAppMetadata = authUser?.app_metadata || {};

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    app_metadata: {
      ...currentAppMetadata,
      account_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: ownerId,
    },
  });

  return error || null;
}

export async function updateAccountTypeAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextTypeRaw = String(formData.get("account_type") || "teacher").trim();
  const nextType = nextTypeRaw === "student" ? "student" : "teacher";

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const currentMetadata = authUser?.user_metadata || {};
  const baseProfileUpdate = {
    account_type: nextType,
    discoverable: nextType === "student" ? false : currentMetadata?.discoverable,
  };

  let { error: profileError } = await admin
    .from("profiles")
    .update(baseProfileUpdate)
    .eq("id", userId);

  if (isMissingColumnError(profileError, "account_type")) {
    const retry = await admin
      .from("profiles")
      .update({
        discoverable: nextType === "student" ? false : currentMetadata?.discoverable,
      })
      .eq("id", userId);
    profileError = retry.error;
  }

  if (isMissingColumnError(profileError, "discoverable")) {
    profileError = null;
  }

  if (profileError) {
    redirect(`/admin?error=${encodeURIComponent(profileError.message)}`);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      account_type: nextType,
      discoverable: nextType === "student" ? false : currentMetadata?.discoverable ?? false,
    },
  });

  if (authError) {
    redirect(`/admin?error=${encodeURIComponent(authError.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?updated=1");
}

export async function renameAccountAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!userId || !displayName) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const currentMetadata = authUser?.user_metadata || {};

  let { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError && isMissingColumnError(profileError, "updated_at")) {
    const retry = await admin
      .from("profiles")
      .update({
        display_name: displayName,
      })
      .eq("id", userId);
    profileError = retry.error;
  }

  if (profileError) {
    redirect(`/admin?error=${encodeURIComponent(profileError.message)}`);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      display_name: displayName,
      full_name: displayName,
      name: displayName,
      first_name: firstName || splitDisplayName(displayName).firstName,
      last_name: lastName || splitDisplayName(displayName).lastName,
    },
  });

  if (authError) {
    redirect(`/admin?error=${encodeURIComponent(authError.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?renamed=1");
}

export async function updateSchoolNameAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const selectedSchoolName = String(formData.get("school_name") || "").trim();
  const newSchoolName = String(formData.get("new_school_name") || "").trim();
  const schoolName = newSchoolName || selectedSchoolName;

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const authError = await saveSchoolName(admin, userId, authUser, schoolName);

  if (authError) {
    redirect(`/admin?error=${encodeURIComponent(authError.message)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?schoolUpdated=${schoolName ? "set" : "cleared"}`);
}

export async function deleteAccountAction(formData) {
  const { user: owner } = await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  if (userId === owner.id) {
    redirect("/admin?error=cannot-delete-owner");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const error = await softDeleteAccount(admin, userId, owner.id, authUser);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/deleted");
  redirect(`/admin?deleted=1&undo=${encodeURIComponent(userId)}`);
}

export async function restoreDeletedAccountAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  if (!userId) {
    redirect("/admin/deleted?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const currentAppMetadata = authUser?.app_metadata || {};
  const nextAppMetadata = {
    ...currentAppMetadata,
    account_deleted: false,
    deleted_at: null,
    deleted_by: null,
  };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
    app_metadata: nextAppMetadata,
  });

  if (error) {
    redirect(`/admin/deleted?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/deleted");
  redirect("/admin/deleted?restored=1");
}

export async function toggleAdminAccessAction(formData) {
  const { user: actingUser } = await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextValue = String(formData.get("site_admin") || "").trim() === "true";

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  if (userId === actingUser.id && !nextValue) {
    redirect("/admin?error=cannot-remove-your-own-admin-access");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const currentAppMetadata = authUser?.app_metadata || {};

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...currentAppMetadata,
      site_admin: nextValue,
    },
  });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?adminAccess=${nextValue ? "granted" : "revoked"}`);
}

export async function resetPasswordAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextPassword = String(formData.get("password") || "").trim();

  if (!userId || !nextPassword) {
    redirect("/admin?error=missing-user");
  }

  if (nextPassword.length < 8) {
    redirect("/admin?error=password_must_be_at_least_8_characters");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const provider =
    authUser?.app_metadata?.provider ||
    authUser?.identities?.[0]?.provider ||
    "";

  if (provider === "google") {
    redirect("/admin?error=google_accounts_do_not_use_admin_password_resets");
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: nextPassword,
  });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect("/admin?passwordReset=1");
}

export async function deleteOwnedClassAction(formData) {
  await requireOwner();

  const courseId = String(formData.get("course_id") || "").trim();

  if (!courseId) {
    redirect("/admin?error=missing-course");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("courses").delete().eq("id", courseId);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/classes");
  revalidatePath("/play");
  redirect("/admin?classDeleted=1");
}

export async function updateBugReportStatusAction(formData) {
  const { user } = await requireOwner();

  const reportId = String(formData.get("report_id") || "").trim();
  const nextStatus = String(formData.get("status") || "open").trim();

  if (!reportId) {
    redirect("/admin?error=missing-report");
  }

  const normalizedStatus = nextStatus === "resolved" ? "resolved" : "open";
  const admin = createAdminClient();
  const payload = {
    status: normalizedStatus,
    resolved_at: normalizedStatus === "resolved" ? new Date().toISOString() : null,
    resolved_by: normalizedStatus === "resolved" ? user.id : null,
  };

  const { error } = await admin.from("bug_reports").update(payload).eq("id", reportId);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?bugReport=${normalizedStatus}`);
}

export async function toggleDiscoverableAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextValue = String(formData.get("discoverable") || "").trim() === "true";

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const currentMetadata = authUser?.user_metadata || {};
  let { error } = await admin
    .from("profiles")
    .update({ discoverable: nextValue })
    .eq("id", userId);

  if (isMissingColumnError(error, "discoverable")) {
    error = null;
  }

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      discoverable: nextValue,
    },
  });

  if (authError) {
    redirect(`/admin?error=${encodeURIComponent(authError.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/teachers");
  redirect(`/admin?discoverability=${nextValue ? "shown" : "hidden"}`);
}

export async function addUserToClassAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const courseId = String(formData.get("course_id") || "").trim();

  if (!userId || !courseId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
  const authUser = await getManagedAuthUser(admin, userId);
  const error = await addUserToClass(admin, userId, courseId, authUser);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/play");
  redirect("/admin?membership=added");
}

export async function bulkAccountAction(formData) {
  const { user: owner } = await requireOwner();

  const selectedUserIds = formData
    .getAll("selected_user_ids")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const actionType = String(formData.get("bulk_action") || "").trim();
  const selectedSchoolName = String(formData.get("bulk_school_name") || "").trim();
  const newSchoolName = String(formData.get("bulk_new_school_name") || "").trim();
  const schoolName = newSchoolName || selectedSchoolName;
  const courseId = String(formData.get("bulk_course_id") || "").trim();

  if (selectedUserIds.length === 0) {
    redirect("/admin?error=Select at least one account first.");
  }

  if (!["school", "class", "delete"].includes(actionType)) {
    redirect("/admin?error=Choose a bulk action first.");
  }

  if (actionType === "school" && !schoolName) {
    redirect("/admin?error=Choose or type a school for the selected accounts.");
  }

  if (actionType === "class" && !courseId) {
    redirect("/admin?error=Choose a class for the selected accounts.");
  }

  const admin = createAdminClient();
  let updatedCount = 0;
  let skippedOwners = 0;

  for (const userId of selectedUserIds) {
    const authUser = await getManagedAuthUser(admin, userId);

    if (!authUser) {
      continue;
    }

    if (actionType === "delete" && userId === owner.id) {
      skippedOwners += 1;
      continue;
    }

    let error = null;

    if (actionType === "school") {
      error = await saveSchoolName(admin, userId, authUser, schoolName);
    } else if (actionType === "class") {
      error = await addUserToClass(admin, userId, courseId, authUser);
    } else if (actionType === "delete") {
      error = await softDeleteAccount(admin, userId, owner.id, authUser);
    }

    if (error) {
      redirect(`/admin?error=${encodeURIComponent(error.message)}`);
    }

    updatedCount += 1;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/deleted");
  revalidatePath("/play");

  const resultParams = new URLSearchParams({
    bulk: actionType,
    bulkCount: String(updatedCount),
  });

  if (skippedOwners > 0) {
    resultParams.set("bulkSkippedOwners", String(skippedOwners));
  }

  redirect(`/admin?${resultParams.toString()}`);
}
