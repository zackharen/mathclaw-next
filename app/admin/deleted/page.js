import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdminArea } from "@/lib/auth/owner";
import { getAdminAccessContext } from "@/lib/auth/admin-scope";
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

  if (!canAccessAdminArea(user)) {
    redirect("/");
  }

  const admin = createAdminClient();
  const adminContext = await getAdminAccessContext(user, admin);
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const deletedAuthUsers = (data?.users || []).filter(
    (authUser) => authUser?.app_metadata?.account_deleted === true
  );
  const deletedIds = deletedAuthUsers.map((authUser) => authUser.id);
  const { data: profiles } = deletedIds.length
    ? await admin.from("profiles").select("id, school_name").in("id", deletedIds)
    : { data: [] };
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const deletedUsers = deletedAuthUsers.filter((authUser) => {
    if (adminContext.isOwner) return true;
    if (!adminContext.schoolName) return false;
    const profile = profilesById.get(authUser.id);
    const schoolName = String(profile?.school_name || authUser?.user_metadata?.school_name || "").trim();
    return schoolName === adminContext.schoolName;
  });

  return (
    <div className="stack adminStack">
      <section className="card">
        <h1>Deleted Accounts</h1>
        <p>
          {adminContext.isOwner
            ? "Restore previously deleted accounts here."
            : adminContext.schoolName
              ? `View and restore deleted accounts from ${adminContext.schoolName}.`
              : "This admin account needs a school assignment before deleted-account tools can load."}
        </p>
        <div className="adminSubnav">
          <Link className="btn ghost" href="/admin">Back to Admin</Link>
        </div>
      </section>

      {!adminContext.isOwner && !adminContext.schoolName ? (
        <section className="card noticeError">
          <p>No school is assigned to this admin account yet, so deleted-account tools are unavailable.</p>
        </section>
      ) : null}

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

      {adminContext.isOwner || adminContext.schoolName ? (
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
      ) : null}
    </div>
  );
}
