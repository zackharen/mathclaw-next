"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ formId }) {
  const { pending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const isUpdating = pending || submitted;

  useEffect(() => {
    if (!formId) return undefined;
    const form = document.getElementById(formId);
    if (!form) return undefined;

    function handleSubmit() {
      setSubmitted(true);
    }

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [formId]);

  return (
    <div className="applyCalendarControl">
      <button
        className={`btn ${isUpdating ? "primary" : ""}`}
        type="submit"
        form={formId}
        disabled={isUpdating}
        onClick={() => setSubmitted(true)}
        aria-busy={isUpdating}
      >
        {isUpdating ? "Updating..." : "Update Schedule"}
      </button>
      {isUpdating ? (
        <span className="controlStatusLine" aria-live="polite">
          Updating schedule, lessons, and announcements<span className="updatingDots">...</span>
        </span>
      ) : null}
    </div>
  );
}
