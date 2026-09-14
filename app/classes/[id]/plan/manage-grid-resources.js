"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeLessonResourceUrl } from "@/lib/lesson-resources/constants";
import { postLessonResource } from "@/lib/lesson-resources/client";

function draftFor(resource, courses) {
  const firstLessonId = resource.lessons[0]?.id || "";
  const course = courses.find((option) =>
    option.lessons.some((lesson) => lesson.id === firstLessonId)
  );
  return {
    title: resource.title,
    url: resource.url || "",
    courseId: course?.id || "",
    lessonId: firstLessonId,
    error: "",
  };
}

export default function ManageGridResources() {
  const router = useRouter();
  const [resources, setResources] = useState([]);
  const [courses, setCourses] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses]
  );
  const visibleResources = useMemo(
    () => resources.filter((resource) =>
      `${resource.title} ${resource.file_name || ""} ${resource.url || ""}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase())
    ),
    [resources, filter]
  );

  async function load() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/lesson-resources", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Uploaded items could not be loaded.");
      setResources(data.resources || []);
      setCourses(data.courses || []);
      setDrafts(Object.fromEntries(
        (data.resources || []).map((resource) => [
          resource.id,
          draftFor(resource, data.courses || []),
        ])
      ));
      setLoaded(true);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function changeDraft(resourceId, changes) {
    setDrafts((current) => ({
      ...current,
      [resourceId]: { ...current[resourceId], ...changes, error: "" },
    }));
  }

  function changeCourse(resourceId, courseId) {
    changeDraft(resourceId, {
      courseId,
      lessonId: "",
    });
  }

  function changed(resource) {
    const draft = drafts[resource.id];
    if (!draft) return false;
    const original = draftFor(resource, courses);
    return draft.title !== original.title ||
      draft.url !== original.url ||
      draft.lessonId !== original.lessonId;
  }

  async function saveAll(event) {
    event.preventDefault();
    const changedResources = resources.filter(changed);
    if (changedResources.length === 0) {
      setStatus("No changes to save.");
      return;
    }

    const errors = new Map();
    for (const resource of changedResources) {
      const draft = drafts[resource.id];
      if (!draft.title.trim()) errors.set(resource.id, "Enter an item name.");
      else if (resource.resource_type === "link" && !normalizeLessonResourceUrl(draft.url)) {
        errors.set(resource.id, "Enter a valid http or https link.");
      } else if (draft.lessonId !== draftFor(resource, courses).lessonId &&
        !courseById.get(draft.courseId)?.lessons.some((lesson) => lesson.id === draft.lessonId)) {
        errors.set(resource.id, "Choose a valid class and lesson.");
      }
    }
    if (errors.size > 0) {
      setDrafts((current) => Object.fromEntries(
        Object.entries(current).map(([id, draft]) => [
          id,
          { ...draft, error: errors.get(id) || "" },
        ])
      ));
      setStatus("Fix the highlighted items before saving.");
      return;
    }

    setSaving(true);
    setStatus(`Saving ${changedResources.length} item${changedResources.length === 1 ? "" : "s"}…`);
    let savedCount = 0;
    const failed = new Map();
    const updated = new Map();
    for (const resource of changedResources) {
      const draft = drafts[resource.id];
      const original = draftFor(resource, courses);
      try {
        const result = await postLessonResource({
          action: "update",
          resourceId: resource.id,
          courseId: draft.courseId || undefined,
          title: draft.title,
          url: resource.resource_type === "link" ? draft.url : "",
          ...(draft.lessonId !== original.lessonId ? { lessonId: draft.lessonId } : {}),
        });
        savedCount += 1;
        const movedLesson = draft.lessonId !== original.lessonId
          ? courseById.get(draft.courseId)?.lessons.find((lesson) => lesson.id === draft.lessonId)
          : null;
        updated.set(resource.id, {
          ...resource,
          ...result.resource,
          lessons: movedLesson ? [movedLesson] : resource.lessons,
        });
      } catch (error) {
        failed.set(resource.id, error.message || "This item could not be saved.");
      }
    }

    if (savedCount > 0) {
      setResources((current) => current.map((resource) => updated.get(resource.id) || resource));
      setDrafts((current) => Object.fromEntries(
        Object.entries(current).map(([id, draft]) => [
          id,
          updated.has(id) ? draftFor(updated.get(id), courses) : draft,
        ])
      ));
      router.refresh();
    }
    if (failed.size > 0) {
      setDrafts((current) => Object.fromEntries(
        Object.entries(current).map(([id, draft]) => [
          id,
          { ...draft, error: failed.get(id) || "" },
        ])
      ));
      setStatus(`${savedCount} saved; ${failed.size} item${failed.size === 1 ? "" : "s"} need attention.`);
    } else {
      setStatus(`${savedCount} item${savedCount === 1 ? "" : "s"} updated.`);
    }
    setSaving(false);
  }

  return (
    <details
      className="allClassesBulkResources allClassesManageResources"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) load();
      }}
    >
      <summary>Manage Uploaded Items</summary>
      <div className="allClassesManageResourcesBody">
        <p>Edit your saved items from any week. A resource follows its lesson wherever that lesson appears.</p>
        <div className="allClassesManageResourcesToolbar">
          <input
            className="input"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search items"
            aria-label="Search uploaded items"
          />
          <button className="btn" type="button" onClick={load} disabled={loading || saving}>
            {loading ? "Loading…" : "Refresh List"}
          </button>
          {loaded ? <small>{resources.length} item{resources.length === 1 ? "" : "s"}</small> : null}
        </div>
        {loaded && resources.length === 0 ? <p>No uploaded items yet.</p> : null}
        {loaded && resources.length > 0 ? (
          <form onSubmit={saveAll}>
            <div className="allClassesBulkResourcesScroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Item Name</th>
                    <th scope="col">Type &amp; Item</th>
                    <th scope="col">Class</th>
                    <th scope="col">Lesson</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleResources.map((resource) => {
                    const draft = drafts[resource.id];
                    const course = courseById.get(draft?.courseId);
                    const originalLessonId = resource.lessons[0]?.id || "";
                    const currentLessonLabel = resource.lessons.length > 1
                      ? `${resource.lessons.length} lessons attached`
                      : resource.lessons[0]?.label || "No associated lesson";
                    return (
                      <tr key={resource.id}>
                        <td>
                          <input
                            className="input"
                            value={draft?.title || ""}
                            onChange={(event) => changeDraft(resource.id, { title: event.target.value })}
                            maxLength={160}
                            aria-label={`Item name for ${resource.title}`}
                            required
                          />
                          {draft?.error ? <small className="errorText">{draft.error}</small> : null}
                        </td>
                        <td>
                          <small>{resource.resource_type === "file" ? "File" : "Link"}</small>
                          {resource.resource_type === "link" ? (
                            <input
                              className="input"
                              type="url"
                              value={draft?.url || ""}
                              onChange={(event) => changeDraft(resource.id, { url: event.target.value })}
                              aria-label={`URL for ${resource.title}`}
                              required
                            />
                          ) : <small className="allClassesManageFileName">{resource.file_name}</small>}
                          <a href={`/api/lesson-resources/${resource.id}/open`} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </td>
                        <td>
                          <select
                            className="input"
                            value={draft?.courseId || ""}
                            onChange={(event) => changeCourse(resource.id, event.target.value)}
                            aria-label={`Class for ${resource.title}`}
                          >
                            {!draft?.courseId ? <option value="">Choose class</option> : null}
                            {courses.map((option) => (
                              <option key={option.id} value={option.id}>{option.title}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="input"
                            value={draft?.lessonId || ""}
                            onChange={(event) => changeDraft(resource.id, { lessonId: event.target.value })}
                            aria-label={`Lesson for ${resource.title}`}
                          >
                            {!course?.lessons.some((lesson) => lesson.id === draft?.lessonId) ? (
                              <option value={draft?.lessonId || ""}>
                                {draft?.lessonId ? currentLessonLabel : "Choose lesson"}
                              </option>
                            ) : null}
                            {(course?.lessons || []).map((lesson) => (
                              <option key={lesson.id} value={lesson.id}>{lesson.label}</option>
                            ))}
                          </select>
                          {resource.lessons.length > 1 && draft?.lessonId === originalLessonId ? (
                            <small>All {resource.lessons.length} attachments stay unless you choose another lesson.</small>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleResources.length === 0 ? <p>No matching items.</p> : null}
            <div className="ctaRow allClassesBulkSave">
              <button className="btn primary" type="submit" disabled={saving || loading}>
                {saving ? "Saving All…" : "Save All Changes"}
              </button>
              {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
            </div>
          </form>
        ) : status ? <span className="statusNote" role="status">{status}</span> : null}
      </div>
    </details>
  );
}
