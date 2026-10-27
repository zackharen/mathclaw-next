"use client";

import { reportError } from "@/lib/observability/report-error";
import { useEffect } from "react";

// Last-resort screen when the root layout itself crashes.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1>Something went wrong.</h1>
        <p>MathClaw hit an unexpected error. Try again, or head back to the homepage.</p>
        <button type="button" onClick={() => reset()} style={{ marginRight: "0.75rem" }}>
          Try again
        </button>
        {/* A full page load is the point here: the app shell itself crashed. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">Go home</a>
      </body>
    </html>
  );
}
