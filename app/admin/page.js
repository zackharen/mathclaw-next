import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerUser } from "@/lib/auth/owner";
import { updateAccountTypeAction, deleteAccountAction, toggleDiscoverableAction } from "./actions";

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
  const discoverability = searchParams?.discoverability;
  const error = searchParams?.error;

  if (!updated && !deleted && !discoverability && !error) return null;

  return (
    <div className={`card ${error ? "noticeError" : "noticeSuccess"}`}>
      {updated ? <p>Account type updated.</p> : null}
      {deleted ? <p>Account deleted.</p> : null}
      {discoverability === "shown" ? <p>Teacher is now discoverable.</p> : null}
      {discoverability === "hidden" ? <p>Teacher is now hidden from teacher search.</p> : null}
      {error ? <p>Admin tools hit a snag: {decodeURIComponent(error)}</p> : null}
    </div>
  );
}

function normalizeRoleFilter(value) {
  return ["all", "student", "teacher", "owner"].includes(value) ? value : "all";
}

export default async function AdminPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const searchQuery = String(qs.q || "").trim().toLowerCase();
  const roleFilter = normalizeRoleFilter(String(qs.role || "all"));
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
  let profilesById = new Map();

  if (!error) {
    const authUsers = data?.users || [];
    const ids = authUsers.map((item) => item.id);
    let ownedClassesById = new Map();
    let joinedClassesById = new Map();

    if (ids.length) {
      const [{ data: profiles }, { data: courses }, { data: memberships }] = await Promise.all([
        admin
          .from("profiles")
          .select("id, display_name, school_name, account_type, discoverable, timezone")
          .in("id", ids),
        admin
          .from("courses")
          .select("id, owner_id")
          .in("owner_id", ids),
        admin
          .from("student_course_memberships")
          .select("profile_id")
          .in("profile_id", ids),
      ]);

      profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      ownedClassesById = new Map();
      joinedClassesById = new Map();

      for (const course of courses || []) {
        ownedClassesById.set(course.owner_id, (ownedClassesById.get(course.owner_id) || 0) + 1);
      }

      for (const membership of memberships || []) {
        joinedClassesById.set(
          membership.profile_id,
          (joinedClassesById.get(membership.profile_id) || 0) + 1
        );
      }
    }

    users = authUsers.map((authUser) => {
      const profile = profilesById.get(authUser.id) || {};
      const metadata = authUser.user_metadata || {};
      const accountType = profile.account_type || metadata.account_type || "teacher";
      const isOwner = isOwnerUser(authUser);
      return {
        id: authUser.id,
        email: authUser.email || "-",
        createdAt: authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at,
        displayName: profile.display_name || metadata.display_name || "-",
        schoolName: profile.school_name || "-",
        timezone: profile.timezone || "-",
        discoverable: profile.discoverable,
        accountType,
        isOwner,
        ownedClassCount: ownedClassesById.get(authUser.id) || 0,
        joinedClassCount: joinedClassesById.get(authUser.id) || 0,
      };
    });
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

    const haystack = [item.displayName, item.email, item.schoolName, item.id]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery);
  });

  users.sort((a, b) => String(a.email).localeCompare(String(b.email)));

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
        </div>
      </section>

      <section className="card">
        <h2>Accounts</h2>
        <form className="adminFilterBar" method="get">
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
          <div className="ctaRow adminFilterActions">
            <button className="btn" type="submit">Apply Filters</button>
            <a className="btn ghost" href="/admin">Clear</a>
          </div>
        </form>
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
                    {item.isOwner ? <span className="adminRoleBadge">Owner</span> : null}
                  </div>
                </div>
                <div className="adminMetaGrid">
                  <p><strong>School:</strong> {item.schoolName}</p>
                  <p><strong>Timezone:</strong> {item.timezone}</p>
                  <p><strong>Created:</strong> {formatDate(item.createdAt)}</p>
                  <p><strong>Last sign-in:</strong> {formatDate(item.lastSignInAt)}</p>
                  <p><strong>Owned classes:</strong> {item.ownedClassCount}</p>
                  <p><strong>Joined classes:</strong> {item.joinedClassCount}</p>
                  <p><strong>Teacher search:</strong> {item.accountType === "student" ? "Not applicable" : item.discoverable ? "Visible" : "Hidden"}</p>
                </div>
                <p className="adminUserId"><strong>User ID:</strong> {item.id}</p>
                <div className="ctaRow adminActionRow">
                  <form action={updateAccountTypeAction} className="adminInlineForm">
                    <input type="hidden" name="user_id" value={item.id} />
                    <input
                      type="hidden"
                      name="account_type"
                      value={item.accountType === "student" ? "teacher" : "student"}
                    />
                    <button className="btn" type="submit">
                      Make {item.accountType === "student" ? "Teacher" : "Student"}
                    </button>
                  </form>
                  {item.accountType !== "student" ? (
                    <form action={toggleDiscoverableAction} className="adminInlineForm">
                      <input type="hidden" name="user_id" value={item.id} />
                      <input
                        type="hidden"
                        name="discoverable"
                        value={item.discoverable ? "false" : "true"}
                      />
                      <button className="btn ghost" type="submit">
                        {item.discoverable ? "Hide from Search" : "Make Discoverable"}
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteAccountAction} className="adminInlineForm">
                    <input type="hidden" name="user_id" value={item.id} />
                    <button className="btn danger" type="submit" disabled={item.id === user.id}>
                      {item.id === user.id ? "Owner Account" : "Delete Account"}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
