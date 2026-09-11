"use client";

import { useState } from "react";

export default function ResourceEditForm({ resource, onSave, disabled = false, lessonChoices = null }) {
  const currentLessonId = resource.lessonIds?.[0] || "";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(resource.title || "");
  const [url, setUrl] = useState(resource.url || "");
  const [lessonId, setLessonId] = useState(currentLessonId);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    let saved = false;
    try {
      saved = await onSave(resource, { title, url, lessonId });
    } finally {
      setSaving(false);
    }
    if (saved) setOpen(false);
  }

  function reset() {
    setTitle(resource.title || "");
    setUrl(resource.url || "");
    setLessonId(currentLessonId);
  }

  function cancel() {
    reset();
    setOpen(false);
  }

  function toggleEditor() {
    if (!open) reset();
    setOpen((current) => !current);
  }

  return (
    <div className="classPlanResourceEdit">
      <button
        className="btn"
        type="button"
        onClick={toggleEditor}
        disabled={disabled || saving}
        aria-expanded={open}
      >
        Edit
      </button>
      {open ? (
        <form className="classPlanResourceEditPanel" onSubmit={submit}>
          <strong>Edit resource</strong>
          <label>
            <span>Display name</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
              autoFocus
            />
          </label>
          {resource.resource_type === "link" ? (
            <label>
              <span>URL</span>
              <input
                className="input"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                required
              />
            </label>
          ) : (
            <small>The uploaded file stays the same; only its displayed name will change.</small>
          )}
          {lessonChoices?.length ? (
            <label>
              <span>Lesson</span>
              <select
                className="input"
                value={lessonId}
                onChange={(event) => setLessonId(event.target.value)}
                required
              >
                {lessonChoices.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.label}
                  </option>
                ))}
              </select>
              <small>The resource follows this lesson wherever it appears on your schedule.</small>
            </label>
          ) : null}
          <div className="classPlanResourceEditActions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn" type="button" onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
