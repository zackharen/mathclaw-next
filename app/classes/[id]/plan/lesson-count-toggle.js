"use client";

import { useState } from "react";
import { saveGridPlanAction, updateDailyLessonCountAction } from "./actions";
import { GridSaveStatus, runGridPacingSave, useGridSaveFeedback } from "./grid-save-feedback";

export default function LessonCountToggle({
  courseId,
  classDate,
  currentCount,
  returnTo,
  disabled = false,
  inPlace = false,
  skipLessons = null,
}) {
  const feedback = useGridSaveFeedback();
  const [choosingSkip, setChoosingSkip] = useState(false);
  const canSkip = inPlace && Array.isArray(skipLessons) && skipLessons.length > 0 && !disabled;

  // Skip drops the lesson from this class; later lessons move up a day.
  function skip(lesson) {
    setChoosingSkip(false);
    const data = new FormData();
    data.set("grid_action", "skip");
    data.set("course_id", courseId);
    data.set("class_date", classDate);
    data.set("lesson_id", lesson.id);
    if (returnTo) data.set("return_to", returnTo);
    runGridPacingSave(feedback, {
      courseId,
      returnTo,
      action: () => saveGridPlanAction(data),
      successMessage: `Skipped ${lesson.label}`,
    });
  }
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
      {canSkip ? (
        <button
          className="lessonCountSkip"
          type="button"
          disabled={feedback.saving}
          aria-expanded={skipLessons.length > 1 ? choosingSkip : undefined}
          aria-label={skipLessons.length > 1 ? "Skip a lesson" : `Skip ${skipLessons[0].label}`}
          onClick={() => (skipLessons.length > 1 ? setChoosingSkip((open) => !open) : skip(skipLessons[0]))}
        >
          Skip
        </button>
      ) : null}
      {canSkip && choosingSkip && !feedback.saving ? (
        <div className="lessonCountSkipChooser" role="group" aria-label="Skip which lesson?">
          <span>Skip which lesson?</span>
          {skipLessons.map((lesson) => (
            <button key={lesson.id} className="btn" type="button" onClick={() => skip(lesson)}>
              {lesson.label}
            </button>
          ))}
          <button className="btn" type="button" onClick={() => setChoosingSkip(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {inPlace ? <GridSaveStatus {...feedback} /> : null}
      {disabled ? <span className="lessonCountLocked">Completed</span> : null}
    </div>
  );
}
