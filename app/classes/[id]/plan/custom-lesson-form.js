"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { addCustomLessonAction, removeCustomLessonAction } from "./actions";

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

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        + Custom Lesson
      </button>
    );
  }

  return (
    <form action={addCustomLessonAction} className="customLessonForm">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="class_date" value={classDate} />
      <label>
        <span>Lesson title</span>
        <input name="title" required maxLength={120} placeholder="e.g. Unit Circle Review" autoFocus />
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
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RemoveCustomLessonButton({ courseId, classDate, lessonId, lessonLabel }) {
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
      <SubmitButton idle="Remove" busy="Removing…" className="btn customLessonRemove" />
    </form>
  );
}
