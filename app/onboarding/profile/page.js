export default function OnboardingProfilePage() {
  return (
    <div className="stack">
      <section className="card">
        <h1>Onboarding: Teacher Profile</h1>
        <p>
          This page will collect display name, school, timezone, and search
          visibility for colleague discovery.
        </p>
        <div className="kv">
          <div><strong>Display Name</strong><span>Required</span></div>
          <div><strong>School Name</strong><span>Optional</span></div>
          <div><strong>Timezone</strong><span>Default: America/New_York</span></div>
          <div><strong>Discoverable</strong><span>On/Off</span></div>
        </div>
      </section>
    </div>
  );
}
