"use client";

import { useRef, useState } from "react";
import { GridSaveStatus, useGridSaveFeedback, useGridLessonSelection } from "./grid-save-feedback";
import { useGridCellToggle } from "./grid-cell-toggle";
import {
  LESSON_RESOURCE_FILE_ACCEPT,
  getLessonResourceSiteSuggestion,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { postLessonResource, uploadLessonResourceFile } from "@/lib/lesson-resources/client";

// Compact Files control for one all-classes grid cell. Lists the day's files and
// adds new ones to that day's lessons -- the same records the class plan's Lesson
// Resources panel shows, so anything added here appears there too.
export default function GridCellResources({ ownerId, courseId, classDate, lessons, resources, siteNames }) {
  const feedback = useGridSaveFeedback();
  const { saving, locked, beginSave, setSaving, setStatus, reportError, refresh } = feedback;
  const fileRef = useRef(null);
  const { buttonProps, panelProps } = useGridCellToggle();
  const { lessonIds, toggleLesson } = useGridLessonSelection(lessons);
  const [mode, setMode] = useState("file");
  const [fileTitle, setFileTitle] = useState("");
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const site = url ? getLessonResourceSiteSuggestion(url, siteNames) : null;
  const needsSiteName = Boolean(site?.hostname) && site.source === "unknown";


  async function save(work, pendingMessage, doneMessage) {
    if (locked.current) return;
    if (lessonIds.length === 0) {
      reportError("Choose a lesson.");
      return;
    }
    if (!beginSave()) return;
    setStatus(pendingMessage);
    try {
      await work();
      setStatus(doneMessage);
      refresh();
    } catch (error) {
      reportError(error.message);
    } finally {
      setSaving(false);
    }
  }

  function uploadFile(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      reportError("Choose a file.");
      return;
    }
    const validation = validateLessonResourceFile(file);
    if (validation.error) {
      reportError(validation.error);
      return;
    }
    save(
      async () => {
        await uploadLessonResourceFile({ ownerId, courseId, classDate, lessonIds, title: fileTitle, file });
        setFileTitle("");
        if (fileRef.current) fileRef.current.value = "";
      },
      "Uploading…",
      "File added."
    );
  }

  function addLink(event) {
    event.preventDefault();
    save(
      async () => {
        await postLessonResource({ action: "create-link", courseId, classDate, lessonIds, title: "", url, siteName });
        setUrl("");
        setSiteName("");
      },
      "Adding…",
      "Link added."
    );
  }

  return (
    <>
      <button className="btn allClassesGridToggle allClassesGridSlotFiles" {...buttonProps}>
        {resources.length > 0 ? `Files (${resources.length})` : "＋ Add File"}
      </button>
      <div className="allClassesGridFilesPanel allClassesGridPanel" {...panelProps}>
        <strong className="allClassesGridPanelTitle">Files</strong>
        {resources.length > 0 ? (
          <ul>
            {resources.map((resource) => (
              <li key={resource.id}>
                <a href={`/api/lesson-resources/${resource.id}/open`} target="_blank" rel="noreferrer">
                  {resource.title}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {lessons.length > 1 ? (
          <fieldset className="allClassesGridFilesLessons">
            <legend>Attach to</legend>
            {lessons.map((lesson) => (
              <label key={lesson.id}>
                <input
                  disabled={saving}
                  type="checkbox"
                  checked={lessonIds.includes(lesson.id)}
                  onChange={() => toggleLesson(lesson.id)}
                />
                <span>{lesson.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="allClassesGridFilesTabs" role="group" aria-label="Resource type">
          <button className={`btn${mode === "file" ? " primary" : ""}`} type="button" disabled={saving} onClick={() => setMode("file")}>
            File
          </button>
          <button className={`btn${mode === "link" ? " primary" : ""}`} type="button" disabled={saving} onClick={() => setMode("link")}>
            Link
          </button>
        </div>
        {mode === "file" ? (
          <form onSubmit={uploadFile}>
            <label>
              <span>Display name</span>
              <input
                disabled={saving}
                className="input"
                value={fileTitle}
                onChange={(event) => setFileTitle(event.target.value)}
                maxLength={160}
                placeholder="Defaults to the file name"
              />
            </label>
            <input disabled={saving} className="input" type="file" ref={fileRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required />
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Uploading…" : "Upload"}
            </button>
          </form>
        ) : (
          <form onSubmit={addLink}>
            <input
              disabled={saving}
              className="input"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
            />
            {needsSiteName ? (
              <input
                disabled={saving}
                className="input"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                maxLength={80}
                placeholder={`What to call ${site.hostname}`}
                required
              />
            ) : null}
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add Link"}
            </button>
          </form>
        )}
        <GridSaveStatus {...feedback} />
      </div>
    </>
  );
}
