export default function DashboardPage() {
  return (
    <div className="stack">
      <section className="card">
        <h1>Pacing Dashboard</h1>
        <p>
          This view will show projected completion, lessons behind/ahead, and
          class-by-class pacing status.
        </p>
        <div className="kv">
          <div><strong>Current Unit Position</strong><span>Pending data</span></div>
          <div><strong>Projected Final Lesson Date</strong><span>Pending data</span></div>
          <div><strong>Pacing Delta</strong><span>Pending data</span></div>
          <div><strong>Colleague Comparison</strong><span>Pending data</span></div>
        </div>
      </section>
    </div>
  );
}
