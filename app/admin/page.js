import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdminArea, isAdminUser, isOwnerEmail, isOwnerUser } from "@/lib/auth/owner";
import { getAdminAccessContext } from "@/lib/auth/admin-scope";
import { splitDisplayName } from "@/lib/auth/account-type";
import { describeSiteAudience, getSiteCopy, getSiteFeatureConfig } from "@/lib/site-config";
import { getIntegerMasterySettings } from "@/lib/integer-practice/mastery-settings.server";
import { evaluateLevelProgression } from "@/lib/integer-practice/progression";
import { getLevelById } from "@/lib/integer-practice/levels";
import { GAME_CATALOG } from "@/lib/student-games/catalog";
import DeleteAccountButton from "./delete-account-button";
import DeleteClassButton from "./delete-class-button";
import AdminToast from "./admin-toast";
import AccountActionsToggle from "./account-actions-toggle";
import BulkSelectionControls from "./bulk-selection-controls";
import MasteryRangeInput from "./mastery-range-input";
import {
  updateAccountTypeAction,
  deleteAccountAction,
  toggleDiscoverableAction,
  renameAccountAction,
  updateSchoolNameAction,
  toggleAdminAccessAction,
  addUserToClassAction,
  clearSavedGameProgressAction,
  bulkAccountAction,
  restoreDeletedAccountAction,
  resetPasswordAction,
  deleteOwnedClassAction,
  updateBugReportStatusAction,
  updateSiteCopyAction,
  updateSiteFeatureAudienceAction,
  bulkUpdateSiteFeatureAudienceAction,
  updateIntegerMasterySettingsAction,
  resetIntegerMasterySettingsAction,
} from "./actions";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Notice({ searchParams }) {
  const updated = searchParams?.updated === "1";
  const deleted = searchParams?.deleted === "1";
  const renamed = searchParams?.renamed === "1";
  const restored = searchParams?.restored === "1";
  const discoverability = searchParams?.discoverability;
  const membership = searchParams?.membership;
  const adminAccess = searchParams?.adminAccess;
  const passwordReset = searchParams?.passwordReset === "1";
  const gameProgressCleared = searchParams?.gameProgressCleared;
  const classDeleted = searchParams?.classDeleted === "1";
  const bugReport = searchParams?.bugReport;
  const schoolUpdated = searchParams?.schoolUpdated;
  const bulkAction = searchParams?.bulk;
  const siteFeatureUpdated = searchParams?.siteFeatureUpdated === "1";
  const siteFeatureBulkUpdated = searchParams?.siteFeatureBulkUpdated === "1";
  const siteFeatureBulkCount = Number(searchParams?.siteFeatureBulkCount || 0);
  const siteCopyUpdated = searchParams?.siteCopyUpdated === "1";
  const integerMasteryUpdated = searchParams?.integerMasteryUpdated === "1";
  const integerMasteryReset = searchParams?.integerMasteryReset === "1";
  const bulkCount = Number(searchParams?.bulkCount || 0);
  const bulkSkippedOwners = Number(searchParams?.bulkSkippedOwners || 0);
  const error = searchParams?.error;

  if (!updated && !deleted && !renamed && !restored && !discoverability && !membership && !adminAccess && !passwordReset && !gameProgressCleared && !classDeleted && !bugReport && !schoolUpdated && !bulkAction && !siteFeatureUpdated && !siteFeatureBulkUpdated && !siteCopyUpdated && !integerMasteryUpdated && !integerMasteryReset && !error) {
    return null;
  }

  return (
    <div className={`card ${error ? "noticeError" : "noticeSuccess"}`}>
      {updated ? <p>Account type updated.</p> : null}
      {deleted ? <p>Account deleted.</p> : null}
      {renamed ? <p>Display name updated.</p> : null}
      {restored ? <p>Account restored.</p> : null}
      {discoverability === "shown" ? <p>Teacher is now discoverable.</p> : null}
      {discoverability === "hidden" ? <p>Teacher is now hidden from teacher search.</p> : null}
      {membership === "added" ? <p>User added to class.</p> : null}
      {classDeleted ? <p>Class deleted.</p> : null}
      {adminAccess === "granted" ? <p>Admin access granted.</p> : null}
      {adminAccess === "revoked" ? <p>Admin access revoked.</p> : null}
      {passwordReset ? <p>Password updated.</p> : null}
      {gameProgressCleared ? <p>Saved game progress cleared for {formatGameLabel(gameProgressCleared)}.</p> : null}
      {bugReport === "resolved" ? <p>Bug report marked resolved.</p> : null}
      {bugReport === "open" ? <p>Bug report reopened.</p> : null}
      {schoolUpdated === "set" ? <p>School assignment updated.</p> : null}
      {schoolUpdated === "cleared" ? <p>School assignment cleared.</p> : null}
      {bulkAction === "school" ? <p>School updated for {bulkCount} selected account{bulkCount === 1 ? "" : "s"}.</p> : null}
      {bulkAction === "class" ? <p>Added {bulkCount} selected account{bulkCount === 1 ? "" : "s"} to the class.</p> : null}
      {bulkAction === "delete" ? <p>Deleted {bulkCount} selected account{bulkCount === 1 ? "" : "s"}.</p> : null}
      {siteFeatureUpdated ? <p>Site-wide feature visibility updated.</p> : null}
      {siteFeatureBulkUpdated ? <p>Bulk site-wide feature visibility updated for {siteFeatureBulkCount || 0} feature{siteFeatureBulkCount === 1 ? "" : "s"}.</p> : null}
      {siteCopyUpdated ? <p>Site copy updated.</p> : null}
      {integerMasteryUpdated ? <p>Integer mastery settings saved. New integer practice runs will use them.</p> : null}
      {integerMasteryReset ? <p>Integer mastery settings reset to defaults.</p> : null}
      {bulkSkippedOwners > 0 ? <p>Skipped {bulkSkippedOwners} owner account{bulkSkippedOwners === 1 ? "" : "s"}.</p> : null}
      {error ? <p>Admin tools hit a snag: {decodeURIComponent(error)}</p> : null}
    </div>
  );
}

function AdminDisclosure({ title, description, open = false, children }) {
  return (
    <section className="card">
      <details className="adminSectionDetails" open={open}>
        <summary className="adminSectionSummary">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <span className="adminSectionToggle">
            <span className="showLabel">Show</span>
            <span className="hideLabel">Hide</span>
          </span>
        </summary>
        <div className="adminSectionBody">{children}</div>
      </details>
    </section>
  );
}

function BugReportCard({ report }) {
  return (
    <article className="card adminBugCard">
      <div className="adminUserHeader">
        <div>
          <h3>{report.summary}</h3>
          <p>
            {report.reporter_name || report.reporter_email} · {report.reporter_email}
          </p>
        </div>
        <div className="adminBadgeRow">
          <span className="adminRoleBadge">{report.severity}</span>
          <span className="adminRoleBadge">{report.status}</span>
        </div>
      </div>
      <div className="adminMetaGrid">
        <p><strong>Reported:</strong> {formatDate(report.created_at)}</p>
        <p><strong>Account type:</strong> {report.account_type || "-"}</p>
        <p><strong>Page:</strong> {report.page_path || "-"}</p>
      </div>
      <p><strong>What happened:</strong> {report.details}</p>
      {report.expected_behavior ? (
        <p style={{ marginTop: "0.5rem" }}>
          <strong>Expected:</strong> {report.expected_behavior}
        </p>
      ) : null}
      <div className="ctaRow" style={{ marginTop: "0.85rem" }}>
        <form action={updateBugReportStatusAction} className="adminInlineForm">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="status" value={report.status === "resolved" ? "open" : "resolved"} />
          <button className="btn ghost" type="submit">
            {report.status === "resolved" ? "Reopen" : "Mark Resolved"}
          </button>
        </form>
      </div>
    </article>
  );
}

