import Link from "next/link";

export default function HomePage() {
  return (
    <div className="stack">
      <section className="card">
        <h1>MathClaw MVP Foundation</h1>
        <p>
          Auth and protected routes are now scaffolded. Sign in, create classes,
          and proceed through onboarding.
        </p>
        <div className="ctaRow">
          <Link className="btn primary" href="/auth/sign-in">
            Sign In
          </Link>
          <Link className="btn" href="/auth/sign-up">
            Create Account
          </Link>
          <Link className="btn" href="/classes/new">
            Create First Class
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>MVP Decisions Locked</h2>
        <div className="list">
          <p><span className="pill">Auth</span> Supabase email/password + Google</p>
          <p><span className="pill">DB</span> Supabase Postgres</p>
          <p><span className="pill">Curriculum Source 1</span> Math Medic</p>
          <p><span className="pill">Schedule</span> Every Day + AB model</p>
          <p><span className="pill">Announcements v1</span> Minimal + copy button</p>
          <p><span className="pill">Defaults</span> 09/01 to 06/30, America/New_York</p>
        </div>
      </section>
    </div>
  );
}
