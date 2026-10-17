"use client";

import { saveGridPlanAction, updateDailyLessonCountAction } from "./actions";
import { GridSaveStatus, runGridPacingSave, useGridSaveFeedback } from "./grid-save-feedback";

export default function LessonCountToggle({
  courseId,
  classDate,
  currentCount,
  returnTo,
  disabled = false,
  inPlace = false,
}) {
  const feedback = useGridSaveFeedback();
  const selectedCount = Math.max(0, Math.min(2, Number(currentCount) || 0));

  return (
    <div className="lessonCountControl" aria-label="Lessons planned for this day">
      <span className="lessonCountLabel">Lessons</span>
      <div className="lessonCountToggle">
        {[0, 1, 2].map((count) => (
          <form action={inPlace ? (data) => {
            data.set("grid_action", "count");
            runGridPacingSave(feedback, { courseId, returnTo, action: () => saveGridPlanAction(data) });
          } : updateDailyLessonCountAction} key={count} aria-busy={feedback.saving}>
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="class_date" value={classDate} />
            <input type="hidden" name="lesson_count" value={count} />
            {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
            <button
              className={`lessonCountOption${selectedCount === count ? " isSelected" : ""}`}
              type="submit"
              disabled={disabled || feedback.saving || selectedCount === count}
              aria-pressed={selectedCount === count}
              aria-label={`${count} lesson${count === 1 ? "" : "s"} on this day`}
            >
              {count}
            </button>
          </form>
        ))}
      </div>
      {inPlace ? <GridSaveStatus {...feedback} /> : null}
      {disabled ? <span className="lessonCountLocked">Completed</span> : null}
    </div>
  );
}
