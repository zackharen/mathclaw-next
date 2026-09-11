"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const fileRef = useRef(null);
  const [lessonIds, setLessonIds] = useState(() => lessons.map((lesson) => lesson.id));
  const [mode, setMode] = useState("file");
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const site = url ? getLessonResourceSiteSuggestion(url, siteNames) : null;
  const needsSiteName = Boolean(site?.hostname) && site.source === "unknown";

  function toggleLesson(lessonId) {
    setLessonIds((current) =>
      current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId]
    );
  }

  async function save(work, pendingMessage, doneMessage) {
    if (lessonIds.length === 0) {
      setStatus("Choose a lesson.");
      return;
    }
    setSaving(true);
    setStatus(pendingMessage);
    try {
      await work();
      setStatus(doneMessage);
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function uploadFile(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose a file.");
      return;
    }
    const validation = validateLessonResourceFile(file);
    if (validation.error) {
      setStatus(validation.error);
      return;
    }
    save(
      async () => {
        await uploadLessonResourceFile({ ownerId, courseId, classDate, lessonIds, title: "", file });
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
    <details className="allClassesGridFiles">
      <summary className="btn">{resources.length > 0 ? `Files (${resources.length})` : "＋ Add File"}</summary>
      <div className="allClassesGridFilesPanel">
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
          <button className={`btn${mode === "file" ? " primary" : ""}`} type="button" onClick={() => setMode("file")}>
            File
          </button>
          <button className={`btn${mode === "link" ? " primary" : ""}`} type="button" onClick={() => setMode("link")}>
            Link
          </button>
        </div>
        {mode === "file" ? (
          <form onSubmit={uploadFile}>
            <input className="input" type="file" ref={fileRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required />
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Uploading…" : "Upload"}
            </button>
          </form>
        ) : (
          <form onSubmit={addLink}>
            <input
              className="input"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
            />
            {needsSiteName ? (
              <input
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
        {status ? <small aria-live="polite">{status}</small> : null}
      </div>
    </details>
  );
}