function InternalEventCard({ event, accountNameByEmail }) {
  return (
    <article className="card adminBugCard">
      <div className="adminUserHeader">
        <div>
          <h3>{formatInternalEventTitle(event.event_key)}</h3>
          <p>
            {accountNameByEmail.get(String(event.user_email || "").toLowerCase()) || "Unknown user"}
            {event.account_type ? ` · ${event.account_type}` : ""}
          </p>
        </div>
        <div className="adminBadgeRow">
          <span className="adminRoleBadge">{formatInternalEventLevel(event.level)}</span>
          <span className="adminRoleBadge">{formatInternalEventSource(event.source)}</span>
        </div>
      </div>
      <div className="adminMetaGrid">
        <p><strong>Logged:</strong> {formatDate(event.created_at)}</p>
      </div>
      <p><strong>Message:</strong> {event.message}</p>
    </article>
  );
}

function normalizeRoleFilter(value) {
  return ["all", "student", "teacher", "owner"].includes(value) ? value : "all";
}

function normalizeSort(value) {
  return ["email", "first_name", "last_name", "recent"].includes(value) ? value : "last_name";
}

function normalizeSchoolFilter(value) {
  if (typeof value !== "string") return "all";
  const trimmed = value.trim();
  return trimmed ? trimmed : "all";
}

function getBestDisplayName(profile, metadata, email, fallback = "-") {
  return (
    profile?.display_name ||
    metadata?.display_name ||
    metadata?.full_name ||
    metadata?.name ||
    (email ? String(email).split("@")[0] : "") ||
    fallback
  );
}

function getDisplayNameWithoutEmail(profile, metadata, fallback = "Unknown user") {
  return (
    profile?.display_name ||
    metadata?.display_name ||
    metadata?.full_name ||
    metadata?.name ||
    fallback
  );
}

function formatInternalEventTitle(eventKey) {
  const labels = {
    teacher_join_code_course_not_found: "Teacher join code course not found",
    teacher_join_code_missing_column: "Teacher join code column missing",
    teacher_join_code_save_failed: "Teacher join code save failed",
    teacher_join_code_duplicate_retry_failed: "Teacher join code generation exhausted retries",
    teacher_co_teacher_course_not_found: "Teacher co-teacher course not found",
    teacher_co_teacher_lookup_failed: "Teacher co-teacher lookup failed",
    teacher_co_teacher_add_failed: "Teacher co-teacher add failed",
    teacher_co_teacher_remove_failed: "Teacher co-teacher removal failed",
    teacher_game_control_course_not_found: "Teacher game control course not found",
    teacher_game_control_update_failed: "Teacher game control update failed",
    join_class_rpc_failed: "Class join RPC failed",
    join_class_admin_lookup_failed: "Class join admin lookup failed",
    join_class_admin_lookup_exception: "Class join admin lookup exception",
    join_class_not_found: "Class join code not found",
    join_class_membership_failed: "Class join membership failed",
    game_session_unsupported_game: "Unsupported game save attempt",
    game_session_forbidden_course: "Blocked score save for class",
    game_session_rpc_failed: "Game session save failed",
    connect4_create_forbidden_course: "Blocked Connect4 class access",
    connect4_create_failed: "Connect4 match creation failed",
    connect4_create_exhausted_codes: "Connect4 invite code generation failed",
    connect4_join_failed: "Connect4 join failed",
    connect4_join_not_found: "Connect4 code not found",
    connect4_fetch_match_failed: "Connect4 match fetch failed",
    connect4_move_match_not_found: "Connect4 move used missing match",
    connect4_move_update_failed: "Connect4 move update failed",
    connect4_finish_stats_failed: "Connect4 final stats save failed",
  };

  return labels[eventKey] || String(eventKey || "Unknown event").replaceAll("_", " ");
}

function formatInternalEventSource(source) {
  const labels = {
    "classes.actions": "Teacher class tools",
    "play.joinClassByCodeAction": "Student join flow",
    "api.play.session": "Game score save API",
    "api.play.connect4": "Connect4 API",
  };

  return labels[source] || source || "Unknown source";
}

function formatInternalEventLevel(level) {
  if (level === "warning") return "Warning";
  if (level === "error") return "Error";
  return level || "Notice";
}

function formatGameLabel(slug) {
  return {
    "2048": "2048",
    connect4: "Connect4",
    integer_practice: "Adding & Subtracting Integers",
    money_counting: "Money Counting",
    minesweeper: "Minesweeper",
    number_compare: "Which Number Is Bigger?",
    skill_builder: "Skill Builder",
    spiral_review: "Spiral Review",
    question_kind_review: "What Kind Of Question Is This?",
    telling_time: "Telling Time",
    slope_intercept: "Slope & Y-Intercept",
    sudoku: "Sudoku",
    comet_typing: "Comet Typing",
    showdown_framework: "Showdown Framework",
    teacher_awards: "Teacher Awards",
    student_created_questions: "Student-Created Questions",
  }[slug] || slug || "Unknown";
}

function percentInput(value) {
  return Math.round(Number(value || 0) * 100);
}

function secondsInput(ms) {
  return Math.round(Number(ms || 0) / 1000);
}

function makeIntegerSimulatorEntry(index, settings, correctPattern) {
  return {
    levelId: 20,
    correct: Boolean(correctPattern[index]),
    responseMs: 5000,
    hintUsed: false,
    attemptsUsed: settings.countRetriesAsCorrect ? 2 : 1,
    skillTags: ["negative_minus_negative", "same_sign_subtraction_pattern", "crosses_zero", "medium_numbers"],
  };
}

function buildIntegerMasterySimulator(settings) {
  const level = getLevelById(20);
  const sampleSize = Math.max(settings.minAttempts, settings.recentWindowSize);
  const allCorrect = Array.from({ length: sampleSize }, () => true);
  const oneShort = Array.from(
    { length: sampleSize },
    (_, index) => index < Math.max(0, settings.minCorrectInRecentWindow - 1)
  );
  const shortStreak = Array.from({ length: sampleSize }, (_, index) => {
    const groupSize = Math.max(1, settings.minCorrectStreak);
    return index % groupSize !== groupSize - 1;
  });

  return [
    {
      label: "Meets saved rule",
      result: evaluateLevelProgression({
        level,
        profile: { rollingHistory: allCorrect.map((_, index) => makeIntegerSimulatorEntry(index, settings, allCorrect)) },
        masterySettings: settings,
      }),
    },
    {
      label: "One recent correct short",
      result: evaluateLevelProgression({
        level,
        profile: { rollingHistory: oneShort.map((_, index) => makeIntegerSimulatorEntry(index, settings, oneShort)) },
        masterySettings: settings,
      }),
    },
    {
      label: "Streak short",
      result: evaluateLevelProgression({
        level,
        profile: { rollingHistory: shortStreak.map((_, index) => makeIntegerSimulatorEntry(index, settings, shortStreak)) },
        masterySettings: settings,
      }),
    },
  ];
}

