"use client";

import { saveGridPlanAction } from "./actions";
import { GridSaveStatus, runGridPacingSave, useGridSaveFeedback } from "./grid-save-feedback";

function skipDetail({ skippedFrom, skippedAt }) {
  return [skippedFrom ? `Skipped from ${skippedFrom}` : "Skipped", skippedAt ? `on ${skippedAt}` : null]
    .filter(Boolean)
    .join(" ");
}

function SkippedLesson({ courseId, lesson }) {
  const feedback = useGridSaveFeedback();
  function undo() {
    const data = new FormData();
    data.set("grid_action", "restore");
    data.set("course_id", courseId);
    data.set("lesson_id", lesson.id);
    runGridPacingSave(feedback, {
      courseId,
      action: () => saveGridPlanAction(data),
      successMessage: `Undid skip of ${lesson.label}`,
    });
  }
  return (
    <li>
      <div className="allClassesSkipEntry">
        <span>{lesson.label}</span>
        <small>{skipDetail(lesson)}</small>
      </div>
      {lesson.past ? (
        <span className="allClassesSkipPast">Already past this point</span>
      ) : (
        <button className="btn" type="button" disabled={feedback.saving} aria-busy={feedback.saving} onClick={undo}
          aria-label={`Undo skip of ${lesson.label}`}>
          {feedback.saving ? "Undoing…" : "Undo skip"}
        </button>
      )}
      <GridSaveStatus {...feedback} pendingInControl />
    </li>
  );
}

// A log of the lessons skipped from each class in the grid. Undo puts a lesson
// back in sequence order and moves later lessons back a day; once a class has
// completed lessons beyond it, the skip stays.
export default function SkippedLessonsPanel({ classes }) {
  const total = classes.reduce((sum, entry) => sum + entry.lessons.length, 0);
  const undone = classes.flatMap((entry) => entry.undone.map((item) => ({ ...item, classTitle: entry.title })));
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
                    <SkippedLesson key={lesson.id} courseId={entry.id} lesson={lesson} />
                  ))}
                </ul>
              </section>
            ))
        )}
        {undone.length > 0 ? (
          <section className="allClassesSkipHistory">
            <h3>Undone skips</h3>
            <ul>
              {undone.map((item) => (
                <li key={item.key}>
                  <div className="allClassesSkipEntry">
                    <span>
                      {item.label} <small>· {item.classTitle}</small>
                    </span>
                    <small>
                      {skipDetail(item)}
                      {item.undoneAt ? `, undone ${item.undoneAt}` : ", undone"}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
