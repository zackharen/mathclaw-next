"use client";

import { useFormStatus } from "react-dom";

export default function ApplyCalendarSubmit({ calendarUpdated }) {
  const { pending } = useFormStatus();

  return (
    <>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Applying..." : "Apply Calendar Changes"}
      </button>
      {pending ? (
        <span className="statusNote">
          Updating<span className="updatingDots">...</span>
        </span>
      ) : null}
      {!pending && calendarUpdated ? (
        <span className="statusNote">Calendar Updated!</span>
      ) : null}
    </>
  );
}
