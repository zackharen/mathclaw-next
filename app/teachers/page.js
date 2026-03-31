import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import {
  acceptTeacherRequestAction,
  declineTeacherRequestAction,
  sendTeacherRequestAction,
} from "./actions";

function connectionKey(a, b) {
  return [a, b].sort().join("__");
}

export default async function TeachersPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const query = typeof qs.q === "string" ? qs.q.trim() : "";
  const updated = qs.updated === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (accountType === "student") {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/teachers");
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!myProfile) {
    redirect("/onboarding/profile");
  }

  let profilesRes = await supabase
    .from("profiles")
    .select("id, display_name, school_name, discoverable")
    .neq("id", user.id)
    .eq("discoverable", true)
    .order("display_name", { ascending: true })
    .limit(30);

  if (
    profilesRes.error &&
    typeof profilesRes.error.message === "string" &&
    profilesRes.error.message.includes("discoverable")
  ) {
    const legacyProfilesRes = await supabase
      .from("profiles")
      .select("id, display_name, school_name")
      .neq("id", user.id)
      .order("display_name", { ascending: true })
      .limit(30);

    if (!legacyProfilesRes.error) {
      const admin = createAdminClient();
      const { data: authUsersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      const authUsersById = new Map(
        (authUsersData?.users || [])
          .filter((entry) => entry?.app_metadata?.account_deleted !== true)
          .map((entry) => [entry.id, entry])
      );

      profilesRes = {
        ...legacyProfilesRes,
        data: (legacyProfilesRes.data || []).filter((profile) => {
          const authUser = authUsersById.get(profile.id);
          const metadata = authUser?.user_metadata || {};
          const accountType = metadata.account_type || "teacher";
          const discoverable = metadata.discoverable === true;
          return accountType !== "student" && discoverable;
        }),
      };
    } else {
      profilesRes = legacyProfilesRes;
    }
  }

  let searchableProfiles = profilesRes.data || [];
  if (query) {
    const q = query.toLowerCase();
    searchableProfiles = searchableProfiles.filter((p) => {
      const dn = String(p.display_name || "").toLowerCase();
      const sn = String(p.school_name || "").toLowerCase();
      return dn.includes(q) || sn.includes(q);
    });
  }

  const { data: connections } = await supabase
    .from("teacher_connections")
    .select("id, requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const connectionByPair = new Map();
  const incoming = [];
  const accepted = [];

  for (const row of connections || []) {
    connectionByPair.set(connectionKey(row.requester_id, row.addressee_id), row);
    if (row.status === "accepted") accepted.push(row);
    if (row.status === "pending" && row.addressee_id === user.id) incoming.push(row);
  }

  const incomingRequesterIds = incoming.map((r) => r.requester_id);
  const acceptedOtherIds = accepted.map((r) =>
    r.requester_id === user.id ? r.addressee_id : r.requester_id
  );

  const [incomingProfilesRes, acceptedProfilesRes] = await Promise.all([
    incomingRequesterIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, school_name")
          .in("id", incomingRequesterIds)
      : Promise.resolve({ data: [] }),
    acceptedOtherIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, school_name")
          .in("id", acceptedOtherIds)
      : Promise.resolve({ data: [] }),
  ]);

  const incomingById = new Map((incomingProfilesRes.data || []).map((p) => [p.id, p]));
  const acceptedById = new Map((acceptedProfilesRes.data || []).map((p) => [p.id, p]));

  return (
    <div className="stack">
      <section className="card">
        <h1>Teachers</h1>
        <p>Find colleagues and send connection requests.</p>
        <form className="ctaRow" action="/teachers" method="get">
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name or school"
            style={{ maxWidth: 360 }}
          />
          <button className="btn" type="submit">Search</button>
          {query ? <a className="btn" href="/teachers">Clear</a> : null}
          {updated ? <span className="statusNote">Connections Updated!</span> : null}
        </form>
      </section>

      <section className="card">
        <h2>People</h2>
        {searchableProfiles.length === 0 ? (
          <p>No teachers found.</p>
        ) : (
          <div className="list">
            {searchableProfiles.map((profile) => {
              const key = connectionKey(user.id, profile.id);
              const conn = connectionByPair.get(key);
              const minePending =
                conn &&
                conn.status === "pending" &&
                conn.requester_id === user.id;
              const incomingPending =
                conn &&
                conn.status === "pending" &&
                conn.addressee_id === user.id;
              const isConnected = conn && conn.status === "accepted";

              return (
                <article key={profile.id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile.display_name || "Teacher"}</h3>
                  <p>{profile.school_name || "School not listed"}</p>
                  <div className="ctaRow">
                    {!conn ? (
                      <form action={sendTeacherRequestAction}>
                        <input type="hidden" name="target_id" value={profile.id} />
                        <button className="btn" type="submit">Connect</button>
                      </form>
                    ) : null}
                    {minePending ? <span className="statusNote">Request Sent</span> : null}
                    {incomingPending ? (
                      <>
                        <form action={acceptTeacherRequestAction}>
                          <input type="hidden" name="connection_id" value={conn.id} />
                          <button className="btn primary" type="submit">Accept</button>
                        </form>
                        <form action={declineTeacherRequestAction}>
                          <input type="hidden" name="connection_id" value={conn.id} />
                          <button className="btn" type="submit">Decline</button>
                        </form>
                      </>
                    ) : null}
                    {isConnected ? <span className="statusNote">Connected</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Incoming Requests</h2>
        {incoming.length === 0 ? (
          <p>No pending requests.</p>
        ) : (
          <div className="list">
            {incoming.map((request) => {
              const profile = incomingById.get(request.requester_id);
              return (
                <article key={request.id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile?.display_name || "Teacher"}</h3>
                  <p>{profile?.school_name || "School not listed"}</p>
                  <div className="ctaRow">
                    <form action={acceptTeacherRequestAction}>
                      <input type="hidden" name="connection_id" value={request.id} />
                      <button className="btn primary" type="submit">Accept</button>
                    </form>
                    <form action={declineTeacherRequestAction}>
                      <input type="hidden" name="connection_id" value={request.id} />
                      <button className="btn" type="submit">Decline</button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Connected Teachers</h2>
        {acceptedOtherIds.length === 0 ? (
          <p>No connections yet.</p>
        ) : (
          <div className="list">
            {acceptedOtherIds.map((id) => {
              const profile = acceptedById.get(id);
              return (
                <article key={id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile?.display_name || "Teacher"}</h3>
                  <p>{profile?.school_name || "School not listed"}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
