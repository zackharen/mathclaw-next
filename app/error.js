"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="feedbackErrorState" role="alert">
      <span className="feedbackErrorGlyph" aria-hidden="true">!</span>
      <p className="eyebrow">MathClaw hit a snag</p>
      <h1>This page did not finish loading.</h1>
      <p>Your work may still be safe. Try the page again before starting over.</p>
      <div className="ctaRow">
        <button className="btn primary" type="button" onClick={reset}>
          Try Again
        </button>
      </div>
    </section>
  );
}
