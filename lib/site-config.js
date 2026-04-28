import { createAdminClient } from "@/lib/supabase/admin";
import { ensureGameCatalog, GAME_CATALOG } from "@/lib/student-games/catalog";
import { isTeacherAccountType } from "@/lib/auth/account-type";

export const SITE_FEATURE_SETTINGS_GAME = {
  slug: "site_feature_flags",
  name: "Site Feature Flags",
  category: "math_skills",
  description: "Owner-managed site-wide feature visibility controls.",
  is_multiplayer: false,
};

export const SITE_COPY_SETTINGS_GAME = {
  slug: "site_copy_settings",
  name: "Site Copy Settings",
  category: "math_skills",
  description: "Owner-managed site copy and mission statement content.",
  is_multiplayer: false,
};

export const SITE_FEATURE_AUDIENCES = ["everyone", "teachers_only", "disabled"];

export const DEFAULT_SITE_COPY = {
  homeBanner: "",
  homeWelcome: "Welcome to Mathclaw!",
  homeIntro:
    "MathClaw helps teachers plan with less friction and gives students a clean, trackable arcade for math practice and challenge games.",
  teacherCardCopy:
    "Build classes, control pacing, edit calendars, and generate what your class needs each day.",
  studentCardCopy:
    "Practice, compete, and track progress across arcade games and quick math challenges.",
  aboutTitle: "About MathClaw",
  missionStatement:
    "MathClaw exists to make classroom math practice easier to launch, easier to track, and more motivating for students.",
  aboutStory:
    "MathClaw combines teacher planning tools, student arcade games, and classroom review systems so schools can use one place for practice, performance tasks, and live group play.",
};

function managedSiteGames() {
  return GAME_CATALOG.filter((game) => game.category !== "admin");
}

function normalizeText(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeSiteAudience(value) {
  return SITE_FEATURE_AUDIENCES.includes(value) ? value : "everyone";
}

function normalizeFeatureMetadata(metadata) {
  const audienceBySlug = {};

  for (const game of managedSiteGames()) {
    audienceBySlug[game.slug] = normalizeSiteAudience(metadata?.audienceBySlug?.[game.slug]);
  }

  return { audienceBySlug };
}

function normalizeSiteCopyMetadata(metadata) {
  return {
    homeBanner: String(metadata?.homeBanner || "").trim(),
    homeWelcome: normalizeText(metadata?.homeWelcome, DEFAULT_SITE_COPY.homeWelcome),
    homeIntro: normalizeText(metadata?.homeIntro, DEFAULT_SITE_COPY.homeIntro),
    teacherCardCopy: normalizeText(metadata?.teacherCardCopy, DEFAULT_SITE_COPY.teacherCardCopy),
    studentCardCopy: normalizeText(metadata?.studentCardCopy, DEFAULT_SITE_COPY.studentCardCopy),
    aboutTitle: normalizeText(metadata?.aboutTitle, DEFAULT_SITE_COPY.aboutTitle),
    missionStatement: normalizeText(metadata?.missionStatement, DEFAULT_SITE_COPY.missionStatement),
    aboutStory: normalizeText(metadata?.aboutStory, DEFAULT_SITE_COPY.aboutStory),
  };
}

export async function ensureSiteConfigCatalog(admin = createAdminClient()) {
  await ensureGameCatalog(admin);

  const { error } = await admin.from("games").upsert(
    [
      {
        slug: SITE_FEATURE_SETTINGS_GAME.slug,
        name: SITE_FEATURE_SETTINGS_GAME.name,
        category: SITE_FEATURE_SETTINGS_GAME.category,
        description: SITE_FEATURE_SETTINGS_GAME.description,
        is_multiplayer: false,
      },
      {
        slug: SITE_COPY_SETTINGS_GAME.slug,
        name: SITE_COPY_SETTINGS_GAME.name,
        category: SITE_COPY_SETTINGS_GAME.category,
        description: SITE_COPY_SETTINGS_GAME.description,
        is_multiplayer: false,
      },
    ],
    {
      onConflict: "slug",
      ignoreDuplicates: false,
    }
  );

  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(error.message);
  }
}

async function listSiteConfigRows(admin = createAdminClient()) {
  const { data, error } = await admin
    .from("game_sessions")
    .select("game_slug, metadata, created_at, player_id")
    .in("game_slug", [SITE_FEATURE_SETTINGS_GAME.slug, SITE_COPY_SETTINGS_GAME.slug])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

function firstRowForSlug(rows, slug) {
  return (rows || []).find((row) => row.game_slug === slug) || null;
}

export async function getSiteFeatureConfig(admin = createAdminClient()) {
  try {
    const rows = await listSiteConfigRows(admin);
    const row = firstRowForSlug(rows, SITE_FEATURE_SETTINGS_GAME.slug);
    return {
      ...normalizeFeatureMetadata(row?.metadata || {}),
      updatedAt: row?.created_at || null,
      updatedBy: row?.player_id || null,
    };
  } catch (error) {
    return {
      ...normalizeFeatureMetadata({}),
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export async function getSiteCopy(admin = createAdminClient()) {
  try {
    const rows = await listSiteConfigRows(admin);
    const row = firstRowForSlug(rows, SITE_COPY_SETTINGS_GAME.slug);
    return {
      ...normalizeSiteCopyMetadata(row?.metadata || {}),
      updatedAt: row?.created_at || null,
      updatedBy: row?.player_id || null,
    };
  } catch (error) {
    return {
      ...normalizeSiteCopyMetadata({}),
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export function audienceAllowsViewer(audience, viewerAccountType = "student") {
  const normalizedAudience = normalizeSiteAudience(audience);
  const isTeacherViewer = isTeacherAccountType(viewerAccountType);

  if (normalizedAudience === "disabled") return false;
  if (normalizedAudience === "teachers_only") return isTeacherViewer;
  return true;
}

export function describeSiteAudience(audience) {
  if (audience === "teachers_only") return "Teachers only";
  if (audience === "disabled") return "Disabled site-wide";
  return "Everyone";
}

export function applySiteFeatureConfig(games, featureConfig, options = {}) {
  const viewerAccountType = options.viewerAccountType || "student";
  const includeDisabledBySite = options.includeDisabledBySite === true;
  const includeAdmin = options.includeAdmin === true;

  return (games || [])
    .filter((game) => includeAdmin || game.category !== "admin")
    .map((game) => {
      const siteAudience = normalizeSiteAudience(featureConfig?.audienceBySlug?.[game.slug]);
      const visibleToViewer = audienceAllowsViewer(siteAudience, viewerAccountType);
      const visibleToStudents = audienceAllowsViewer(siteAudience, "student");
      const visibleToTeachers = audienceAllowsViewer(siteAudience, "teacher");

      return {
        ...game,
        siteAudience,
        siteVisibleToViewer: visibleToViewer,
        siteVisibleToStudents: visibleToStudents,
        siteVisibleToTeachers: visibleToTeachers,
        siteStatusLabel: describeSiteAudience(siteAudience),
      };
    })
    .filter((game) => includeDisabledBySite || game.siteVisibleToViewer);
}
