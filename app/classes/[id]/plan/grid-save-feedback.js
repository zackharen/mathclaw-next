"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Keep pending urgent (outside the transition), including the refresh that
// reconciles server-rendered cells. The ref also blocks same-tick submissions.
export function useGridSaveFeedback() {
  const router = useRouter();
  const locked = useRef(false);
  const [working, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
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
    setStatus(message);
    return true;
  }

  function reportError(message) {
    setError(message || "Could not save. Try again.");
    setStatus("");
  }

  function clearFeedback() {
    setError("");
    setStatus("");
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  function run(action, successMessage = "Saved") {
    if (!beginSave()) return;
    startTransition(async () => {
      try {
        const result = await action();
        if (!result?.ok) reportError(result?.error);
        else setStatus(successMessage);
      } catch {
        reportError("Could not finish saving. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    });
  }

  return { saving, locked, beginSave, setSaving, status, setStatus, error, reportError, clearFeedback, refresh, run };
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

export function GridSaveStatus({ saving, status, error, pendingInControl = false }) {
  return (
    <>
      <span className={`gridSaveStatus${saving && pendingInControl ? " srOnly" : ""}`} role="status" aria-live="polite" aria-atomic="true">
        {saving ? <><span className="buttonSpinner" aria-hidden="true" />Saving…</>
          : !error && status ? <>✓ {status}</> : null}
      </span>
      {error ? <span className="gridSaveError errorText" role="alert">{error}</span> : null}
    </>
  );
}
