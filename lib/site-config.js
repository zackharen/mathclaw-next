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
  // Homepage
  homeBanner: "",
  homeWelcome: "Welcome to Mathclaw!",
  homeIntro:
    "MathClaw helps teachers plan with less friction and gives students a clean, trackable arcade for math practice and challenge games.",
  teacherCardCopy:
    "Build classes, control pacing, edit calendars, and generate what your class needs each day.",
  studentCardCopy:
    "Practice, compete, and track progress across arcade games and quick math challenges.",

  // About
  aboutTitle: "About MathClaw",
  aboutSectionTitle: "About Us",
  missionSectionTitle: "Mission Statement",
  missionStatement:
    "MathClaw exists to make classroom math practice easier to launch, easier to track, and more motivating for students.",
  aboutStory:
    "MathClaw combines teacher planning tools, student arcade games, and classroom review systems so schools can use one place for practice, performance tasks, and live group play.",

  // Admin
  adminOwnerTitle: "Owner Admin",
  adminScopedTitle: "Admin",
  adminOwnerDescription:
    "Manage MathClaw accounts without digging through Supabase. This is just for the owner account.",
  adminNoSchoolDescription:
    "Your admin account needs a school assignment before school-scoped tools can load.",
  adminNoSchoolNotice:
    "No school is assigned to this admin account yet, so school-scoped admin tools are unavailable.",
  adminSectionsTitle: "Admin Sections",
  adminSectionsDescription:
    "Choose the admin tools you want to use. Everything above this stays visible while this changes the workspace below.",
  adminViewDiagnosticsLabel: "Bugs and Internal Errors",
  adminViewSiteCopyLabel: "Edit Site Text",
  adminViewFeaturesLabel: "Feature Rollout Controls",
  adminViewMasteryLabel: "Mastery Settings",
  adminViewAccountsLabel: "User Information",
  adminFeatureRolloutTitle: "Feature Rollout Controls",
  adminFeatureRolloutDescription:
    "Use these controls to hide features site-wide or release them to teachers before students.",
  adminFeatureBulkTitle: "Bulk Update Selected Features",
  adminFeatureBulkDescription:
    "Check the features you want below, then apply one rollout state to that selected set.",
  adminFeatureBulkControlTitle: "Owner rollout control",
  adminFeatureBulkControlBadge: "Owner control",
  adminFeatureBulkControlDescription:
    "Selected features will all move to the rollout category you choose here.",
  adminFeatureBulkButton: "Apply To Selected",
  adminFeatureControlsTitle: "Feature Controls",
  adminFeatureControlsDescription:
    "Set each feature to live for everyone, visible only to teachers, or disabled.",
  adminFeatureSortLabel: "Sort controls by",
  adminFeatureSortAlphabetical: "Alphabetical",
  adminFeatureSortStatus: "Current Status",
  adminFeatureSaveButton: "Save",

  // Arcade
  arcadeStudentTitle: "Student Arcade",
  arcadeTeacherTitle: "Arcade",
  arcadeStudentDescription:
    "Join a class with a teacher code, play games, and save your progress over time.",
  arcadeTeacherDescription:
    "Play games anytime, and join a class later if you want class leaderboards and teacher tracking.",
  arcadeClassesTitle: "Classes",
  arcadeClassesDescription:
    "Join a class or switch between the ones already connected to this account.",
  arcadeGroupActivitiesTitle: "Group Activities",
  arcadeGroupActivitiesDescription:
    "Use these modes when you want mixed review, strategy reminders, and more of a checkpoint feeling than a single-skill drill.",
  arcadeFunGamesTitle: "Fun & Games",
  arcadeFunGamesDescription: "Arcade-style games, skill practice, and independent play.",
  arcadeAwardsTitle: "Awards & Extra Credit",
  arcadeAwardsDescription:
    "Teacher awards and extra credit will show up here once they start handing them out.",
  arcadeCreateQuestionTitle: "Create A Math Question",
  arcadeCreateQuestionDescription:
    "Turn what you know into a performance task by writing your own question, answer, and short explanation for your class.",

  // Classes
  classesTitle: "Your Classes",
  classesDescription: "Manage class setup and open planning workflows.",

  // Dashboard
  dashboardTitle: "Pacing Dashboard",
  dashboardDescription:
    "Class-by-class pacing status based on completed lessons and current plan.",

  // Profile
  profileTitle: "Profile",
  profileTeacherDescription: "Update your teacher profile details.",
  profileStudentDescription: "Update your student profile details.",
  profilePlayerDescription: "Update your arcade player profile details.",

  // Report Bug
  reportBugTitle: "Report A Bug",
  reportBugDescription:
    "If something feels broken, confusing, or unexpectedly slow, log it here so it lands in the owner admin inbox.",
  reportBugFormTitle: "What Happened?",
  reportBugFormDescription:
    "Tell us what you were trying to do, what you expected, and what actually happened. The more specific the note, the faster it is to fix.",

  // Teachers
  teachersTitle: "Teachers",
  teachersDescription:
    "Find colleagues, build your school network, and grow a MathClaw teaching community.",
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
    // Homepage
    homeBanner: String(metadata?.homeBanner || "").trim(),
    homeWelcome: normalizeText(metadata?.homeWelcome, DEFAULT_SITE_COPY.homeWelcome),
    homeIntro: normalizeText(metadata?.homeIntro, DEFAULT_SITE_COPY.homeIntro),
    teacherCardCopy: normalizeText(metadata?.teacherCardCopy, DEFAULT_SITE_COPY.teacherCardCopy),
    studentCardCopy: normalizeText(metadata?.studentCardCopy, DEFAULT_SITE_COPY.studentCardCopy),

    // About
    aboutTitle: normalizeText(metadata?.aboutTitle, DEFAULT_SITE_COPY.aboutTitle),
    aboutSectionTitle: normalizeText(metadata?.aboutSectionTitle, DEFAULT_SITE_COPY.aboutSectionTitle),
    missionSectionTitle: normalizeText(metadata?.missionSectionTitle, DEFAULT_SITE_COPY.missionSectionTitle),
    missionStatement: normalizeText(metadata?.missionStatement, DEFAULT_SITE_COPY.missionStatement),
    aboutStory: normalizeText(metadata?.aboutStory, DEFAULT_SITE_COPY.aboutStory),

    // Admin
    adminOwnerTitle: normalizeText(metadata?.adminOwnerTitle, DEFAULT_SITE_COPY.adminOwnerTitle),
    adminScopedTitle: normalizeText(metadata?.adminScopedTitle, DEFAULT_SITE_COPY.adminScopedTitle),
    adminOwnerDescription: normalizeText(metadata?.adminOwnerDescription, DEFAULT_SITE_COPY.adminOwnerDescription),
    adminNoSchoolDescription: normalizeText(metadata?.adminNoSchoolDescription, DEFAULT_SITE_COPY.adminNoSchoolDescription),
    adminNoSchoolNotice: normalizeText(metadata?.adminNoSchoolNotice, DEFAULT_SITE_COPY.adminNoSchoolNotice),
    adminSectionsTitle: normalizeText(metadata?.adminSectionsTitle, DEFAULT_SITE_COPY.adminSectionsTitle),
    adminSectionsDescription: normalizeText(metadata?.adminSectionsDescription, DEFAULT_SITE_COPY.adminSectionsDescription),
    adminViewDiagnosticsLabel: normalizeText(metadata?.adminViewDiagnosticsLabel, DEFAULT_SITE_COPY.adminViewDiagnosticsLabel),
    adminViewSiteCopyLabel: normalizeText(metadata?.adminViewSiteCopyLabel, DEFAULT_SITE_COPY.adminViewSiteCopyLabel),
    adminViewFeaturesLabel: normalizeText(metadata?.adminViewFeaturesLabel, DEFAULT_SITE_COPY.adminViewFeaturesLabel),
    adminViewMasteryLabel: normalizeText(metadata?.adminViewMasteryLabel, DEFAULT_SITE_COPY.adminViewMasteryLabel),
    adminViewAccountsLabel: normalizeText(metadata?.adminViewAccountsLabel, DEFAULT_SITE_COPY.adminViewAccountsLabel),
    adminFeatureRolloutTitle: normalizeText(metadata?.adminFeatureRolloutTitle, DEFAULT_SITE_COPY.adminFeatureRolloutTitle),
    adminFeatureRolloutDescription: normalizeText(metadata?.adminFeatureRolloutDescription, DEFAULT_SITE_COPY.adminFeatureRolloutDescription),
    adminFeatureBulkTitle: normalizeText(metadata?.adminFeatureBulkTitle, DEFAULT_SITE_COPY.adminFeatureBulkTitle),
    adminFeatureBulkDescription: normalizeText(metadata?.adminFeatureBulkDescription, DEFAULT_SITE_COPY.adminFeatureBulkDescription),
    adminFeatureBulkControlTitle: normalizeText(metadata?.adminFeatureBulkControlTitle, DEFAULT_SITE_COPY.adminFeatureBulkControlTitle),
    adminFeatureBulkControlBadge: normalizeText(metadata?.adminFeatureBulkControlBadge, DEFAULT_SITE_COPY.adminFeatureBulkControlBadge),
    adminFeatureBulkControlDescription: normalizeText(metadata?.adminFeatureBulkControlDescription, DEFAULT_SITE_COPY.adminFeatureBulkControlDescription),
    adminFeatureBulkButton: normalizeText(metadata?.adminFeatureBulkButton, DEFAULT_SITE_COPY.adminFeatureBulkButton),
    adminFeatureControlsTitle: normalizeText(metadata?.adminFeatureControlsTitle, DEFAULT_SITE_COPY.adminFeatureControlsTitle),
    adminFeatureControlsDescription: normalizeText(metadata?.adminFeatureControlsDescription, DEFAULT_SITE_COPY.adminFeatureControlsDescription),
    adminFeatureSortLabel: normalizeText(metadata?.adminFeatureSortLabel, DEFAULT_SITE_COPY.adminFeatureSortLabel),
    adminFeatureSortAlphabetical: normalizeText(metadata?.adminFeatureSortAlphabetical, DEFAULT_SITE_COPY.adminFeatureSortAlphabetical),
    adminFeatureSortStatus: normalizeText(metadata?.adminFeatureSortStatus, DEFAULT_SITE_COPY.adminFeatureSortStatus),
    adminFeatureSaveButton: normalizeText(metadata?.adminFeatureSaveButton, DEFAULT_SITE_COPY.adminFeatureSaveButton),

    // Arcade
    arcadeStudentTitle: normalizeText(metadata?.arcadeStudentTitle, DEFAULT_SITE_COPY.arcadeStudentTitle),
    arcadeTeacherTitle: normalizeText(metadata?.arcadeTeacherTitle, DEFAULT_SITE_COPY.arcadeTeacherTitle),
    arcadeStudentDescription: normalizeText(metadata?.arcadeStudentDescription, DEFAULT_SITE_COPY.arcadeStudentDescription),
    arcadeTeacherDescription: normalizeText(metadata?.arcadeTeacherDescription, DEFAULT_SITE_COPY.arcadeTeacherDescription),
    arcadeClassesTitle: normalizeText(metadata?.arcadeClassesTitle, DEFAULT_SITE_COPY.arcadeClassesTitle),
    arcadeClassesDescription: normalizeText(metadata?.arcadeClassesDescription, DEFAULT_SITE_COPY.arcadeClassesDescription),
    arcadeGroupActivitiesTitle: normalizeText(metadata?.arcadeGroupActivitiesTitle, DEFAULT_SITE_COPY.arcadeGroupActivitiesTitle),
    arcadeGroupActivitiesDescription: normalizeText(metadata?.arcadeGroupActivitiesDescription, DEFAULT_SITE_COPY.arcadeGroupActivitiesDescription),
    arcadeFunGamesTitle: normalizeText(metadata?.arcadeFunGamesTitle, DEFAULT_SITE_COPY.arcadeFunGamesTitle),
    arcadeFunGamesDescription: normalizeText(metadata?.arcadeFunGamesDescription, DEFAULT_SITE_COPY.arcadeFunGamesDescription),
    arcadeAwardsTitle: normalizeText(metadata?.arcadeAwardsTitle, DEFAULT_SITE_COPY.arcadeAwardsTitle),
    arcadeAwardsDescription: normalizeText(metadata?.arcadeAwardsDescription, DEFAULT_SITE_COPY.arcadeAwardsDescription),
    arcadeCreateQuestionTitle: normalizeText(metadata?.arcadeCreateQuestionTitle, DEFAULT_SITE_COPY.arcadeCreateQuestionTitle),
    arcadeCreateQuestionDescription: normalizeText(metadata?.arcadeCreateQuestionDescription, DEFAULT_SITE_COPY.arcadeCreateQuestionDescription),

    // Classes
    classesTitle: normalizeText(metadata?.classesTitle, DEFAULT_SITE_COPY.classesTitle),
    classesDescription: normalizeText(metadata?.classesDescription, DEFAULT_SITE_COPY.classesDescription),

    // Dashboard
    dashboardTitle: normalizeText(metadata?.dashboardTitle, DEFAULT_SITE_COPY.dashboardTitle),
    dashboardDescription: normalizeText(metadata?.dashboardDescription, DEFAULT_SITE_COPY.dashboardDescription),

    // Profile
    profileTitle: normalizeText(metadata?.profileTitle, DEFAULT_SITE_COPY.profileTitle),
    profileTeacherDescription: normalizeText(metadata?.profileTeacherDescription, DEFAULT_SITE_COPY.profileTeacherDescription),
    profileStudentDescription: normalizeText(metadata?.profileStudentDescription, DEFAULT_SITE_COPY.profileStudentDescription),
    profilePlayerDescription: normalizeText(metadata?.profilePlayerDescription, DEFAULT_SITE_COPY.profilePlayerDescription),

    // Report Bug
    reportBugTitle: normalizeText(metadata?.reportBugTitle, DEFAULT_SITE_COPY.reportBugTitle),
    reportBugDescription: normalizeText(metadata?.reportBugDescription, DEFAULT_SITE_COPY.reportBugDescription),
    reportBugFormTitle: normalizeText(metadata?.reportBugFormTitle, DEFAULT_SITE_COPY.reportBugFormTitle),
    reportBugFormDescription: normalizeText(metadata?.reportBugFormDescription, DEFAULT_SITE_COPY.reportBugFormDescription),

    // Teachers
    teachersTitle: normalizeText(metadata?.teachersTitle, DEFAULT_SITE_COPY.teachersTitle),
    teachersDescription: normalizeText(metadata?.teachersDescription, DEFAULT_SITE_COPY.teachersDescription),
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
