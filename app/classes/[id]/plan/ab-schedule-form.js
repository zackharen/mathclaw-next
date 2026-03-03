"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function ABSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className={`btn ${pending ? "primary" : ""}`} type="submit" disabled={pending}>
      {pending ? "Applying..." : "Apply AB Schedule"}
    </button>
  );
}

export default function ABScheduleForm({
  courseId,
  initialA,
  initialB,
  action,
}) {
  const [meetsA, setMeetsA] = useState(initialA);
  const [meetsB, setMeetsB] = useState(initialB);

  function onSubmit(event) {
    if (!meetsA && !meetsB) {
      event.preventDefault();
      window.alert("Select at least one meeting day (A or B).");
    }
  }

  return (
    <form action={action} onSubmit={onSubmit} className="abScheduleForm">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="meet_a" value={meetsA ? "1" : "0"} />
      <input type="hidden" name="meet_b" value={meetsB ? "1" : "0"} />

      <button
        type="button"
        className={`btn toggleBtn ${meetsA ? "active" : ""}`}
        onClick={() => setMeetsA((v) => !v)}
      >
        A Day
      </button>

      <button
        type="button"
        className={`btn toggleBtn ${meetsB ? "active" : ""}`}
        onClick={() => setMeetsB((v) => !v)}
      >
        B Day
      </button>

      <ABSubmitButton />
    </form>
  );
}
