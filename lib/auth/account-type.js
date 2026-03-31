const TEACHER_ONLY_PREFIXES = ["/classes", "/dashboard", "/teachers"];

export function parseAccountType(value) {
  if (value === "student") return "student";
  if (value === "teacher") return "teacher";
  return null;
}

export function normalizeAccountType(value) {
  return parseAccountType(value) || "teacher";
}

export function buildDefaultDisplayName(user) {
  const meta = user?.user_metadata || {};
  const raw =
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    user?.email?.split("@")[0] ||
    "MathClaw User";

  return String(raw).trim() || "MathClaw User";
}

export async function getAccountTypeForUser(supabase, user, fallback = "teacher") {
  if (!user) return fallback;

  const metadataType = parseAccountType(user.user_metadata?.account_type);

  const { data, error } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!error) {
    const profileType = parseAccountType(data?.account_type);
    if (profileType) return profileType;
  }

  const [{ data: joinedMembership }, { data: ownedCourse }] = await Promise.all([
    supabase
      .from("student_course_memberships")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (joinedMembership && !ownedCourse) {
    return "student";
  }

  return metadataType || fallback;
}

export async function ensureProfileForUser(supabase, user, accountType) {
  if (!user) return;

  const safeAccountType = normalizeAccountType(accountType);
  const defaultDisplayName = buildDefaultDisplayName(user);

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const discoverable =
    safeAccountType === "teacher"
      ? typeof existingProfile?.discoverable === "boolean"
        ? existingProfile.discoverable
        : true
      : false;

  const basePayload = {
    id: user.id,
    display_name: existingProfile?.display_name || defaultDisplayName,
    school_name: existingProfile?.school_name ?? null,
    timezone: existingProfile?.timezone || "America/New_York",
    discoverable,
    account_type: safeAccountType,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase.from("profiles").upsert(basePayload, { onConflict: "id" });

  if (error && typeof error.message === "string" && error.message.includes("account_type")) {
    const legacyPayload = {
      id: user.id,
      display_name: existingProfile?.display_name || defaultDisplayName,
      school_name: existingProfile?.school_name ?? null,
      timezone: existingProfile?.timezone || "America/New_York",
      discoverable,
      updated_at: new Date().toISOString(),
    };
    const retry = await supabase.from("profiles").upsert(legacyPayload, { onConflict: "id" });
    error = retry.error;
  }

  if (error && typeof error.message === "string" && error.message.includes("discoverable")) {
    const olderPayload = {
      id: user.id,
      display_name: existingProfile?.display_name || defaultDisplayName,
      school_name: existingProfile?.school_name ?? null,
      timezone: existingProfile?.timezone || "America/New_York",
      updated_at: new Date().toISOString(),
    };
    await supabase.from("profiles").upsert(olderPayload, { onConflict: "id" });
  }
}

export function defaultNextForAccountType(accountType) {
  return accountType === "student" ? "/play" : "/classes";
}

export function sanitizeNextForAccountType(next, accountType) {
  const safeAccountType = normalizeAccountType(accountType);
  const fallback = defaultNextForAccountType(safeAccountType);

  if (!next || typeof next !== "string" || !next.startsWith("/")) {
    return fallback;
  }

  if (
    safeAccountType === "student" &&
    TEACHER_ONLY_PREFIXES.some(
      (prefix) => next === prefix || next.startsWith(`${prefix}/`)
    )
  ) {
    return "/play";
  }

  return next;
}
