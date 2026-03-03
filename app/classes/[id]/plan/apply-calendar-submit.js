"use client";

import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ calendarUpdated }) {
  const { pending } = useFormStatus();

  return (
    <>
      <button className={`btn ${pending ? "primary" : ""}`} type="submit" disabled={pending}>
        {pending ? "Applying..." : "Apply Calendar Changes"}
      </button>
      {pending ? (
        <span className="controlStatusLine">
          Updating<span className="updatingDots">...</span>
        </span>
      ) : null}
      {!pending && calendarUpdated ? (
        <span className="controlStatusLine">Calendar Updated!</span>
      ) : null}
    </>
  );
}
