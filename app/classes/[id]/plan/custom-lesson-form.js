"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { addCustomLessonAction, removeCustomLessonAction } from "./actions";
import { useGridCellToggle } from "./grid-cell-toggle";

function SubmitButton({ idle, busy, className = "btn primary" }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

// "+ Custom Lesson" on a lesson day: the new lesson takes this day and every
// later lesson moves back one slot. Only this class gets it.
export default function CustomLessonForm({ courseId, classDate }) {
  const [open, setOpen] = useState(false);

  if (open) return <CustomLessonFields courseId={courseId} classDate={classDate} onCancel={() => setOpen(false)} />;
  return (
    <button className="btn" type="button" onClick={() => setOpen(true)}>
      + Custom Lesson
    </button>
  );
}

function CustomLessonFields({ courseId, classDate, returnTo = null, onCancel = null }) {
  return (
    <form action={addCustomLessonAction} className="customLessonForm">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="class_date" value={classDate} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <label>
        <span>Lesson title</span>
        <input name="title" required maxLength={120} placeholder="e.g. Unit Circle Review" autoFocus={Boolean(onCancel)} />
      </label>
      <label>
        <span>Objective (optional)</span>
        <textarea name="objective" maxLength={500} rows={2} />
      </label>
      <p className="customLessonFormNote">
        Goes on this day. Later lessons move back one class day. Only this class is changed.
      </p>
      <div className="ctaRow">
        <SubmitButton idle="Add Lesson" busy="Adding…" />
        {onCancel ? (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function RemoveCustomLessonButton({ courseId, classDate, lessonId, lessonLabel, returnTo = null }) {
  return (
    <form
      action={removeCustomLessonAction}
      onSubmit={(event) => {
        if (!window.confirm(`Remove "${lessonLabel}" from this class? Later lessons move up one class day.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="class_date" value={classDate} />
      <input type="hidden" name="lesson_id" value={lessonId} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <SubmitButton idle="Remove" busy="Removing…" className="btn customLessonRemove" />
    </form>
  );
}

// All Classes grid: a full-width button under the cell's 2x2 actions. Its
// panel adds a custom lesson to this class on this day and lists the cell's
// custom lessons with Remove.
export function GridCellCustomLessons({ courseId, classDate, returnTo, customLessons }) {
  const { buttonProps, panelProps } = useGridCellToggle();
  return (
    <>
      <button className="btn allClassesGridToggle allClassesGridSlotCustom" {...buttonProps}>
        + Custom Lesson
      </button>
      <div className="allClassesGridFilesPanel allClassesGridPanel" {...panelProps}>
        <strong className="allClassesGridPanelTitle">Custom Lesson</strong>
        {customLessons.length > 0 ? (
          <ul className="gridCustomLessonList">
            {customLessons.map((lesson) => (
              <li key={lesson.id}>
                <span>{lesson.label}</span>
                {lesson.planned ? (
                  <RemoveCustomLessonButton
                    courseId={courseId}
                    classDate={classDate}
                    lessonId={lesson.id}
                    lessonLabel={lesson.label}
                    returnTo={returnTo}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <CustomLessonFields courseId={courseId} classDate={classDate} returnTo={returnTo} />
      </div>
    </>
  );
}
