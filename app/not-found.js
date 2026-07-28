import Link from "next/link";

export default function NotFound() {
  return (
    <section className="feedbackErrorState">
      <span className="feedbackErrorGlyph" aria-hidden="true">?</span>
      <p className="eyebrow">Page not found</p>
      <h1>That MathClaw page wandered off.</h1>
      <p>The link may be old, or the page may have moved.</p>
      <div className="ctaRow">
        <Link className="btn primary" href="/">Return Home</Link>
        <Link className="btn" href="/play">Open Arcade</Link>
      </div>
    </section>
  );
}
