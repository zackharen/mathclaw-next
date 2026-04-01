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
  const error = searchParams?.error;

  if (!updated && !deleted && !renamed && !restored && !discoverability && !membership && !adminAccess && !passwordReset && !classDeleted && !bugReport && !error) {
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
      {error ? <p>Admin tools hit a snag: {decodeURIComponent(error)}</p> : null}
    </div>
  );
}

function normalizeRoleFilter(value) {
  return ["all", "student", "teacher", "owner"].includes(value) ? value : "all";
}

function normalizeSort(value) {
  return ["email", "first_name", "last_name", "recent"].includes(value) ? value : "email";
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

export default async function AdminPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const searchQuery = String(qs.q || "").trim().toLowerCase();
  const roleFilter = normalizeRoleFilter(String(qs.role || "all"));
  const sortBy = normalizeSort(String(qs.sort || "email"));
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

  if (!error) {
    const authUsers = (data?.users || []).filter(
      (authUser) => authUser?.app_metadata?.account_deleted !== true
    );
    const ids = authUsers.map((item) => item.id);

    if (ids.length) {
      const [{ data: profiles }, { data: courses }, { data: memberships }, bugReportResult] = await Promise.all([
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
      ]);

      bugReports = bugReportResult.data || [];
      bugReportError = bugReportResult.error || null;

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

  users = users.filter((item) => {
    const matchesRole =
      roleFilter === "all"
        ? true
        : roleFilter === "owner"
          ? item.isOwner
          : item.accountType === roleFilter;

    if (!matchesRole) return false;
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
        </div>
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

      <section className="card">
        <h2>Accounts</h2>
        <form className="adminFilterBar adminFilterBarWide" method="get">
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
              <option value="email">Email</option>
              <option value="first_name">First name</option>
              <option value="last_name">Last name</option>
              <option value="recent">Recent sign-in</option>
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
            {users.map((item) => (
              <article key={item.id} className="card adminUserCard">
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
              </article>
            ))}
          </div>
        ) : null}
      </section>

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
