"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_RESOURCE_FILE_ACCEPT,
  getLessonResourceSiteSuggestion,
  normalizeLessonResourceUrl,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { postLessonResource, uploadLessonResourceFile } from "@/lib/lesson-resources/client";

function blankRow(id, courses) {
  const course = courses[0];
  return {
    id,
    title: "",
    resourceType: "link",
    url: "",
    file: null,
    siteName: "",
    courseId: course?.id || "",
    lessonId: course?.lessons[0]?.id || "",
    error: "",
  };
}

export default function BulkGridResources({ ownerId, courses, siteNames }) {
  const router = useRouter();
  const nextId = useRef(2);
  const [rows, setRows] = useState(() => [blankRow(1, courses)]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses]
  );

  function updateRow(id, updates) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates, error: "" } : row))
    );
  }

  function changeCourse(row, courseId) {
    const course = courseById.get(courseId);
    updateRow(row.id, { courseId, lessonId: course?.lessons[0]?.id || "" });
  }

  function addRow() {
    const id = nextId.current;
    nextId.current += 1;
    setRows((current) => [...current, blankRow(id, courses)]);
    setStatus("");
  }

  function removeRow(id) {
    setRows((current) => {
      const remaining = current.filter((row) => row.id !== id);
      return remaining.length > 0 ? remaining : [blankRow(nextId.current++, courses)];
    });
    setStatus("");
  }

  function validateRow(row) {
    if (!row.title.trim()) return "Enter an item name.";
    const course = courseById.get(row.courseId);
    const lesson = course?.lessons.find((option) => option.id === row.lessonId);
    if (!course || !lesson) return "Choose a class and lesson from this two-week view.";
    if (row.resourceType === "file") {
      if (!row.file) return "Choose a file.";
      return validateLessonResourceFile(row.file).error || "";
    }
    if (!normalizeLessonResourceUrl(row.url)) return "Enter a valid http or https link.";
    const site = getLessonResourceSiteSuggestion(row.url, siteNames);
    if (site.source === "unknown" && !row.siteName.trim()) {
      return `Enter a site name for ${site.hostname}.`;
    }
    return "";
  }

  async function saveRow(row) {
    const course = courseById.get(row.courseId);
    const lesson = course.lessons.find((option) => option.id === row.lessonId);
    if (row.resourceType === "file") {
      return uploadLessonResourceFile({
        ownerId,
        courseId: course.id,
        classDate: lesson.classDate,
        lessonIds: [lesson.id],
        title: row.title,
        file: row.file,
      });
    }
    return postLessonResource({
      action: "create-link",
      courseId: course.id,
      classDate: lesson.classDate,
      lessonIds: [lesson.id],
      title: row.title,
      url: row.url,
      siteName: row.siteName,
    });
  }

  async function saveAll(event) {
    event.preventDefault();
    const errors = new Map(rows.map((row) => [row.id, validateRow(row)]));
    if ([...errors.values()].some(Boolean)) {
      setRows((current) =>
        current.map((row) => ({ ...row, error: errors.get(row.id) || "" }))
      );
      setStatus("Fix the highlighted rows before saving.");
      return;
    }

    setSaving(true);
    setStatus(`Saving ${rows.length} item${rows.length === 1 ? "" : "s"}…`);
    const succeeded = new Set();
    const failed = new Map();
    for (const row of rows) {
      try {
        await saveRow(row);
        succeeded.add(row.id);
      } catch (error) {
        failed.set(row.id, error.message || "This item could not be saved.");
      }
    }

    if (failed.size > 0) {
      setRows((current) =>
        current
          .filter((row) => !succeeded.has(row.id))
          .map((row) => ({ ...row, error: failed.get(row.id) || "" }))
      );
      setStatus(
        `${succeeded.size} saved. ${failed.size} item${failed.size === 1 ? "" : "s"} still need attention.`
      );
    } else {
      setRows([blankRow(nextId.current++, courses)]);
      setStatus(`${succeeded.size} item${succeeded.size === 1 ? "" : "s"} attached.`);
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <details className="allClassesBulkResources">
      <summary>Bulk Attach Items</summary>
      <form onSubmit={saveAll}>
        <p>Add links or files to lessons scheduled in this two-week view.</p>
        <div className="allClassesBulkResourcesScroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Item Name</th>
                <th scope="col">Type &amp; Item</th>
                <th scope="col">Class</th>
                <th scope="col">Lesson</th>
                <th scope="col"><span className="srOnly">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const course = courseById.get(row.courseId) || courses[0];
                const site =
                  row.resourceType === "link" && row.url
                    ? getLessonResourceSiteSuggestion(row.url, siteNames)
                    : null;
                const needsSiteName = Boolean(site?.hostname) && site.source === "unknown";
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        className="input"
                        value={row.title}
                        onChange={(event) => updateRow(row.id, { title: event.target.value })}
                        maxLength={160}
                        placeholder="Item name"
                        aria-label="Item name"
                        required
                      />
                    </td>
                    <td>
                      <div className="allClassesBulkResourceSource">
                        <select
                          className="input"
                          value={row.resourceType}
                          onChange={(event) =>
                            updateRow(row.id, { resourceType: event.target.value })
                          }
                          aria-label={`Type for ${row.title || "item"}`}
                        >
                          <option value="link">Link</option>
                          <option value="file">File</option>
                        </select>
                        {row.resourceType === "file" ? (
                          <input
                            className="input"
                            type="file"
                            accept={LESSON_RESOURCE_FILE_ACCEPT}
                            onChange={(event) =>
                              updateRow(row.id, { file: event.target.files?.[0] || null })
                            }
                            aria-label={`File for ${row.title || "item"}`}
                            required
                          />
                        ) : (
                          <>
                            <input
                              className="input"
                              type="url"
                              value={row.url}
                              onChange={(event) =>
                                updateRow(row.id, { url: event.target.value, siteName: "" })
                              }
                              placeholder="https://…"
                              aria-label={`Link for ${row.title || "item"}`}
                              required
                            />
                            {needsSiteName ? (
                              <input
                                className="input"
                                value={row.siteName}
                                onChange={(event) =>
                                  updateRow(row.id, { siteName: event.target.value })
                                }
                                maxLength={80}
                                placeholder={`Name for ${site.hostname}`}
                                aria-label={`Site name for ${site.hostname}`}
                                required
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={row.courseId}
                        onChange={(event) => changeCourse(row, event.target.value)}
                        aria-label={`Class for ${row.title || "item"}`}
                      >
                        {courses.map((option) => (
                          <option key={option.id} value={option.id}>{option.title}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={row.lessonId}
                        onChange={(event) => updateRow(row.id, { lessonId: event.target.value })}
                        aria-label={`Lesson for ${row.title || "item"}`}
                      >
                        {(course?.lessons || []).map((lesson) => (
                          <option key={lesson.id} value={lesson.id}>{lesson.label}</option>
                        ))}
                      </select>
                      {row.error ? <small className="errorText">{row.error}</small> : null}
                    </td>
                    <td>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={saving}
                        aria-label={`Remove ${row.title || "item"}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="btn allClassesBulkAdd" type="button" onClick={addRow} disabled={saving}>
          ＋ Add New Item
        </button>
        <div className="ctaRow allClassesBulkSave">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving All…" : "Save All"}
          </button>
          {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
        </div>
      </form>
    </details>
  );
}
