"use client";

import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ formId }) {
  const { pending } = useFormStatus();

  return (
    <div className="applyCalendarControl">
      <button
        className={`btn ${pending ? "primary" : ""}`}
        type="submit"
        form={formId}
        disabled={pending}
      >
        Apply Calendar Changes
      </button>
      {pending ? (
        <span className="controlStatusLine" aria-live="polite">
          Updating<span className="updatingDots">...</span>
        </span>
      ) : null}
    </div>
  );
}
