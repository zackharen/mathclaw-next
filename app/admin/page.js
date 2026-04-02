import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser, isOwnerEmail, isOwnerUser } from "@/lib/auth/owner";
import { splitDisplayName } from "@/lib/auth/account-type";
import DeleteAccountButton from "./delete-account-button";
import DeleteClassButton from "./delete-class-button";
import AdminToast from "./admin-toast";
import AccountActionsToggle from "./account-actions-toggle";
import {
  updateAccountTypeAction,
  deleteAccountAction,
  toggleDiscoverableAction,
  renameAccountAction,
  updateSchoolNameAction,
  toggleAdminAccessAction,
  addUserToClassAction,
  restoreDeletedAccountAction,
  resetPasswordAction,
  deleteOwnedClassAction,
  updateBugReportStatusAction,
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
  const classDeleted = searchParams?.classDeleted === "1";
  const bugReport = searchParams?.bugReport;
  const schoolUpdated = searchParams?.schoolUpdated;
  const error = searchParams?.error;

  if (!updated && !deleted && !renamed && !restored && !discoverability && !membership && !adminAccess && !passwordReset && !classDeleted && !bugReport && !schoolUpdated && !error) {
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
      {bugReport === "resolved" ? <p>Bug report marked resolved.</p> : null}
      {bugReport === "open" ? <p>Bug report reopened.</p> : null}
      {schoolUpdated === "set" ? <p>School assignment updated.</p> : null}
      {schoolUpdated === "cleared" ? <p>School assignment cleared.</p> : null}
      {error ? <p>Admin tools hit a snag: {decodeURIComponent(error)}</p> : null}
    </div>
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

function normalizeAdminView(value) {
  return ["accounts", "diagnostics"].includes(value) ? value : "accounts";
}

function summarizeAccountClasses(item) {
  const primaryOwnedClass = item.ownedClasses[0];
  const primaryAssignedClass = item.assignedClasses[0];
  const totalClasses = item.ownedClassCount + item.joinedClassCount;

  if (primaryOwnedClass) {
    const extraCount = item.ownedClassCount - 1;
    return {
      title: primaryOwnedClass.title,
      detail:
        extraCount > 0
          ? `Owns ${item.ownedClassCount} classes total`
          : "Owns this class",
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
    };
  }

  return {
    title: "No classes yet",
    detail:
      totalClasses > 0
        ? `${totalClasses} class relationships found`
        : "No class ownership or enrollment",
  };
}

export default async function AdminPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const searchQuery = String(qs.q || "").trim().toLowerCase();
  const roleFilter = normalizeRoleFilter(String(qs.role || "all"));
  const sortBy = normalizeSort(String(qs.sort || "last_name"));
  const schoolFilter = normalizeSchoolFilter(qs.school);
  const adminView = normalizeAdminView(String(qs.view || "accounts"));
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

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });

  let users = [];
  let courseOptions = [];
  let bugReports = [];
  let bugReportError = null;
  let internalEvents = [];
  let internalEventError = null;

  if (!error) {
    const authUsers = (data?.users || []).filter(
      (authUser) => authUser?.app_metadata?.account_deleted !== true
    );
    const ids = authUsers.map((item) => item.id);

    if (ids.length) {
      const [{ data: profiles }, { data: courses }, { data: memberships }, bugReportResult, eventResult] = await Promise.all([
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
          .select("id, event_key, source, level, message, user_email, account_type, course_id, context, created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      bugReports = bugReportResult.data || [];
      bugReportError = bugReportResult.error || null;
      internalEvents = eventResult.data || [];
      internalEventError = eventResult.error || null;

      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const coursesById = new Map((courses || []).map((course) => [course.id, course]));
      const membershipsByProfileId = new Map();
      const ownedClassesById = new Map();
      const ownedCoursesByOwnerId = new Map();
      const joinedClassesById = new Map();

      for (const course of courses || []) {
        ownedClassesById.set(course.owner_id, (ownedClassesById.get(course.owner_id) || 0) + 1);
        const current = ownedCoursesByOwnerId.get(course.owner_id) || [];
        current.push(course);
        ownedCoursesByOwnerId.set(course.owner_id, current);
      }

      for (const membership of memberships || []) {
        joinedClassesById.set(
          membership.profile_id,
          (joinedClassesById.get(membership.profile_id) || 0) + 1
        );

        const current = membershipsByProfileId.get(membership.profile_id) || [];
        current.push(membership);
        membershipsByProfileId.set(membership.profile_id, current);
      }

      courseOptions = (courses || []).map((course) => {
        const ownerProfile = profilesById.get(course.owner_id);
        const ownerAuthUser = authUsers.find((authUser) => authUser.id === course.owner_id);
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

      users = authUsers.map((authUser) => {
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
          schoolName: profile.school_name || "-",
          timezone: profile.timezone || "-",
          discoverable: profile.discoverable ?? metadata.discoverable ?? false,
          accountType,
          isOwner,
          isBootstrapOwner,
          isAdmin,
          providerLabel,
          canResetPassword,
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

  return (
    <div className="stack adminStack">
      <section className="card">
        <h1>Owner Admin</h1>
        <p>
          Manage MathClaw accounts without digging through Supabase. This is just for the owner account.
        </p>
      </section>

      <Notice searchParams={qs} />

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
          <div className="card adminSummaryCard">
            <h3>Open Bug Reports</h3>
            <p className="adminStat">{bugReports.filter((item) => item.status !== "resolved").length}</p>
          </div>
          <div className="card adminSummaryCard">
            <h3>Recent Internal Issues</h3>
            <p className="adminStat">
              {internalEvents.filter((item) => ["error", "warning"].includes(item.level)).length}
            </p>
          </div>
        </div>
      </section>

      {schoolSummaries.length > 0 ? (
        <section className="card">
          <h2>{schoolFilter === "all" ? "School Snapshot" : `${schoolFilter} Snapshot`}</h2>
          <p>
            {schoolFilter === "all"
              ? "Quick counts by school so you can spot where the most accounts and admins live."
              : "Quick counts for the currently selected school."}
          </p>
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
        </section>
      ) : null}

      <section className="card adminSectionSwitcher">
        <h2>Admin Sections</h2>
        <p>Choose whether you want to work with people and classes, or review bugs and silent system issues.</p>
        <div className="adminViewSwitch">
          <a
            className={`btn ${adminView === "accounts" ? "primary" : "ghost"}`}
            href="/admin?view=accounts"
          >
            User Information
          </a>
          <a
            className={`btn ${adminView === "diagnostics" ? "primary" : "ghost"}`}
            href="/admin?view=diagnostics"
          >
            Bugs and Internal Errors
          </a>
        </div>
      </section>

      {adminView === "diagnostics" ? (
        <>
          <section className="card">
            <h2>Internal Error Log</h2>
            <p>These are silent failures captured automatically from important flows like class joins, score saves, and Connect4.</p>
            {internalEventError ? <p>Could not load internal event logs: {internalEventError.message}</p> : null}
            {!internalEventError && internalEvents.length === 0 ? <p>No internal errors logged yet.</p> : null}
            {!internalEventError && internalEvents.length > 0 ? (
              <div className="adminBugList">
                {internalEvents.map((event) => (
                  <article key={event.id} className="card adminBugCard">
                    <div className="adminUserHeader">
                      <div>
                        <h3>{formatInternalEventTitle(event.event_key)}</h3>
                        <p>{event.user_email || "Unknown user"}{event.account_type ? ` · ${event.account_type}` : ""}</p>
                      </div>
                      <div className="adminBadgeRow">
                        <span className="adminRoleBadge">{formatInternalEventLevel(event.level)}</span>
                        <span className="adminRoleBadge">{formatInternalEventSource(event.source)}</span>
                      </div>
                    </div>
                    <div className="adminMetaGrid">
                      <p><strong>Logged:</strong> {formatDate(event.created_at)}</p>
                      <p><strong>Course:</strong> {event.course_id || "-"}</p>
                    </div>
                    <p><strong>Message:</strong> {event.message}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Bug Inbox</h2>
            <p>Reports submitted from inside MathClaw land here so you can spot repeat issues quickly.</p>
            {bugReportError ? <p>Could not load bug reports: {bugReportError.message}</p> : null}
            {!bugReportError && bugReports.length === 0 ? <p>No bug reports yet.</p> : null}
            {!bugReportError && bugReports.length > 0 ? (
              <div className="adminBugList">
                {bugReports.map((report) => (
                  <article key={report.id} className="card adminBugCard">
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
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {adminView === "accounts" ? (
        <section className="card">
          <h2>User Information</h2>
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
          <div className="adminUserList">
            {users.map((item) => {
              const classSummary = summarizeAccountClasses(item);

              return (
                <details key={item.id} className="card adminUserCard adminUserDetails">
                  <summary className="adminUserSummary">
                    <div className="adminUserSummaryMain">
                      <div>
                        <h3>{item.displayName}</h3>
                        <p className="adminUserSummaryClass">{classSummary.title}</p>
                        <p className="adminUserSummaryMeta">{classSummary.detail}</p>
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
                            {schoolOptions.map((schoolName) => (
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
                              type="text"
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
                    <AccountActionsToggle>
                      <form action={updateAccountTypeAction} className="adminInlineForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <input type="hidden" name="account_type" value={item.accountType === "student" ? "teacher" : "student"} />
                        <button className="btn" type="submit">
                          Make {item.accountType === "student" ? "Teacher" : "Student"}
                        </button>
                      </form>
                      <form action={toggleAdminAccessAction} className="adminInlineForm">
                        <input type="hidden" name="user_id" value={item.id} />
                        <input type="hidden" name="site_admin" value={item.isAdmin ? "false" : "true"} />
                        <button className="btn ghost" type="submit" disabled={item.isBootstrapOwner}>
                          {item.isBootstrapOwner ? "Owner Access" : item.isAdmin ? "Remove Admin" : "Make Admin"}
                        </button>
                      </form>
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
              );
            })}
          </div>
        ) : null}
        </section>
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
