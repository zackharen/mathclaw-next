import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdminArea, isAdminUser, isOwnerUser } from "@/lib/auth/owner";

export async function getAdminAccessContext(user, adminClient = null) {
  const admin = adminClient || createAdminClient();
  const isOwner = isOwnerUser(user);
  const isAdmin = isAdminUser(user);
  const canAccessAdmin = canAccessAdminArea(user);

  if (!user || !canAccessAdmin) {
    return {
      isOwner: false,
      isAdmin: false,
      canAccessAdmin: false,
      schoolName: "",
      hasSchoolScope: false,
    };
  }

  let schoolName = String(user.user_metadata?.school_name || "").trim();

  if (!schoolName) {
    const { data: profile } = await admin
      .from("profiles")
      .select("school_name")
      .eq("id", user.id)
      .maybeSingle();

    schoolName = String(profile?.school_name || "").trim();
  }

  return {
    isOwner,
    isAdmin,
    canAccessAdmin,
    schoolName,
    hasSchoolScope: Boolean(isOwner || schoolName),
  };
}

export function isUserInManagedSchool(actorContext, schoolName) {
  if (actorContext?.isOwner) return true;
  if (!actorContext?.schoolName) return false;
  return String(schoolName || "").trim() === actorContext.schoolName;
}
