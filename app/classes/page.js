import Link from "next/link";

export default function ClassesPage() {
  return (
    <div className="stack">
      <section className="card">
        <h1>Your Classes</h1>
        <p>
          This screen will list classes, pacing status, and quick links to
          calendar, lesson plan, and announcements.
        </p>
        <div className="ctaRow">
          <Link className="btn primary" href="/classes/new">
            Add Class
          </Link>
        </div>
      </section>
    </div>
  );
}
