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
// further boxes are disabled until one is unchecked. On the All Classes grid
// each box carries its class (data-course) and grid row (data-return), and
// once one is picked only that class's lessons stay pickable.
export default function LessonSwapBar({ courseId = "", message }) {
  const [picked, setPicked] = useState(0);
  const [pickedCourse, setPickedCourse] = useState(courseId);
  const [returnTo, setReturnTo] = useState("");
  const [notice, setNotice] = useState(message);
  const [startFresh] = useState(Boolean(message));

  useEffect(() => {
    function sync() {
      const boxes = [...document.querySelectorAll(CHECKBOX_SELECTOR)];
      const checked = boxes.filter((box) => box.checked);
      const course = checked[0]?.dataset.course || "";
      for (const box of boxes) {
        box.disabled = !box.checked && (checked.length >= 2 || Boolean(course && box.dataset.course && box.dataset.course !== course));
      }
      setPicked(checked.length);
      setPickedCourse(course || courseId);
      setReturnTo(checked[0]?.dataset.return || "");
    }
    function onChange(event) {
      if (event.target.matches?.(CHECKBOX_SELECTOR)) {
        setNotice(null);
        sync();
      }
    }
    // After a switch the page keeps the same checkbox elements, still checked,
    // even though those days now hold the other lessons. Start fresh.
    if (startFresh) {
      for (const box of document.querySelectorAll(CHECKBOX_SELECTOR)) box.checked = false;
    }
    sync();
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [startFresh, courseId]);

  function clear() {
    for (const box of document.querySelectorAll(CHECKBOX_SELECTOR)) {
      box.checked = false;
      box.disabled = false;
    }
    setPicked(0);
    setPickedCourse(courseId);
    setReturnTo("");
  }

  return (
    <form id={FORM_ID} action={swapLessonsAction}>
      <input type="hidden" name="course_id" value={pickedCourse} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
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
