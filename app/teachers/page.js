import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import {
  acceptTeacherRequestAction,
  declineTeacherRequestAction,
  sendTeacherRequestAction,
} from "./actions";
import { getSiteCopy } from "@/lib/site-config";

function connectionKey(a, b) {
  return [a, b].sort().join("__");
}

function getTeacherStatsLabel(stats) {
  if (!stats) return "No class stats yet";
  return `${stats.classCount} classes · ${stats.studentCount} joined students`;
}

export default async function TeachersPage({ searchParams }) {
  const qs = (await searchParams) || {};
  const query = typeof qs.q === "string" ? qs.q.trim() : "";
  const updated = qs.updated === "1";
  const siteCopy = await getSiteCopy();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (!isTeacherAccountType(accountType)) {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/teachers");
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id, display_name, school_name")
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
    .eq("account_type", "teacher")
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
          return isTeacherAccountType(accountType) && discoverable;
        }),
      };
    } else {
      profilesRes = legacyProfilesRes;
    }
  }

  let searchableProfiles = profilesRes.data || [];

  // Run connections fetch and auth user validation in parallel.
  const adminForOrphanCheck = createAdminClient();
  const [{ data: connections }, { data: authUsersData }] = await Promise.all([
    supabase
      .from("teacher_connections")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    adminForOrphanCheck.auth.admin.listUsers({ page: 1, perPage: 500 }),
  ]);

  // Filter out orphaned profiles and soft-deleted accounts (account_deleted = true).
  const validAuthIds = new Set(
    (authUsersData?.users || [])
      .filter((u) => u?.app_metadata?.account_deleted !== true)
      .map((u) => u.id)
  );
  searchableProfiles = searchableProfiles.filter((p) => validAuthIds.has(p.id));

  if (query) {
    const q = query.toLowerCase();
    searchableProfiles = searchableProfiles.filter((p) => {
      const dn = String(p.display_name || "").toLowerCase();
      const sn = String(p.school_name || "").toLowerCase();
      return dn.includes(q) || sn.includes(q);
    });
  }

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

  const discoverableTeacherIds = searchableProfiles.map((profile) => profile.id);
  const teacherIdsForStats = [...new Set([...discoverableTeacherIds, ...acceptedOtherIds, ...incomingRequesterIds])];

  let teacherStatsById = new Map();
  if (teacherIdsForStats.length > 0) {
    const { data: ownedCourses } = await supabase
      .from("courses")
      .select("id, owner_id")
      .in("owner_id", teacherIdsForStats);

    const coursesByOwner = new Map();
    const ownedCourseIds = [];
    for (const course of ownedCourses || []) {
      const arr = coursesByOwner.get(course.owner_id) || [];
      arr.push(course.id);
      coursesByOwner.set(course.owner_id, arr);
      ownedCourseIds.push(course.id);
    }

    let memberships = [];
    if (ownedCourseIds.length > 0) {
      const membershipsRes = await supabase
        .from("student_course_memberships")
        .select("course_id")
        .in("course_id", ownedCourseIds);
      memberships = membershipsRes.data || [];
    }

    const studentCountByCourse = new Map();
    for (const row of memberships) {
      studentCountByCourse.set(row.course_id, (studentCountByCourse.get(row.course_id) || 0) + 1);
    }

    teacherStatsById = new Map(
      teacherIdsForStats.map((teacherId) => {
        const teacherCourseIds = coursesByOwner.get(teacherId) || [];
        const studentCount = teacherCourseIds.reduce(
          (sum, courseId) => sum + (studentCountByCourse.get(courseId) || 0),
          0
        );
        return [
          teacherId,
          {
            classCount: teacherCourseIds.length,
            studentCount,
          },
        ];
      })
    );
  }

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
  const mySchoolName = String(myProfile?.school_name || "").trim();
  const sameSchoolProfiles = searchableProfiles.filter(
    (profile) => mySchoolName && String(profile.school_name || "").trim() === mySchoolName
  );
  const suggestedProfiles = searchableProfiles
    .filter((profile) => {
      const key = connectionKey(user.id, profile.id);
      return !connectionByPair.has(key);
    })
    .sort((a, b) => {
      const aSame = mySchoolName && String(a.school_name || "").trim() === mySchoolName ? 1 : 0;
      const bSame = mySchoolName && String(b.school_name || "").trim() === mySchoolName ? 1 : 0;
      if (aSame !== bSame) return bSame - aSame;
      return String(a.display_name || "").localeCompare(String(b.display_name || ""));
    });

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.teachersTitle}</h1>
        <p>{siteCopy.teachersDescription}</p>
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
        <h2>Community Snapshot</h2>
        <div className="adminSummaryGrid" style={{ marginTop: "1rem" }}>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Discoverable Teachers</h3>
            <p className="adminStat">{searchableProfiles.length}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Same School</h3>
            <p className="adminStat">{sameSchoolProfiles.length}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Incoming Requests</h3>
            <p className="adminStat">{incoming.length}</p>
          </div>
          <div className="card adminSummaryCard" style={{ background: "#fff" }}>
            <h3>Connected Teachers</h3>
            <p className="adminStat">{acceptedOtherIds.length}</p>
          </div>
        </div>
      </section>

      {mySchoolName ? (
        <section className="card">
          <h2>Your School Community</h2>
          <p>{mySchoolName}</p>
          {sameSchoolProfiles.length === 0 ? (
            <p style={{ marginTop: "0.75rem" }}>No discoverable teachers from your school are showing up yet.</p>
          ) : (
            <div className="list" style={{ marginTop: "1rem" }}>
              {sameSchoolProfiles.map((profile) => {
                const key = connectionKey(user.id, profile.id);
                const conn = connectionByPair.get(key);
                const stats = teacherStatsById.get(profile.id);
                return (
                  <article key={profile.id} className="card" style={{ background: "#fff" }}>
                    <h3>{profile.display_name || "Teacher"}</h3>
                    <div className="teacherBadgeRow">
                      <span className="pill">Same School</span>
                      <span className="pill">{getTeacherStatsLabel(stats)}</span>
                    </div>
                    <div className="ctaRow" style={{ marginTop: "0.9rem" }}>
                      {!conn ? (
                        <form action={sendTeacherRequestAction}>
                          <input type="hidden" name="target_id" value={profile.id} />
                          <button className="btn" type="submit">Connect</button>
                        </form>
                      ) : null}
                      {conn?.status === "pending" && conn.requester_id === user.id ? (
                        <span className="statusNote">Request Sent</span>
                      ) : null}
                      {conn?.status === "accepted" ? <span className="statusNote">Connected</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="card">
        <h2>Suggested Connections</h2>
        {suggestedProfiles.length === 0 ? (
          <p>No new teacher suggestions right now.</p>
        ) : (
          <div className="list">
            {suggestedProfiles.map((profile) => {
              const key = connectionKey(user.id, profile.id);
              const conn = connectionByPair.get(key);
              const stats = teacherStatsById.get(profile.id);
              const isSameSchool =
                mySchoolName && String(profile.school_name || "").trim() === mySchoolName;

              return (
                <article key={profile.id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile.display_name || "Teacher"}</h3>
                  <p>{profile.school_name || "School not listed"}</p>
                  <div className="teacherBadgeRow">
                    {isSameSchool ? <span className="pill">Same School</span> : null}
                    <span className="pill">{getTeacherStatsLabel(stats)}</span>
                  </div>
                  <div className="ctaRow">
                    {!conn ? (
                      <form action={sendTeacherRequestAction}>
                        <input type="hidden" name="target_id" value={profile.id} />
                        <button className="btn" type="submit">Connect</button>
                      </form>
                    ) : null}
                    {conn?.status === "pending" && conn.requester_id === user.id ? (
                      <span className="statusNote">Request Sent</span>
                    ) : null}
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
              const stats = teacherStatsById.get(id);
              return (
                <article key={id} className="card" style={{ background: "#fff" }}>
                  <h3>{profile?.display_name || "Teacher"}</h3>
                  <p>{profile?.school_name || "School not listed"}</p>
                  <div className="teacherBadgeRow">
                    <span className="pill">{getTeacherStatsLabel(stats)}</span>
                    {mySchoolName && profile?.school_name === mySchoolName ? (
                      <span className="pill">Same School</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
