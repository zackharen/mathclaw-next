import { createAdminClient } from "@/lib/supabase/admin";
import { applySiteFeatureConfig, getSiteFeatureConfig } from "@/lib/site-config";
import {
  ensureGameCatalog,
  GAME_CATALOG,
  sortGamesByName,
} from "@/lib/student-games/catalog";

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

export async function listGamesWithCourseSettings(supabase, courseId = null, options = {}) {
  const admin = createAdminClient();

  try {
    await ensureGameCatalog(admin);
  } catch (error) {
    // If catalog sync fails, keep serving the local catalog so the arcade still renders.
  }

  const { data: dbGames, error: gamesError } = await supabase
    .from("games")
    .select("slug, name, category, description, is_multiplayer")
    .order("name");

  if (gamesError) throw new Error(gamesError.message);

  const mergedGames = sortGamesByName(
    GAME_CATALOG.map((game) => {
      const dbMatch = (dbGames || []).find((entry) => entry.slug === game.slug);
      return dbMatch ? { ...game, ...dbMatch } : game;
    })
  );

  let featureConfig = { audienceBySlug: {} };
  try {
    featureConfig = await getSiteFeatureConfig(admin);
  } catch (error) {
    // Keep serving the local/default catalog if site config fails.
  }

  if (!courseId || !Array.isArray(mergedGames) || mergedGames.length === 0) {
    return applySiteFeatureConfig(withEnabledState(mergedGames, new Map(), null), featureConfig, options);
  }

  try {
    const { data: settings, error: settingsError } = await admin
      .from("course_game_settings")
      .select("course_id, game_slug, enabled")
      .eq("course_id", courseId);

    if (settingsError) {
      if (isMissingSettingsTableError(settingsError)) {
        return applySiteFeatureConfig(withEnabledState(mergedGames, new Map(), courseId), featureConfig, options);
      }
      throw new Error(settingsError.message);
    }

    const settingsByKey = new Map(
      (settings || []).map((row) => [`${row.course_id}:${row.game_slug}`, row.enabled !== false])
    );

    return applySiteFeatureConfig(withEnabledState(mergedGames, settingsByKey, courseId), featureConfig, options);
  } catch (error) {
    if (isMissingSettingsTableError(error)) {
      return applySiteFeatureConfig(withEnabledState(mergedGames, new Map(), courseId), featureConfig, options);
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

export async function filterCoursesForGame(courses, gameSlug, options = {}) {
  const allCourses = Array.isArray(courses) ? courses : [];
  if (!gameSlug || allCourses.length === 0) return allCourses;

  const settingsByKey = await listCourseGameSettingsMap(allCourses.map((course) => course.id));
  let featureConfig = { audienceBySlug: {} };
  try {
    featureConfig = await getSiteFeatureConfig(createAdminClient());
  } catch (error) {
    // Keep default audience behavior when site config cannot load.
  }
  const visibleForViewer = applySiteFeatureConfig(
    [{ slug: gameSlug, category: "math_skills" }],
    featureConfig,
    { viewerAccountType: options.viewerAccountType || "student" }
  ).length > 0;

  if (!visibleForViewer) return [];

  return allCourses.filter(
    (course) => settingsByKey.get(`${course.id}:${gameSlug}`) ?? true
  );
}

export async function isGameEnabledForCourse(courseId, gameSlug, options = {}) {
  if (!courseId || !gameSlug) return true;

  let featureConfig = { audienceBySlug: {} };
  try {
    featureConfig = await getSiteFeatureConfig(createAdminClient());
  } catch (error) {
    // Keep default audience behavior when site config cannot load.
  }

  const visibleForViewer = applySiteFeatureConfig(
    [{ slug: gameSlug, category: "math_skills" }],
    featureConfig,
    { viewerAccountType: options.viewerAccountType || "student" }
  ).length > 0;

  if (!visibleForViewer) return false;

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
