import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerUser } from "@/lib/auth/owner";
import { updateAccountTypeAction, deleteAccountAction } from "./actions";

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
  const error = searchParams?.error;

  if (!updated && !deleted && !error) return null;

  return (
    <div className={`card ${error ? "noticeError" : "noticeSuccess"}`}>
      {updated ? <p>Account type updated.</p> : null}
      {deleted ? <p>Account deleted.</p> : null}
      {error ? <p>Admin tools hit a snag: {decodeURIComponent(error)}</p> : null}
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  const qs = (await searchParams) || {};
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

    if (ids.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, school_name, account_type, discoverable, timezone")
        .in("id", ids);

      profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    }

    users = authUsers.map((authUser) => {
      const profile = profilesById.get(authUser.id) || {};
      const metadata = authUser.user_metadata || {};
      const accountType = profile.account_type || metadata.account_type || "teacher";
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
      };
    });
  }

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
                  <span className="adminRoleBadge">{item.accountType === "student" ? "Student" : "Teacher"}</span>
                </div>
                <div className="adminMetaGrid">
                  <p><strong>School:</strong> {item.schoolName}</p>
                  <p><strong>Timezone:</strong> {item.timezone}</p>
                  <p><strong>Created:</strong> {formatDate(item.createdAt)}</p>
                  <p><strong>Last sign-in:</strong> {formatDate(item.lastSignInAt)}</p>
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
