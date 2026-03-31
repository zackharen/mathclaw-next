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
  const currentAppMetadata = authUser?.app_metadata || {};

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    app_metadata: {
      ...currentAppMetadata,
      account_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: owner.id,
    },
  });

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
  const inferredAccountType = normalizeAccountType(authUser?.user_metadata?.account_type);

  await ensureProfileForUser(admin, authUser, inferredAccountType);

  const { error } = await admin
    .from("student_course_memberships")
    .upsert(
      {
        course_id: courseId,
        profile_id: userId,
      },
      { onConflict: "course_id,profile_id" }
    );

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/play");
  redirect("/admin?membership=added");
}
