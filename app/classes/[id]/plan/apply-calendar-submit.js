"use client";

import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ calendarUpdated }) {
  const { pending } = useFormStatus();
  const statusText = pending
    ? "Updating"
    : calendarUpdated
      ? "Calendar Updated!"
      : "\u00a0";

  return (
    <div className="applyCalendarControl">
      <button
        className={`btn ${pending ? "primary" : ""}`}
        type="submit"
        disabled={pending}
      >
        Apply Calendar Changes
      </button>
      <span className="controlStatusLine" aria-live="polite">
        {statusText}
        {pending ? <span className="updatingDots">...</span> : null}
      </span>
    </div>
  );
}
