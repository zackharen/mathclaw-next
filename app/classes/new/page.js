import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminAccessContext } from "@/lib/auth/admin-scope";
import NewClassForm from "./new-class-form";

function defaultSchoolYearDates() {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    start: `${year}-09-01`,
    end: `${year + 1}-06-30`,
  };
}

export default async function NewClassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (accountType === "student") {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes/new");
  }

  const admin = createAdminClient();
  const adminContext = await getAdminAccessContext(user, admin);

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, timezone, school_year_start, school_year_end")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError &&
    typeof profileError.message === "string" &&
    profileError.message.includes("school_year_start")
  ) {
    const retry = await supabase
      .from("profiles")
      .select("id, timezone")
      .eq("id", user.id)
      .maybeSingle();
    profile = retry.data
      ? { ...retry.data, school_year_start: null, school_year_end: null }
      : null;
    profileError = retry.error;
  }

  if (!profile || profileError) {
    redirect("/onboarding/profile");
  }

  const { data: libraries, error: librariesError } = await supabase
    .from("curriculum_libraries")
    .select("id, class_code, class_name, curriculum_providers!inner(code, name)")
    .eq("curriculum_providers.code", "math_medic")
    .order("class_name", { ascending: true });

  const defaults = defaultSchoolYearDates();
  const defaultStart = profile.school_year_start || defaults.start;
  const defaultEnd = profile.school_year_end || defaults.end;

  let teacherOptions = [];
  let existingCourses = [];

  if (!adminContext.isOwner && adminContext.isAdmin && adminContext.schoolName) {
    const { data: schoolProfiles } = await admin
      .from("profiles")
      .select("id, display_name, school_name")
      .eq("school_name", adminContext.schoolName);
    const allSchoolIds = (schoolProfiles || []).map((profile) => profile.id);
    const { data: teacherUsers } = allSchoolIds.length
      ? await admin.auth.admin.listUsers({ page: 1, perPage: 500 })
      : { data: { users: [] } };
    const schoolTeacherProfiles = (schoolProfiles || []).filter((profile) => {
      const authUser = (teacherUsers?.users || []).find((entry) => entry.id === profile.id);
      return authUser?.user_metadata?.account_type !== "student";
    });
    const teacherIds = schoolTeacherProfiles.map((profile) => profile.id);
    const authUsersById = new Map(
      (teacherUsers?.users || [])
        .filter((authUser) => teacherIds.includes(authUser.id))
        .map((authUser) => [authUser.id, authUser])
    );

    teacherOptions = schoolTeacherProfiles.map((profile) => {
      const authUser = authUsersById.get(profile.id);
      const displayName =
        profile.display_name ||
        authUser?.user_metadata?.display_name ||
        authUser?.user_metadata?.full_name ||
        authUser?.email ||
        "Teacher";
      return {
        id: profile.id,
        label: `${displayName}${profile.id === user.id ? " (You)" : ""}`,
      };
    });

    const { data: schoolCourses } = teacherIds.length
      ? await admin
          .from("courses")
          .select("id, title, class_name, school_year_start, school_year_end")
          .in("owner_id", teacherIds)
          .order("created_at", { ascending: false })
      : { data: [] };
    existingCourses = schoolCourses || [];
  } else {
    const existingCoursesResult = await supabase
      .from("courses")
      .select("id, title, class_name, school_year_start, school_year_end")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    existingCourses = existingCoursesResult.data || [];
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Create Class</h1>
        <p>Select curriculum, schedule model, and school year. You can also create no-curriculum or friends/family debug classes.</p>
        {librariesError ? (
          <p style={{ marginTop: "0.75rem", color: "var(--red)" }}>
            Curriculum libraries could not load right now. You can still create no-curriculum or debug classes.
          </p>
        ) : null}
        <NewClassForm
          timezone={profile.timezone || "America/New_York"}
          libraries={libraries || []}
          existingCourses={existingCourses || []}
          teacherOptions={teacherOptions}
          defaultOwnerId={teacherOptions.find((teacher) => teacher.id === user.id)?.id || user.id}
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
        />
      </section>
    </div>
  );
}
