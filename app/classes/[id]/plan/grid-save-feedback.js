"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshGridAnnouncementsAction } from "./actions";

// Pacing changes for one class rebuild its whole plan and then regenerate its
// announcements from that plan. Run them one at a time per class, so a quick
// second change never interleaves with the first and the last write to land
// reflects the final schedule. Other classes keep saving in parallel.
const pacingQueues = new Map();

function enqueuePacing(key, task) {
  const previous = pacingQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tail = next.catch(() => {});
  pacingQueues.set(key, tail);
  tail.then(() => {
    if (pacingQueues.get(key) === tail) pacingQueues.delete(key);
  });
  return next;
}

// Keep pending urgent (outside the transition), including the refresh that
// reconciles server-rendered cells. The ref also blocks same-tick submissions.
export function useGridSaveFeedback() {
  const router = useRouter();
  const locked = useRef(false);
  const [working, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(null);
  const saving = working || refreshing;

  useEffect(() => {
    if (!saving) locked.current = false;
  });

  useEffect(() => {
    if (saving || error || !status) return;
    const timer = setTimeout(() => setStatus(""), 3000);
    return () => clearTimeout(timer);
  }, [saving, status, error]);

  function beginSave(message = "Saving…") {
    if (locked.current) return false;
    locked.current = true;
    setSaving(true);
    setError("");
    setRetry(null);
    setStatus(message);
    return true;
  }

  function reportError(message) {
    setError(message || "Could not save. Try again.");
    setStatus("");
  }

  function clearFeedback() {
    setError("");
    setRetry(null);
    setStatus("");
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  // queueKey serializes pacing saves per class. A result with
  // announcementsFailed saved the lessons but not the announcement refresh, so
  // say so and offer onRetry instead of reporting a plain success or failure.
  function run(action, successMessage = "Saved", { queueKey = null, onRetry = null } = {}) {
    if (!beginSave()) return;
    startTransition(async () => {
      try {
        const result = await (queueKey ? enqueuePacing(queueKey, action) : action());
        if (!result?.ok) reportError(result?.error);
        else if (result.announcementsFailed && onRetry) {
          reportError("Lessons saved, but announcements didn't update.");
          setRetry(() => onRetry);
        } else setStatus(successMessage);
      } catch {
        reportError("Could not finish saving. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    });
  }

  return { saving, locked, beginSave, setSaving, status, setStatus, error, retry, reportError, clearFeedback, refresh, run };
}

// A replan can replace the lessons in a mounted cell. Never attach an item to
// IDs left over from the previous plan; a new lesson set starts fully selected.
export function useGridLessonSelection(lessons) {
  const ids = lessons.map((lesson) => lesson.id);
  const key = JSON.stringify(ids);
  const [selection, setSelection] = useState(null);
  const lessonIds = selection?.key === key ? selection.ids : ids;
  function toggleLesson(id) {
    setSelection((previous) => {
      const current = previous?.key === key ? previous.ids : ids;
      return { key, ids: current.includes(id) ? current.filter((value) => value !== id) : [...current, id] };
    });
  }
  return { lessonIds, toggleLesson };
}

export function GridSaveStatus({ saving, status, error, retry, pendingInControl = false }) {
  return (
    <>
      <span className={`gridSaveStatus${saving && pendingInControl ? " srOnly" : ""}`} role="status" aria-live="polite" aria-atomic="true">
        {saving ? <><span className="buttonSpinner" aria-hidden="true" />Saving…</>
          : !error && status ? <>✓ {status}</> : null}
      </span>
      {error ? (
        <span className="gridSaveError errorText" role="alert">
          {error}
          {retry && !saving ? (
            <>
              {" "}
              <button className="gridSaveRetry" type="button" onClick={retry}>
                Retry
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

// Run a pacing save for one class in the grid, with the announcement retry wired up.
export function runGridPacingSave(feedback, { courseId, returnTo, action, successMessage = "Saved" }) {
  const retryAnnouncements = () =>
    feedback.run(() => refreshGridAnnouncementsAction(courseId, returnTo), "Announcements updated", {
      queueKey: courseId,
    });
  feedback.run(action, successMessage, { queueKey: courseId, onRetry: retryAnnouncements });
}
