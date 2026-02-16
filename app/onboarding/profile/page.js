import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";

export default async function OnboardingProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, school_name, timezone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="stack">
      <section className="card">
        <h1>Onboarding: Teacher Profile</h1>
        <p>Save your profile before creating classes.</p>
        <ProfileForm
          userId={user.id}
          initialDisplayName={profile?.display_name || ""}
          initialSchoolName={profile?.school_name || ""}
          initialTimezone={profile?.timezone || "America/New_York"}
        />
      </section>
    </div>
  );
}
