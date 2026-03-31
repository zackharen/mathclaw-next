"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerUser } from "@/lib/auth/owner";

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

export async function updateAccountTypeAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextTypeRaw = String(formData.get("account_type") || "teacher").trim();
  const nextType = nextTypeRaw === "student" ? "student" : "teacher";

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();

  const { data: authUserData, error: getUserError } = await admin.auth.admin.getUserById(userId);
  if (getUserError) {
    redirect(`/admin?error=${encodeURIComponent(getUserError.message)}`);
  }

  const currentMetadata = authUserData?.user?.user_metadata || {};
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
    },
  });

  if (authError) {
    redirect(`/admin?error=${encodeURIComponent(authError.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?updated=1");
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
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect("/admin?deleted=1");
}

export async function toggleDiscoverableAction(formData) {
  await requireOwner();

  const userId = String(formData.get("user_id") || "").trim();
  const nextValue = String(formData.get("discoverable") || "").trim() === "true";

  if (!userId) {
    redirect("/admin?error=missing-user");
  }

  const admin = createAdminClient();
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

  revalidatePath("/admin");
  revalidatePath("/teachers");
  redirect(`/admin?discoverability=${nextValue ? "shown" : "hidden"}`);
}
