import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerUser } from "@/lib/auth/owner";
import { restoreDeletedAccountAction } from "../actions";

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

export default async function DeletedAccountsPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/admin/deleted");
  }

  if (!isOwnerUser(user)) {
    redirect("/");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const deletedUsers = (data?.users || []).filter(
    (authUser) => authUser?.app_metadata?.account_deleted === true
  );

  return (
    <div className="stack adminStack">
      <section className="card">
        <h1>Deleted Accounts</h1>
        <p>Restore previously deleted accounts here.</p>
        <div className="adminSubnav">
          <Link className="btn ghost" href="/admin">Back to Admin</Link>
        </div>
      </section>

      {qs.restored === "1" ? (
        <section className="card noticeSuccess">
          <p>Account restored.</p>
        </section>
      ) : null}

      {qs.error ? (
        <section className="card noticeError">
          <p>Admin tools hit a snag: {decodeURIComponent(qs.error)}</p>
        </section>
      ) : null}

      <section className="card">
        <h2>Archived</h2>
        {error ? <p>Could not load deleted accounts: {error.message}</p> : null}
        {!error && deletedUsers.length === 0 ? <p>No deleted accounts right now.</p> : null}
        {!error && deletedUsers.length > 0 ? (
          <div className="adminUserList">
            {deletedUsers.map((authUser) => (
              <article key={authUser.id} className="card adminUserCard">
                <div className="adminUserHeader">
                  <div>
                    <h3>{authUser.user_metadata?.display_name || authUser.user_metadata?.full_name || authUser.email || "Deleted user"}</h3>
                    <p>{authUser.email || "-"}</p>
                  </div>
                </div>
                <div className="adminMetaGrid">
                  <p><strong>Deleted:</strong> {formatDate(authUser.app_metadata?.deleted_at)}</p>
                  <p><strong>User ID:</strong> {authUser.id}</p>
                </div>
                <form action={restoreDeletedAccountAction}>
                  <input type="hidden" name="user_id" value={authUser.id} />
                  <button className="btn" type="submit">Restore Account</button>
                </form>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
