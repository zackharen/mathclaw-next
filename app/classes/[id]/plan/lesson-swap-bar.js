"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { swapLessonsAction } from "./actions";

const FORM_ID = "lesson-swap-form";
const CHECKBOX_SELECTOR = `input[form="${FORM_ID}"][name="swap_lesson"]`;

function SwitchButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Switching…" : "Switch Lessons"}
    </button>
  );
}

// The Switch checkboxes live on each lesson card and join this form through
// their form="lesson-swap-form" attribute. Two picks show the Switch button;
// further boxes are disabled until one is unchecked.
export default function LessonSwapBar({ courseId, message }) {
  const [picked, setPicked] = useState(0);
  const [notice, setNotice] = useState(message);

  useEffect(() => {
    function sync() {
      const boxes = [...document.querySelectorAll(CHECKBOX_SELECTOR)];
      const count = boxes.filter((box) => box.checked).length;
      for (const box of boxes) box.disabled = !box.checked && count >= 2;
      setPicked(count);
    }
    function onChange(event) {
      if (event.target.matches?.(CHECKBOX_SELECTOR)) {
        setNotice(null);
        sync();
      }
    }
    sync();
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  function clear() {
    for (const box of document.querySelectorAll(CHECKBOX_SELECTOR)) {
      box.checked = false;
      box.disabled = false;
    }
    setPicked(0);
  }

  return (
    <form id={FORM_ID} action={swapLessonsAction}>
      <input type="hidden" name="course_id" value={courseId} />
      {picked > 0 || notice ? (
        <div className={`lessonSwapBar${notice?.kind === "error" ? " lessonSwapBarError" : ""}`} role="status">
          {picked > 0 ? (
            <>
              <span>
                {picked === 1 ? "1 lesson picked. Check one more to switch them." : "2 lessons picked."}
              </span>
              <div className="lessonSwapBarActions">
                {picked === 2 ? <SwitchButton /> : null}
                <button className="btn" type="button" onClick={clear}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <span>{notice.text}</span>
              <button className="btn" type="button" onClick={() => setNotice(null)}>
                OK
              </button>
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