function normalizeAdminView(value) {
  return ["accounts", "diagnostics", "features", "site-copy", "mastery"].includes(value) ? value : "diagnostics";
}

function summarizeAccountClasses(item) {
  const primaryOwnedClass = item.ownedClasses[0];
  const primaryAssignedClass = item.assignedClasses[0];
  const totalClasses = item.ownedClassCount + item.joinedClassCount;
  const schoolLabel = item.schoolName && item.schoolName !== "-" ? item.schoolName : "No school";

  if (primaryOwnedClass) {
    const extraCount = item.ownedClassCount - 1;
    return {
      title: primaryOwnedClass.title,
      detail:
        extraCount > 0
          ? `Owns ${item.ownedClassCount} classes total`
          : "Owns this class",
      school: schoolLabel,
    };
  }

  if (primaryAssignedClass) {
    const extraCount = item.joinedClassCount - 1;
    return {
      title: primaryAssignedClass.title,
      detail:
        extraCount > 0
          ? `In ${item.joinedClassCount} classes total`
          : `Joined with ${primaryAssignedClass.teacherName}`,
      school: schoolLabel,
    };
  }

  return {
    title: "No classes yet",
    detail:
      totalClasses > 0
        ? `${totalClasses} class relationships found`
        : "No class ownership or enrollment",
    school: schoolLabel,
  };
}

