"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ formId }) {
  const { pending } = useFormStatus();
  const [submitStarted, setSubmitStarted] = useState(false);
  const isUpdating = pending || submitStarted;

  useEffect(() => {
    if (!formId) return undefined;
    const form = document.getElementById(formId);
    if (!form) return undefined;

    function handleSubmit() {
      setSubmitStarted(true);
    }

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [formId]);

  useEffect(() => {
    if (pending || !submitStarted) return undefined;
    const timeout = window.setTimeout(() => {
      setSubmitStarted(false);
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [pending, submitStarted]);

  return (
    <div className="applyCalendarControl">
      <button
        className={`btn ${isUpdating ? "primary" : ""}`}
        type="submit"
        form={formId}
        disabled={isUpdating}
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
