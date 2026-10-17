"use client";

import { saveGridPlanAction } from "./actions";
import { GridSaveStatus, runGridPacingSave, useGridSaveFeedback } from "./grid-save-feedback";

function RestoreButton({ courseId, lesson }) {
  const feedback = useGridSaveFeedback();
  function restore() {
    const data = new FormData();
    data.set("grid_action", "restore");
    data.set("course_id", courseId);
    data.set("lesson_id", lesson.id);
    runGridPacingSave(feedback, {
      courseId,
      action: () => saveGridPlanAction(data),
      successMessage: `Restored ${lesson.label}`,
    });
  }
  return (
    <li>
      <span>{lesson.label}</span>
      <button className="btn" type="button" disabled={feedback.saving} aria-busy={feedback.saving} onClick={restore}
        aria-label={`Restore ${lesson.label}`}>
        {feedback.saving ? "Restoring…" : "Restore"}
      </button>
      <GridSaveStatus {...feedback} pendingInControl />
    </li>
  );
}

// Lessons skipped from each class in the grid. Restoring puts a lesson back in
// sequence order and moves later lessons back a day.
export default function SkippedLessonsPanel({ classes }) {
  const total = classes.reduce((sum, entry) => sum + entry.lessons.length, 0);
  return (
    <details className="allClassesBulkResources allClassesSkippedLessons">
      <summary>Skipped Lessons ({total})</summary>
      <div className="allClassesSkippedLessonsBody">
        {total === 0 ? (
          <p>No skipped lessons. Use Skip beside a day&apos;s 0 / 1 / 2 buttons to drop a lesson from a class.</p>
        ) : (
          classes
            .filter((entry) => entry.lessons.length > 0)
            .map((entry) => (
              <section key={entry.id}>
                <h3>{entry.title}</h3>
                <ul>
                  {entry.lessons.map((lesson) => (
                    <RestoreButton key={lesson.id} courseId={entry.id} lesson={lesson} />
                  ))}
                </ul>
              </section>
            ))
        )}
      </div>
    </details>
  );
}
