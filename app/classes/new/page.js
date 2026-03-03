import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  if (!user) {
    redirect("/auth/sign-in?redirect=/classes/new");
  }

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

  if (librariesError) {
    return (
      <div className="stack">
        <section className="card">
          <h1>Create Class</h1>
          <p>Could not load curriculum libraries: {librariesError.message}</p>
        </section>
      </div>
    );
  }

  const defaults = defaultSchoolYearDates();
  const defaultStart = profile.school_year_start || defaults.start;
  const defaultEnd = profile.school_year_end || defaults.end;

  return (
    <div className="stack">
      <section className="card">
        <h1>Create Class</h1>
        <p>Select curriculum, schedule model, and school year.</p>
        <NewClassForm
          userId={user.id}
          timezone={profile.timezone || "America/New_York"}
          libraries={libraries || []}
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
        />
      </section>
    </div>
  );
}
