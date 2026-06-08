"use client";

import { useFormStatus } from "react-dom";

export default function SchoolCalendarSubmit({ updated = false, error = "" }) {
  const { pending } = useFormStatus();
  const statusText = pending
    ? "Updating dates and rebuilding class calendars..."
    : updated
      ? "School Calendar Updated!"
      : error
        ? "Could not save school calendar."
        : "";

  return (
    <>
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Updating Calendar..." : "Apply Calendar Changes"}
      </button>
      {statusText ? (
        <span className="statusNote" aria-live="polite">
          {statusText}
        </span>
      ) : null}
    </>
  );
}
