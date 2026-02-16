export default function NewClassPage() {
  return (
    <div className="stack">
      <section className="card">
        <h1>Create Class</h1>
        <p>
          v1 workflow: choose curriculum provider, class track, schedule model,
          and default school-year range.
        </p>
        <div className="kv">
          <div><strong>Provider</strong><span>Math Medic (initial)</span></div>
          <div><strong>Class Track</strong><span>A1 / GEO / A2 / APPC / APC / APS</span></div>
          <div><strong>Schedule Model</strong><span>Every Day or AB</span></div>
          <div><strong>School Year</strong><span>09/01 to 06/30 (editable)</span></div>
          <div><strong>Pacing Mode</strong><span>One lesson per instructional day</span></div>
        </div>
      </section>
    </div>
  );
}
