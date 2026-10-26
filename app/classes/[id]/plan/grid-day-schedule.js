"use client";

import { useState } from "react";
import { SCHEDULE_DAY_TYPES } from "@/lib/school-calendar";
import { refreshGridAnnouncementsAction, updateGridDayScheduleAction } from "./actions";
import { GridSaveStatus, useGridSaveFeedback } from "./grid-save-feedback";

const QUEUE_KEY = "grid-day-schedule";

// Day-column picker: one schedule for this date across every regular class.
// `scheduleType` is "mixed" when the classes currently disagree.
export default function GridDaySchedule({ classDate, scheduleType, returnTo }) {
  const feedback = useGridSaveFeedback();
  const [selected, setSelected] = useState(scheduleType);
  const [shown, setShown] = useState(scheduleType);
  // Follow the server's value once the grid refreshes.
  if (shown !== scheduleType) {
    setShown(scheduleType);
    setSelected(scheduleType);
  }

  function change(event) {
    const dayType = event.target.value;
    const label = SCHEDULE_DAY_TYPES.find((type) => type.value === dayType)?.label || "Schedule";
    setSelected(dayType);
    const data = new FormData();
    data.set("class_date", classDate);
    data.set("day_type", dayType);
    if (returnTo) data.set("return_to", returnTo);

    let failedAnnouncementIds = [];
    const retryAnnouncements = () =>
      feedback.run(
        async () => {
          const outcomes = await Promise.all(
            failedAnnouncementIds.map((id) => refreshGridAnnouncementsAction(id, returnTo))
          );
          return outcomes.find((outcome) => !outcome?.ok) || { ok: true };
        },
        "Announcements updated",
        { queueKey: QUEUE_KEY }
      );

    feedback.run(
      async () => {
        const result = await updateGridDayScheduleAction(data);
        if (!result?.ok) {
          setSelected(scheduleType);
          return result;
        }
        failedAnnouncementIds = result.announcementsFailedCourseIds;
        if (failedAnnouncementIds.length) return { ok: true, announcementsFailed: true };
        if (result.lockedTitles.length) {
          return { error: `${label} saved, except ${result.lockedTitles.join(", ")} (lessons already completed that day).` };
        }
        return result;
      },
      `${label} saved`,
      { queueKey: QUEUE_KEY, onRetry: retryAnnouncements }
    );
  }

  return (
    <div className="allClassesGridDaySchedule">
      <select
        className="allClassesGridDayScheduleSelect"
        aria-label={`Schedule for ${classDate}`}
        value={selected}
        disabled={feedback.saving}
        onChange={change}
      >
        {selected === "mixed" ? (
          <option value="mixed" disabled>
            Mixed
          </option>
        ) : null}
        {SCHEDULE_DAY_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <GridSaveStatus {...feedback} />
    </div>
  );
}