export default async function AdminPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const searchQuery = String(qs.q || "").trim().toLowerCase();
  const roleFilter = normalizeRoleFilter(String(qs.role || "all"));
  const sortBy = normalizeSort(String(qs.sort || "last_name"));
  const schoolFilter = normalizeSchoolFilter(qs.school);
  const adminView = normalizeAdminView(String(qs.view || "diagnostics"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/admin");
  }

  if (!canAccessAdminArea(user)) {
    redirect("/");
  }

  const admin = createAdminClient();
  const adminContext = await getAdminAccessContext(user, admin);
  const canViewDiagnostics = adminContext.isOwner;
  const effectiveAdminView = canViewDiagnostics ? adminView : "accounts";
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });

  let users = [];
  let courseOptions = [];
  let bugReports = [];
  let bugReportError = null;
  let internalEvents = [];
  let internalEventError = null;
  let recentSessions = [];
  let recentSessionsError = null;
  const accountNameByEmail = new Map();

  if (!error) {
    const authUsers = (data?.users || []).filter(
      (authUser) => authUser?.app_metadata?.account_deleted !== true
    );
    const ids = authUsers.map((item) => item.id);

    if (ids.length) {
      const [{ data: profiles }, { data: courses }, { data: memberships }, bugReportResult, eventResult, recentSessionResult, { data: dbSavedProgress }] = await Promise.all([
        admin
          .from("profiles")
          .select("id, display_name, school_name, account_type, discoverable, timezone")
          .in("id", ids),
        admin
          .from("courses")
          .select("id, owner_id, title, class_name")
          .order("title", { ascending: true }),
        admin
          .from("student_course_memberships")
          .select("profile_id, course_id")
          .in("profile_id", ids),
        admin
          .from("bug_reports")
          .select("id, reporter_email, reporter_name, account_type, page_path, severity, summary, details, expected_behavior, status, created_at")
          .order("created_at", { ascending: false })
          .limit(30),
        admin
          .from("internal_event_logs")
          .select("id, event_key, source, level, message, user_email, account_type, context, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        admin
          .from("game_sessions")
          .select("id, game_slug, player_id, course_id, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        admin
          .from("saved_game_progress")
          .select("user_id, game_slug")
          .in("user_id", ids),
      ]);

      bugReports = bugReportResult.data || [];
      bugReportError = bugReportResult.error || null;
      internalEvents = eventResult.data || [];
      internalEventError = eventResult.error || null;
      recentSessions = recentSessionResult.data || [];
      recentSessionsError = recentSessionResult.error || null;

      // Build a map of user_id → Set<game_slug> from the DB table.
      const dbSavedSlugsByUser = new Map();
      for (const row of dbSavedProgress || []) {
        const existing = dbSavedSlugsByUser.get(row.user_id) || new Set();
        existing.add(row.game_slug);
        dbSavedSlugsByUser.set(row.user_id, existing);
      }

      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const visibleAuthUsers = adminContext.isOwner
        ? authUsers
        : authUsers.filter((authUser) => {
            const profile = profilesById.get(authUser.id);
            const schoolName = String(profile?.school_name || authUser?.user_metadata?.school_name || "").trim();
            return schoolName && schoolName === adminContext.schoolName;
          });
      for (const authUser of visibleAuthUsers) {
        if (!authUser.email) continue;
        accountNameByEmail.set(
          String(authUser.email).toLowerCase(),
          getDisplayNameWithoutEmail(
            profilesById.get(authUser.id),
            authUser.user_metadata || {}
          )
        );
      }
      const visibleUserIds = new Set(visibleAuthUsers.map((authUser) => authUser.id));
      const visibleCourses = adminContext.isOwner
        ? courses || []
        : (courses || []).filter((course) => {
            const ownerProfile = profilesById.get(course.owner_id);
            return String(ownerProfile?.school_name || "").trim() === adminContext.schoolName;
          });
      const coursesById = new Map(visibleCourses.map((course) => [course.id, course]));
      const membershipsByProfileId = new Map();
      const ownedClassesById = new Map();
      const ownedCoursesByOwnerId = new Map();
      const joinedClassesById = new Map();

      for (const course of visibleCourses) {
        ownedClassesById.set(course.owner_id, (ownedClassesById.get(course.owner_id) || 0) + 1);
        const current = ownedCoursesByOwnerId.get(course.owner_id) || [];
        current.push(course);
        ownedCoursesByOwnerId.set(course.owner_id, current);
      }

      for (const membership of memberships || []) {
        if (!visibleUserIds.has(membership.profile_id) || !coursesById.has(membership.course_id)) continue;
        joinedClassesById.set(
          membership.profile_id,
          (joinedClassesById.get(membership.profile_id) || 0) + 1
        );

        const current = membershipsByProfileId.get(membership.profile_id) || [];
        current.push(membership);
        membershipsByProfileId.set(membership.profile_id, current);
      }

      courseOptions = visibleCourses.map((course) => {
        const ownerProfile = profilesById.get(course.owner_id);
        const ownerAuthUser = visibleAuthUsers.find((authUser) => authUser.id === course.owner_id);
        const ownerDisplayName = getBestDisplayName(
          ownerProfile,
          ownerAuthUser?.user_metadata,
          ownerAuthUser?.email,
          ""
        );
        return {
          id: course.id,
          label: `${course.title} · ${course.class_name}${ownerDisplayName ? ` · ${ownerDisplayName}` : ""}`,
        };
      });

      users = visibleAuthUsers.map((authUser) => {
        const profile = profilesById.get(authUser.id) || {};
        const metadata = authUser.user_metadata || {};
        const displayName = getBestDisplayName(profile, metadata, authUser.email, "-");
        const { firstName, lastName } = splitDisplayName(displayName === "-" ? "" : displayName);
        const accountType = profile.account_type || metadata.account_type || "teacher";
        const isOwner = isOwnerUser(authUser);
        const isBootstrapOwner = isOwnerEmail(authUser.email || "");
        const isAdmin = isOwner || isAdminUser(authUser);
        const providers = Array.from(
          new Set(
            (authUser.identities || [])
              .map((identity) => identity?.provider)
              .filter(Boolean)
          )
        );
        const providerLabel = providers.length > 0 ? providers.join(", ") : authUser.app_metadata?.provider || "email";
        const isGoogleOnly =
          providers.length > 0
            ? providers.every((provider) => provider === "google")
            : authUser.app_metadata?.provider === "google";
        const canResetPassword = !isGoogleOnly;
        const ownedClasses = (ownedCoursesByOwnerId.get(authUser.id) || []).map((course) => ({
          id: course.id,
          title: course.title || "Untitled class",
          className: course.class_name || "",
        }));
        const assignedClasses = (membershipsByProfileId.get(authUser.id) || []).map((membership) => {
          const course = coursesById.get(membership.course_id);
          const ownerProfile = course ? profilesById.get(course.owner_id) : null;
          const ownerAuthUser = course ? authUsers.find((entry) => entry.id === course.owner_id) : null;

          return {
            id: membership.course_id,
            title: course?.title || "Untitled class",
            className: course?.class_name || "",
            teacherName: getBestDisplayName(
              ownerProfile,
              ownerAuthUser?.user_metadata,
              ownerAuthUser?.email,
              "Unknown teacher"
            ),
          };
        });

        return {
          id: authUser.id,
          email: authUser.email || "-",
          createdAt: authUser.created_at,
          lastSignInAt: authUser.last_sign_in_at,
          displayName,
          firstName,
          lastName,
          schoolName: profile.school_name || metadata.school_name || "-",
          timezone: profile.timezone || "-",
          discoverable: profile.discoverable ?? metadata.discoverable ?? false,
          accountType,
          isOwner,
          isBootstrapOwner,
          isAdmin,
          providerLabel,
          canResetPassword,
          savedGameSlugs: [
            ...new Set([
              ...Object.keys(
                authUser?.user_metadata?.saved_games &&
                typeof authUser.user_metadata.saved_games === "object"
                  ? authUser.user_metadata.saved_games
                  : {}
              ),
              ...(dbSavedSlugsByUser.get(authUser.id) || []),
            ]),
          ],
          ownedClassCount: ownedClassesById.get(authUser.id) || 0,
          ownedClasses,
          joinedClassCount: joinedClassesById.get(authUser.id) || 0,
          assignedClasses,
        };
      });
    }
  }

  const schoolOptions = [...new Set(
    users
      .map((item) => item.schoolName)
      .filter((value) => value && value !== "-")
  )].sort((a, b) => a.localeCompare(b));

  users = users.filter((item) => {
    const matchesRole =
      roleFilter === "all"
        ? true
        : roleFilter === "owner"
          ? item.isOwner
          : item.accountType === roleFilter;

    if (!matchesRole) return false;
    if (schoolFilter !== "all" && item.schoolName !== schoolFilter) return false;
    if (!searchQuery) return true;

    const haystack = [item.displayName, item.firstName, item.lastName, item.email, item.schoolName, item.id]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery);
  });

  users.sort((a, b) => {
    if (sortBy === "first_name") {
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    }
    if (sortBy === "last_name") {
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    }
    if (sortBy === "recent") {
      return new Date(b.lastSignInAt || 0).getTime() - new Date(a.lastSignInAt || 0).getTime();
    }
    return String(a.email).localeCompare(String(b.email));
  });

  const schoolSummaries = Array.from(
    users.reduce((map, item) => {
      if (!item.schoolName || item.schoolName === "-") return map;
      const current = map.get(item.schoolName) || {
        schoolName: item.schoolName,
        total: 0,
        students: 0,
        teachers: 0,
        admins: 0,
      };
      current.total += 1;
      if (item.accountType === "student") {
        current.students += 1;
      } else {
        current.teachers += 1;
      }
      if (item.isAdmin || item.isBootstrapOwner) {
        current.admins += 1;
      }
      map.set(item.schoolName, current);
      return map;
    }, new Map()).values()
  ).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.schoolName.localeCompare(b.schoolName);
  });

  const now = Date.now();
  const recentWindowSessions = recentSessions.filter((session) => {
    if (!session?.created_at) return false;
    return now - new Date(session.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
  });
  const sessionCountByGame = new Map();
  for (const session of recentWindowSessions) {
    sessionCountByGame.set(
      session.game_slug,
      (sessionCountByGame.get(session.game_slug) || 0) + 1
    );
  }
  const topGamesLast7Days = [...sessionCountByGame.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, count]) => ({
      slug,
      label: formatGameLabel(slug),
      count,
    }));
  const activePlayerCountLast7Days = new Set(
    recentWindowSessions.map((session) => session.player_id).filter(Boolean)
  ).size;
  const activeCourseCountLast7Days = new Set(
    recentWindowSessions.map((session) => session.course_id).filter(Boolean)
  ).size;
  const fiveWeekCutoff = now - 35 * 24 * 60 * 60 * 1000;
  const recentInternalEvents = internalEvents.filter((event) => {
    if (!event?.created_at) return false;
    if (!["error", "warning"].includes(event.level)) return false;
    return new Date(event.created_at).getTime() >= fiveWeekCutoff;
  });
  const olderInternalEvents = internalEvents.filter((event) => {
    if (!event?.created_at) return false;
    if (!["error", "warning"].includes(event.level)) return false;
    return new Date(event.created_at).getTime() < fiveWeekCutoff;
  });
  const managedSiteGames = GAME_CATALOG.filter((game) => game.category !== "admin");
  const [siteFeatureConfig, siteCopy, integerMasterySettings] = canViewDiagnostics
    ? await Promise.all([getSiteFeatureConfig(admin), getSiteCopy(admin), getIntegerMasterySettings(admin)])
    : [{ audienceBySlug: {} }, null, null];
  const integerMasterySimulator = integerMasterySettings
    ? buildIntegerMasterySimulator(integerMasterySettings)
    : [];
  const openBugReports = bugReports.filter((report) => report.status !== "resolved");
  const resolvedBugReports = bugReports.filter((report) => report.status === "resolved");

  return (
    <div className="stack adminStack">
      <section className="card">
        <h1>{adminContext.isOwner ? "Owner Admin" : "Admin"}</h1>
        <p>
          {adminContext.isOwner
            ? "Manage MathClaw accounts without digging through Supabase. This is just for the owner account."
            : adminContext.hasSchoolScope
              ? `Manage teachers, students, and classes in ${adminContext.schoolName}.`
              : "Your admin account needs a school assignment before school-scoped tools can load."}
        </p>
      </section>

      <Notice searchParams={qs} />

      {!adminContext.isOwner && !adminContext.hasSchoolScope ? (
        <section className="card noticeError">
          <p>No school is assigned to this admin account yet, so school-scoped admin tools are unavailable.</p>
        </section>
      ) : null}

      <section className="card">
        <div className="adminSummaryGrid">
          <div className="card adminSummaryCard">
            <h3>Total Accounts</h3>
            <p className="adminStat">{users.length}</p>
          </div>
          <div className="card adminSummaryCard">
            <h3>Students</h3>
            <p className="adminStat">{users.filter((item) => item.accountType === "student").length}</p>
          </div>
          <div className="card adminSummaryCard">
            <h3>Teachers</h3>
            <p className="adminStat">{users.filter((item) => item.accountType !== "student").length}</p>
          </div>
          {canViewDiagnostics ? (
            <>
              <div className="card adminSummaryCard">
                <h3>Open Bug Reports</h3>
                <p className="adminStat">{bugReports.filter((item) => item.status !== "resolved").length}</p>
              </div>
              <div className="card adminSummaryCard">
                <h3>Recent Internal Errors</h3>
                <p className="adminStat">
                  {recentInternalEvents.length}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {canViewDiagnostics ? (
        <section className="card adminSectionSwitcher">
          <h2>Admin Sections</h2>
          <p>Choose the admin tools you want to use. Everything above this stays visible while this changes the workspace below.</p>
          <div className="adminViewSwitch">
            <a
              className={`btn ${effectiveAdminView === "diagnostics" ? "primary" : "ghost"}`}
              href="/admin?view=diagnostics"
            >
              Bugs and Internal Errors
            </a>
            <a
              className={`btn ${effectiveAdminView === "site-copy" ? "primary" : "ghost"}`}
              href="/admin?view=site-copy"
            >
              Editable Site Copy
            </a>
            <a
              className={`btn ${effectiveAdminView === "features" ? "primary" : "ghost"}`}
              href="/admin?view=features"
            >
              Feature Rollout Controls
            </a>
            <a
              className={`btn ${effectiveAdminView === "mastery" ? "primary" : "ghost"}`}
              href="/admin?view=mastery"
            >
              Mastery Settings
            </a>
            <a
              className={`btn ${effectiveAdminView === "accounts" ? "primary" : "ghost"}`}
              href="/admin?view=accounts"
            >
              User Information
            </a>
          </div>
        </section>
      ) : null}

      {canViewDiagnostics && effectiveAdminView === "features" ? (
        <section className="card">
          <h2>Feature Rollout Controls</h2>
          <p>
            Use these controls to hide features site-wide or release them to teachers before students.
          </p>
          <article className="card" style={{ background: "#fff", marginTop: "1rem" }}>
            <p>Set each feature to live for everyone, visible only to teachers, or disabled site-wide.</p>
            <form
              id="bulkFeatureUpdateForm"
              action={bulkUpdateSiteFeatureAudienceAction}
              className="classGameControlItem isEnabled"
              style={{ marginTop: "0.85rem" }}
            >
              <div className="classGameControlCopy">
                <div className="classGameControlTopline">
                  <strong>Bulk Update Selected Features</strong>
                  <span className="pill classGameStatusPill isEnabled">Owner control</span>
                </div>
                <span>Check the features you want below, then apply one rollout state to that selected set.</span>
              </div>
              <select className="input" name="bulk_audience" defaultValue="everyone" style={{ maxWidth: "14rem" }}>
                <option value="everyone">Everyone</option>
                <option value="teachers_only">Teachers only</option>
                <option value="disabled">Disabled site-wide</option>
              </select>
              <button className="btn primary" type="submit">
                Apply To Selected
              </button>
            </form>
            <div className="list" style={{ marginTop: "0.85rem" }}>
              {managedSiteGames.map((game) => (
                <form key={game.slug} action={updateSiteFeatureAudienceAction} className="classGameControlItem isEnabled">
                  <input
                    type="checkbox"
                    name="selected_game_slugs"
                    value={game.slug}
                    form="bulkFeatureUpdateForm"
                    aria-label={`Select ${game.name} for bulk update`}
                  />
                  <input type="hidden" name="game_slug" value={game.slug} />
                  <div className="classGameControlCopy">
                    <div className="classGameControlTopline">
                      <strong>{game.name}</strong>
                      <span className="pill classGameStatusPill isEnabled">
                        {describeSiteAudience(siteFeatureConfig.audienceBySlug?.[game.slug])}
                      </span>
                    </div>
                    <span>{game.description}</span>
                  </div>
                  <select
                    className="input"
                    name="audience"
                    defaultValue={siteFeatureConfig.audienceBySlug?.[game.slug] || "everyone"}
                    style={{ maxWidth: "14rem" }}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="teachers_only">Teachers only</option>
                    <option value="disabled">Disabled site-wide</option>
                  </select>
                  <button className="btn primary" type="submit">
                    Save
                  </button>
                </form>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {canViewDiagnostics && effectiveAdminView === "site-copy" ? (
        <section className="card">
          <h2>Editable Site Copy</h2>
          <p>Update public-facing copy without leaving MathClaw.</p>
          <article className="card" style={{ background: "#fff", marginTop: "1rem" }}>
            <p>Update the homepage banner, workspace copy, About Us text, and mission statement from here.</p>
            <form action={updateSiteCopyAction} className="list" style={{ marginTop: "0.85rem" }}>
              <label>
                Homepage banner
                <input className="input" name="home_banner" defaultValue={siteCopy?.homeBanner || ""} />
              </label>
              <label>
                Homepage welcome message
                <input className="input" name="home_welcome" defaultValue={siteCopy?.homeWelcome || ""} />
              </label>
              <label>
                Homepage intro
                <textarea className="input" name="home_intro" rows={3} defaultValue={siteCopy?.homeIntro || ""} />
              </label>
              <label>
                Teacher card copy
                <textarea className="input" name="teacher_card_copy" rows={3} defaultValue={siteCopy?.teacherCardCopy || ""} />
              </label>
              <label>
                Student card copy
                <textarea className="input" name="student_card_copy" rows={3} defaultValue={siteCopy?.studentCardCopy || ""} />
              </label>
              <input type="hidden" name="about_title" defaultValue={siteCopy?.aboutTitle || ""} />
              <label>
                Mission statement
                <textarea className="input" name="mission_statement" rows={3} defaultValue={siteCopy?.missionStatement || ""} />
              </label>
              <label>
                About Us text
                <textarea className="input" name="about_story" rows={5} defaultValue={siteCopy?.aboutStory || ""} />
              </label>
              <div className="ctaRow">
                <button className="btn primary" type="submit">
                  Save Site Copy
                </button>
              </div>
            </form>
          </article>
        </section>
      ) : null}

      {canViewDiagnostics && effectiveAdminView === "mastery" ? (
        <section className="card">
          <h2>Mastery Settings</h2>
          <p>
            Global progression rules that apply across all adaptive practice games. Save here to update mastery thresholds for all supported games.
          </p>
          <div className="featureGrid" style={{ marginTop: "1rem" }}>
            <article className="card" style={{ background: "#fff" }}>
              <h3>Level-Up Rules</h3>
              <form action={updateIntegerMasterySettingsAction} className="list" style={{ marginTop: "0.85rem" }}>
                <MasteryRangeInput label="Minimum attempts before checking mastery" name="min_attempts" min="1" max="50" step="1" defaultValue={integerMasterySettings.minAttempts} />
                <MasteryRangeInput label="Recent window size" name="recent_window_size" min="1" max="50" step="1" defaultValue={integerMasterySettings.recentWindowSize} />
                <MasteryRangeInput label="Correct answers needed in that window" name="min_correct_in_recent_window" min="1" max="50" step="1" defaultValue={integerMasterySettings.minCorrectInRecentWindow} />
                <MasteryRangeInput label="Correct streak needed" name="min_correct_streak" min="0" max="30" step="1" defaultValue={integerMasterySettings.minCorrectStreak} />
                <MasteryRangeInput label="Blended accuracy required" suffix="%" name="min_blended_accuracy" min="50" max="100" step="1" defaultValue={percentInput(integerMasterySettings.minBlendedAccuracy)} />
                <MasteryRangeInput label="Historical weight" suffix="%" name="historical_weight" min="0" max="100" step="5" defaultValue={percentInput(integerMasterySettings.historicalWeight)} />
                <label className="toggleRow">
                  <input type="checkbox" name="count_retries_as_correct" defaultChecked={integerMasterySettings.countRetriesAsCorrect} />
                  Count retry-correct answers as correct for mastery
                </label>
                <label className="toggleRow">
                  <input type="checkbox" name="use_hint_gate" defaultChecked={integerMasterySettings.useHintGate} />
                  Use hint-rate gate
                </label>
                <MasteryRangeInput label="Maximum hint rate" suffix="%" name="max_hint_rate" min="0" max="100" step="5" defaultValue={percentInput(integerMasterySettings.maxHintRate)} />
                <label className="toggleRow">
                  <input type="checkbox" name="use_speed_gate" defaultChecked={integerMasterySettings.useSpeedGate} />
                  Use speed gate
                </label>
                <MasteryRangeInput label="Maximum median response time" suffix=" seconds" name="max_median_response_seconds" min="1" max="30" step="1" defaultValue={secondsInput(integerMasterySettings.maxMedianResponseMs)} />
                <MasteryRangeInput label="Close-state buffer" suffix="%" name="close_buffer" min="0" max="50" step="1" defaultValue={percentInput(integerMasterySettings.closeBuffer)} />
                <div className="ctaRow">
                  <button className="btn primary" type="submit">Save Mastery Settings</button>
                </div>
              </form>
              <form action={resetIntegerMasterySettingsAction} className="ctaRow" style={{ marginTop: "0.75rem" }}>
                <button className="btn ghost" type="submit">Reset To Defaults</button>
              </form>
            </article>
            <article className="card" style={{ background: "#fff" }}>
              <h3>Mastery Simulator</h3>
              <p>
                This quick check uses Level 20 sample histories so you can see whether the saved rules feel too strict or too loose.
              </p>
              <div className="list" style={{ marginTop: "0.85rem" }}>
                {integerMasterySimulator.map((item) => (
                  <div key={item.label} className="dataWallNote">
                    <strong>{item.label}</strong>
                    <p>
                      {item.result.canLevelUp ? "Levels up" : "Stays put"} · {item.result.reasons.recentCorrectCount}/{item.result.reasons.recentWindowSize} recent correct · {Math.round(item.result.reasons.blendedAccuracy * 100)}% blended
                    </p>
                    {!item.result.canLevelUp && item.result.blockedReasons[0] ? (
                      <p>{item.result.blockedReasons[0]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="dataWallNote" style={{ marginTop: "0.85rem" }}>
                <strong>Last saved</strong>
                <p>{integerMasterySettings.updatedAt ? formatDate(integerMasterySettings.updatedAt) : "Defaults are active."}</p>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {canViewDiagnostics && effectiveAdminView === "diagnostics" ? (
        <>
          <AdminDisclosure
            title="Traffic & App Usage"
            description="This owner view turns recent usage and silent-failure signals into a practical product-direction checkpoint."
          >
            <div className="adminSummaryGrid" style={{ marginTop: "1rem" }}>
              <div className="card adminSummaryCard" style={{ background: "#fff" }}>
                <h3>Sessions Last 7 Days</h3>
                <p className="adminStat">{recentWindowSessions.length}</p>
              </div>
              <div className="card adminSummaryCard" style={{ background: "#fff" }}>
                <h3>Active Players</h3>
                <p className="adminStat">{activePlayerCountLast7Days}</p>
              </div>
              <div className="card adminSummaryCard" style={{ background: "#fff" }}>
                <h3>Active Classes</h3>
                <p className="adminStat">{activeCourseCountLast7Days}</p>
              </div>
              <div className="card adminSummaryCard" style={{ background: "#fff" }}>
                <h3>Errors Last 5 Weeks</h3>
                <p className="adminStat">{recentInternalEvents.length}</p>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <article className="card" style={{ background: "#fff" }}>
                <h3>Where Students Are Spending Time</h3>
                {recentSessionsError ? (
                  <p>Recent session data could not load.</p>
                ) : topGamesLast7Days.length === 0 ? (
                  <p>No recent session activity yet.</p>
                ) : (
                  <div className="list" style={{ marginTop: "0.75rem" }}>
                    {topGamesLast7Days.map((item) => (
                      <div key={item.slug} className="dataWallRow">
                        <strong>{item.label}</strong>
                        <span>{item.count} sessions</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          </AdminDisclosure>

          <AdminDisclosure
            title="Internal Error Log"
            description="These are silent failures captured automatically from important flows like class joins, score saves, and Connect4."
          >
            {internalEventError ? <p>Could not load internal event logs: {internalEventError.message}</p> : null}
            {!internalEventError && internalEvents.length === 0 ? <p>No internal errors logged yet.</p> : null}
            {!internalEventError && internalEvents.length > 0 ? (
              <>
                {recentInternalEvents.length > 0 ? (
                  <div className="adminBugList adminTwoColumnLogGrid">
                    {recentInternalEvents.map((event) => (
                      <InternalEventCard key={event.id} event={event} accountNameByEmail={accountNameByEmail} />
                    ))}
                  </div>
                ) : (
                  <p>No internal errors from the last 5 weeks.</p>
                )}
                {olderInternalEvents.length > 0 ? (
                  <details className="adminNestedSectionDetails">
                    <summary className="adminNestedSectionSummary">
                      <span>Older Internal Errors</span>
                      <span className="adminSectionToggle">
                        <span className="showLabel">Show</span>
                        <span className="hideLabel">Hide</span>
                      </span>
                    </summary>
                    <div className="adminBugList adminTwoColumnLogGrid">
                      {olderInternalEvents.map((event) => (
                        <InternalEventCard key={event.id} event={event} accountNameByEmail={accountNameByEmail} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </AdminDisclosure>

          <AdminDisclosure
            title="Bug Reports"
            description="Reports submitted from inside MathClaw land here so you can spot repeat issues quickly."
            open={Boolean(qs.bugReport)}
          >
            {bugReportError ? <p>Could not load bug reports: {bugReportError.message}</p> : null}
            {!bugReportError && bugReports.length === 0 ? <p>No bug reports yet.</p> : null}
            {!bugReportError && bugReports.length > 0 ? (
              <>
                {openBugReports.length > 0 ? (
                  <div className="adminBugList adminTwoColumnLogGrid">
                    {openBugReports.map((report) => (
                      <BugReportCard key={report.id} report={report} />
                    ))}
                  </div>
                ) : (
                  <p>No open bug reports.</p>
                )}
                {resolvedBugReports.length > 0 ? (
                  <details className="adminNestedSectionDetails">
                    <summary className="adminNestedSectionSummary">
                      <span>Resolved Bug Reports</span>
                      <span className="adminSectionToggle">
                        <span className="showLabel">Show</span>
                        <span className="hideLabel">Hide</span>
                      </span>
                    </summary>
                    <div className="adminBugList adminTwoColumnLogGrid">
                      {resolvedBugReports.map((report) => (
                        <BugReportCard key={report.id} report={report} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </AdminDisclosure>
        </>
      ) : null}

      {effectiveAdminView === "accounts" && adminContext.hasSchoolScope ? (
        <>
          {schoolSummaries.length > 0 ? (
            <AdminDisclosure
              title={schoolFilter === "all" ? "School Snapshot" : `${schoolFilter} Snapshot`}
              description={
                schoolFilter === "all"
                  ? "Quick counts by school so you can spot where the most accounts and admins live."
                  : "Quick counts for the currently selected school."
              }
            >
              <div className="adminSchoolGrid">
                {(schoolFilter === "all" ? schoolSummaries.slice(0, 8) : schoolSummaries).map((school) => (
                  <article key={school.schoolName} className="card adminSchoolCard">
                    <h3>{school.schoolName}</h3>
                    <div className="adminSchoolStats">
                      <p><strong>Total:</strong> {school.total}</p>
                      <p><strong>Teachers:</strong> {school.teachers}</p>
                      <p><strong>Students:</strong> {school.students}</p>
                      <p><strong>Admins:</strong> {school.admins}</p>
                    </div>
                  </article>
                ))}
              </div>
            </AdminDisclosure>
          ) : null}

          <AdminDisclosure title="User Information">
        <form className="adminFilterBar adminFilterBarWide" method="get">
          <input type="hidden" name="view" value="accounts" />
          <label className="stack">
            <span>Search</span>
            <input
              className="input"
              type="search"
              name="q"
              placeholder="Find by name, email, school, or user ID"
              defaultValue={qs.q || ""}
            />
          </label>
          <label className="stack">
            <span>Role</span>
            <select className="input" name="role" defaultValue={roleFilter}>
              <option value="all">All accounts</option>
              <option value="teacher">Teachers</option>
              <option value="student">Students</option>
              <option value="owner">Owner accounts</option>
            </select>
          </label>
          <label className="stack">
            <span>Sort</span>
            <select className="input" name="sort" defaultValue={sortBy}>
              <option value="email">Email (A-Z)</option>
              <option value="first_name">First Name (A-Z)</option>
              <option value="last_name">Last Name (A-Z)</option>
              <option value="recent">Recent Sign-In</option>
            </select>
          </label>
          <label className="stack">
            <span>School</span>
            <select className="input" name="school" defaultValue={schoolFilter}>
              <option value="all">All schools</option>
              {schoolOptions.map((schoolName) => (
                <option key={schoolName} value={schoolName}>
                  {schoolName}
                </option>
              ))}
            </select>
          </label>
          <div className="ctaRow adminFilterActions">
            <button className="btn" type="submit">Apply Filters</button>
            <a className="btn ghost" href="/admin">Clear</a>
          </div>
        </form>
        <div className="adminSubnav">
          <a className="btn ghost" href="/admin/deleted">Deleted Accounts</a>
        </div>
        {error ? <p>Could not load accounts: {error.message}</p> : null}
        {!error && users.length === 0 ? <p>No accounts yet.</p> : null}
        {!error && users.length > 0 ? (
          <>
            <form id="adminBulkActionForm" action={bulkAccountAction} className="card adminBulkActionCard">
              <div className="adminBulkActionGrid">
                <label className="stack">
                  <span>Bulk action</span>
                  <select className="input" name="bulk_action" defaultValue="">
                    <option value="">Choose an action</option>
                    <option value="school">Assign school</option>
                    <option value="class">Add to class</option>
                    <option value="delete">Delete accounts</option>
                  </select>
                </label>
                <label className="stack">
                  <span>Existing school</span>
                  <select className="input" name="bulk_school_name" defaultValue="">
                    <option value="">No school selected</option>
                    <option value="__clear__">Clear school</option>
                    {(adminContext.isOwner ? schoolOptions : schoolOptions.filter((schoolName) => schoolName === adminContext.schoolName)).map((schoolName) => (
                      <option key={schoolName} value={schoolName}>
                        {schoolName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack">
                  <span>Or add a new school</span>
                  <input
                    className="input"
                    type="text"
                    name="bulk_new_school_name"
                    placeholder="Type a new school name"
                  />
                </label>
                <label className="stack">
                  <span>Class</span>
                  <select className="input" name="bulk_course_id" defaultValue="">
                    <option value="">Choose a class</option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ctaRow adminInlineEditorRow adminSingleAction">
                  <button className="btn" type="submit">Apply to Selected</button>
                </div>
              </div>
              <p className="adminBulkHelp">
                Check the boxes next to the accounts you want, then choose one bulk action here. For school updates, a typed new school overrides the existing-school dropdown, and `Clear school` removes school assignments.
              </p>
            </form>
            <BulkSelectionControls />
            <div className="adminUserList">
            {users.map((item) => {
              const classSummary = summarizeAccountClasses(item);

              return (
                <div key={item.id} className="adminSelectableCard">
                  <label className="adminBulkCheckbox" aria-label={`Select ${item.displayName}`}>
                    <input
                      type="checkbox"
                      name="selected_user_ids"
                      value={item.id}
                      form="adminBulkActionForm"
                    />
                  </label>
                  <details className="card adminUserCard adminUserDetails">
                    <summary className="adminUserSummary">
                      <div className="adminUserSummaryMain">
                        <div>
                          <h3>{item.displayName}</h3>
                          <p className="adminUserSummaryClass">{classSummary.title}</p>
                          <p className="adminUserSummaryMeta">
                            <span>{classSummary.detail}</span>
                            <span className="adminSummaryDot">·</span>
                            <span><strong>School:</strong> {classSummary.school}</span>
                          </p>
                        </div>
                        <div className="adminBadgeRow">
                          <span className="adminRoleBadge">{item.accountType === "student" ? "Student" : "Teacher"}</span>
                          {item.isBootstrapOwner ? <span className="adminRoleBadge">Owner</span> : null}
                        {item.isAdmin && !item.isBootstrapOwner ? <span className="adminRoleBadge">Admin</span> : null}
                          <span className="adminSummaryToggleText">
                            <span className="showLabel">Show Details</span>
                            <span className="hideLabel">Hide Details</span>
                          </span>
                        </div>
                      </div>
                    </summary>
                    <div className="adminUserDetailsBody">
                      <div className="adminUserHeader">
                        <div>
                          <h3>{item.displayName}</h3>
                          <p>{item.email}</p>
                        </div>
                        <div className="adminBadgeRow">
                          <span className="adminRoleBadge">{item.accountType === "student" ? "Student" : "Teacher"}</span>
                          {item.isBootstrapOwner ? <span className="adminRoleBadge">Owner</span> : null}
                          {item.isAdmin && !item.isBootstrapOwner ? <span className="adminRoleBadge">Admin</span> : null}
                        </div>
                      </div>
                    <form action={renameAccountAction} className="adminRenameForm">
                      <input type="hidden" name="user_id" value={item.id} />
                      <div className="adminNameGrid">
                        <label className="stack">
                          <span>First name</span>
                          <input className="input" type="text" name="first_name" defaultValue={item.firstName} placeholder="First name" />
                        </label>
                        <label className="stack">
                          <span>Last name</span>
                          <input className="input" type="text" name="last_name" defaultValue={item.lastName} placeholder="Last name" />
                        </label>
                        <div className="ctaRow adminInlineEditorRow">
                          <button className="btn ghost" type="submit">Save Name</button>
                        </div>
                      </div>
                    </form>
                    <form action={updateSchoolNameAction} className="adminRenameForm">
                      <input type="hidden" name="user_id" value={item.id} />
                      <div className="adminSchoolEditGrid">
                        <label className="stack">
                          <span>Existing school</span>
                          <select
                            className="input"
                            name="school_name"
                            defaultValue={item.schoolName === "-" ? "" : item.schoolName}
                          >
                            <option value="">No school</option>
                            {(adminContext.isOwner ? schoolOptions : schoolOptions.filter((schoolName) => schoolName === adminContext.schoolName)).map((schoolName) => (
                              <option key={schoolName} value={schoolName}>
                                {schoolName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="stack">
                          <span>Or add a new school</span>
                          <input
                            className="input"
                            type="text"
                            name="new_school_name"
                            placeholder="Type a new school name"
                          />
                        </label>
                        <div className="ctaRow adminInlineEditorRow adminSingleAction">
                          <button className="btn ghost" type="submit">Save School</button>
                        </div>
                      </div>
                    </form>
                    <div className="adminMetaGrid">
                      <p><strong>First:</strong> {item.firstName || "-"}</p>
                      <p><strong>Last:</strong> {item.lastName || "-"}</p>
                      <p><strong>School:</strong> {item.schoolName}</p>
                      <p><strong>Timezone:</strong> {item.timezone}</p>
                      <p><strong>Created:</strong> {formatDate(item.createdAt)}</p>
                      <p><strong>Last sign-in:</strong> {formatDate(item.lastSignInAt)}</p>
                      <p><strong>Sign-in:</strong> {item.providerLabel}</p>
                      <p><strong>Owned classes:</strong> {item.ownedClassCount}</p>
                      <p><strong>Joined classes:</strong> {item.joinedClassCount}</p>
                      <p><strong>Teacher search:</strong> {item.accountType === "student" ? "Not applicable" : item.discoverable ? "Visible" : "Hidden"}</p>
                    </div>
                    <p className="adminUserId"><strong>User ID:</strong> {item.id}</p>
                    {item.ownedClasses.length > 0 ? (
                      <div className="adminAssignmentBlock">
                        <p><strong>Owned classes</strong></p>
                        <div className="adminAssignmentList">
                          {item.ownedClasses.map((ownedClass) => (
                            <div key={ownedClass.id} className="adminAssignmentItem">
                              <strong>{ownedClass.title}</strong>
                              <span>{ownedClass.className || "Class name not set"}</span>
                              <form action={deleteOwnedClassAction} className="adminInlineForm">
                                <input type="hidden" name="course_id" value={ownedClass.id} />
                                <DeleteClassButton label="Delete Class" />
                              </form>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.assignedClasses.length > 0 ? (
                      <div className="adminAssignmentBlock">
                        <p><strong>Assigned classes</strong></p>
                        <div className="adminAssignmentList">
                          {item.assignedClasses.map((assignedClass) => (
                            <div key={assignedClass.id} className="adminAssignmentItem">
                              <strong>{assignedClass.title}</strong>
                              <span>
                                {assignedClass.className ? `${assignedClass.className} · ` : ""}
                                Teacher: {assignedClass.teacherName}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="adminEmptyAssignments"><strong>Assigned classes:</strong> None yet.</p>
                    )}
                    <form action={addUserToClassAction} className="adminEnrollmentForm">
                      <input type="hidden" name="user_id" value={item.id} />
                      <label>
                        <div className="ctaRow adminInlineEditorRow">
                          <select className="input" name="course_id" defaultValue="">
                            <option value="" disabled>Select a class</option>
                            {courseOptions.map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.label}
                              </option>
                            ))}
                          </select>
                          <button className="btn ghost" type="submit">Add to Class</button>
                        </div>
                      </label>
                    </form>
                    {item.canResetPassword ? (
                      <form action={resetPasswordAction} className="adminRenameForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <div className="adminNameGrid">
                          <label className="stack">
                            <span>Set temporary password</span>
                            <input
                              className="input"
                              type="password"
                              name="password"
                              minLength={8}
                              placeholder="Minimum 8 characters"
                            />
                          </label>
                          <div className="ctaRow adminInlineEditorRow adminSingleAction">
                            <button className="btn ghost" type="submit">Set Password</button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <p className="adminEmptyAssignments"><strong>Password:</strong> Managed by Google sign-in.</p>
                    )}
                    <div className="adminGameTools">
                      <p className="adminGameToolsHeading">Game progress</p>
                      <p className="adminEmptyAssignments" style={{ marginTop: 0 }}>
                        {item.savedGameSlugs.length
                          ? `Saved profiles: ${item.savedGameSlugs.map((slug) => formatGameLabel(slug)).join(" · ")}`
                          : "Saved profiles: none found on this account."}
                      </p>
                      <form action={clearSavedGameProgressAction} className="adminRenameForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <div className="adminSchoolEditGrid">
                          <label className="stack">
                            <span>Clear saved game progress</span>
                            <select className="input" name="game_slug" defaultValue="integer_practice">
                              <option value="integer_practice">Adding &amp; Subtracting Integers</option>
                              <option value="2048">2048</option>
                            </select>
                          </label>
                          <div className="ctaRow adminInlineEditorRow adminSingleAction">
                            <button className="btn ghost" type="submit">Clear Game Progress</button>
                          </div>
                        </div>
                      </form>
                    </div>
                    <AccountActionsToggle>
                      <form action={clearSavedGameProgressAction} className="adminInlineForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <input type="hidden" name="game_slug" value="integer_practice" />
                        <button className="btn ghost" type="submit">Reset Integer Progress</button>
                      </form>
                      <form action={updateAccountTypeAction} className="adminInlineForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <input type="hidden" name="account_type" value={item.accountType === "student" ? "teacher" : "student"} />
                        <button className="btn" type="submit">
                          Make {item.accountType === "student" ? "Teacher" : "Student"}
                        </button>
                      </form>
                      {adminContext.isOwner ? (
                        <form action={toggleAdminAccessAction} className="adminInlineForm">
                          <input type="hidden" name="user_id" value={item.id} />
                          <input type="hidden" name="site_admin" value={item.isAdmin ? "false" : "true"} />
                          <button className="btn ghost" type="submit" disabled={item.isBootstrapOwner}>
                            {item.isBootstrapOwner ? "Owner Access" : item.isAdmin ? "Remove Admin" : "Make Admin"}
                          </button>
                        </form>
                      ) : null}
                      {item.accountType !== "student" ? (
                        <form action={toggleDiscoverableAction} className="adminInlineForm">
                          <input type="hidden" name="user_id" value={item.id} />
                          <input type="hidden" name="discoverable" value={item.discoverable ? "false" : "true"} />
                          <button className="btn ghost" type="submit">
                            {item.discoverable ? "Hide from Search" : "Make Discoverable"}
                          </button>
                        </form>
                      ) : null}
                      <form action={deleteAccountAction} className="adminInlineForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <DeleteAccountButton
                          disabled={item.id === user.id}
                          label={item.id === user.id ? "Owner Account" : "Delete Account"}
                        />
                      </form>
                    </AccountActionsToggle>
                    </div>
                  </details>
                </div>
              );
            })}
            </div>
          </>
        ) : null}
          </AdminDisclosure>
        </>
      ) : null}

      <AdminToast
        message={qs.undo ? "Account moved to Deleted Accounts." : null}
        action={
          qs.undo ? (
            <form action={restoreDeletedAccountAction}>
              <input type="hidden" name="user_id" value={qs.undo} />
              <button className="btn ghost" type="submit">Undo</button>
            </form>
          ) : null
        }
      />
    </div>
  );
}
