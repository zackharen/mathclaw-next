"use client";

import { useState } from "react";

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
      <label className="abCheck">
        <input
          type="checkbox"
          name="meet_a"
          checked={meetsA}
          onChange={(e) => setMeetsA(e.target.checked)}
        />
        <span>A Day</span>
      </label>
      <label className="abCheck">
        <input
          type="checkbox"
          name="meet_b"
          checked={meetsB}
          onChange={(e) => setMeetsB(e.target.checked)}
        />
        <span>B Day</span>
      </label>
      <button className="btn" type="submit">Apply AB Days</button>
    </form>
  );
}
