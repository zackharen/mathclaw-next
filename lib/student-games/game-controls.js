import { createAdminClient } from "@/lib/supabase/admin";

function isMissingSettingsTableError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("course_game_settings") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find"))
  );
}

function withEnabledState(games, settingsByKey, courseId) {
  return (games || []).map((game) => ({
    ...game,
    enabled: courseId ? settingsByKey.get(`${courseId}:${game.slug}`) ?? true : true,
  }));
}

export async function listGamesWithCourseSettings(supabase, courseId = null) {
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("slug, name, category, description, is_multiplayer")
    .order("name");

  if (gamesError) throw new Error(gamesError.message);
  if (!courseId || !Array.isArray(games) || games.length === 0) {
    return withEnabledState(games, new Map(), null);
  }

  try {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin
      .from("course_game_settings")
      .select("course_id, game_slug, enabled")
      .eq("course_id", courseId);

    if (settingsError) {
      if (isMissingSettingsTableError(settingsError)) {
        return withEnabledState(games, new Map(), courseId);
      }
      throw new Error(settingsError.message);
    }

    const settingsByKey = new Map(
      (settings || []).map((row) => [`${row.course_id}:${row.game_slug}`, row.enabled !== false])
    );

    return withEnabledState(games, settingsByKey, courseId);
  } catch (error) {
    if (isMissingSettingsTableError(error)) {
      return withEnabledState(games, new Map(), courseId);
    }
    throw error;
  }
}

export async function listCourseGameSettingsMap(courseIds) {
  const validCourseIds = (courseIds || []).filter(Boolean);
  if (validCourseIds.length === 0) return new Map();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("course_game_settings")
      .select("course_id, game_slug, enabled")
      .in("course_id", validCourseIds);

    if (error) {
      if (isMissingSettingsTableError(error)) return new Map();
      throw new Error(error.message);
    }

    return new Map(
      (data || []).map((row) => [`${row.course_id}:${row.game_slug}`, row.enabled !== false])
    );
  } catch (error) {
    if (isMissingSettingsTableError(error)) return new Map();
    throw error;
  }
}

export async function filterCoursesForGame(courses, gameSlug) {
  const allCourses = Array.isArray(courses) ? courses : [];
  if (!gameSlug || allCourses.length === 0) return allCourses;

  const settingsByKey = await listCourseGameSettingsMap(allCourses.map((course) => course.id));
  return allCourses.filter(
    (course) => settingsByKey.get(`${course.id}:${gameSlug}`) ?? true
  );
}

export async function isGameEnabledForCourse(courseId, gameSlug) {
  if (!courseId || !gameSlug) return true;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("course_game_settings")
      .select("enabled")
      .eq("course_id", courseId)
      .eq("game_slug", gameSlug)
      .maybeSingle();

    if (error) {
      if (isMissingSettingsTableError(error)) return true;
      throw new Error(error.message);
    }

    return data?.enabled !== false;
  } catch (error) {
    if (isMissingSettingsTableError(error)) return true;
    throw error;
  }
}
