"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_RESOURCE_BUCKET,
  LESSON_RESOURCE_FILE_ACCEPT,
  formatLessonResourceSize,
  sanitizeLessonResourceFileName,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { createClient } from "@/lib/supabase/client";

async function postLessonResource(body) {
  const response = await fetch("/api/lesson-resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Lesson resources could not be updated.");
  return data;
}

function ResourceLink({ resource, ownerName = "" }) {
  return (
    <div className="classPlanResourceIdentity">
      <span aria-hidden="true">{resource.resource_type === "file" ? "▧" : "↗"}</span>
      <span>
        <strong>{resource.title}</strong>
        <small>
          {ownerName ? `${ownerName} · ` : ""}
          {resource.resource_type === "file"
            ? `${resource.file_name || "File"} · ${formatLessonResourceSize(resource.size_bytes)}`
            : "Link"}
        </small>
      </span>
    </div>
  );
}

export default function LessonResourcesPanel({
  courseId,
  classDate,
  ownerId,
  lessonOptions,
  initialOwnResources,
  sharedResources,
  connectedTeachers,
}) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [ownResources, setOwnResources] = useState(initialOwnResources || []);
  const [selectedLessonIds, setSelectedLessonIds] = useState(
    lessonOptions.map((lesson) => lesson.id)
  );
  const [resourceType, setResourceType] = useState("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharingId, setSharingId] = useState("");
  const [shareSelections, setShareSelections] = useState(() =>
    Object.fromEntries((initialOwnResources || []).map((resource) => [resource.id, resource.sharedWith || []]))
  );

  const lessonLabelById = useMemo(
    () => new Map(lessonOptions.map((lesson) => [lesson.id, lesson.label])),
    [lessonOptions]
  );

  function toggleLesson(lessonId) {
    setSelectedLessonIds((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId]
    );
  }

  function lessonChips(resource) {
    return (resource.lessonIds || [])
      .filter((lessonId) => lessonLabelById.has(lessonId))
      .map((lessonId) => (
        <span className="classPlanResourceLessonChip" key={lessonId}>
          {lessonLabelById.get(lessonId)}
        </span>
      ));
  }

  async function addLink(event) {
    event.preventDefault();
    if (selectedLessonIds.length === 0) {
      setStatus("Choose at least one lesson.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const data = await postLessonResource({
        action: "create-link",
        courseId,
        classDate,
        lessonIds: selectedLessonIds,
        title,
        url,
      });
      setOwnResources((current) => [...current, data.resource]);
      setShareSelections((current) => ({ ...current, [data.resource.id]: [] }));
      setTitle("");
      setUrl("");
      setStatus("Link added to the lesson.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(event) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose a file to upload.");
      return;
    }
    if (selectedLessonIds.length === 0) {
      setStatus("Choose at least one lesson.");
      return;
    }
    const validation = validateLessonResourceFile(file);
    if (validation.error) {
      setStatus(validation.error);
      return;
    }

    setSaving(true);
    setStatus("Uploading file…");
    const storagePath = `${ownerId}/${crypto.randomUUID()}/${sanitizeLessonResourceFileName(file.name)}`;
    const supabase = createClient();
    try {
      const { error: uploadError } = await supabase.storage
        .from(LESSON_RESOURCE_BUCKET)
        .upload(storagePath, file, { contentType: validation.mimeType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      let data;
      try {
        data = await postLessonResource({
          action: "register-file",
          courseId,
          classDate,
          lessonIds: selectedLessonIds,
          title,
          storagePath,
          fileName: file.name,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
        });
      } catch (error) {
        await supabase.storage.from(LESSON_RESOURCE_BUCKET).remove([storagePath]);
        throw error;
      }

      setOwnResources((current) => [...current, data.resource]);
      setShareSelections((current) => ({ ...current, [data.resource.id]: [] }));
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("File added to the lesson.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeResource(resource) {
    if (!window.confirm(`Remove “${resource.title}” from your resource library?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await postLessonResource({ action: "delete", resourceId: resource.id });
      setOwnResources((current) => current.filter((entry) => entry.id !== resource.id));
      setStatus("Resource removed.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleResourceShare(resourceId, teacherId) {
    setShareSelections((current) => {
      const selected = current[resourceId] || [];
      return {
        ...current,
        [resourceId]: selected.includes(teacherId)
          ? selected.filter((id) => id !== teacherId)
          : [...selected, teacherId],
      };
    });
  }

  async function saveResourceShares(resourceId) {
    setSharingId(resourceId);
    setStatus("");
    try {
      await postLessonResource({
        action: "update-resource-shares",
        resourceId,
        teacherIds: shareSelections[resourceId] || [],
      });
      setStatus("Resource sharing updated.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSharingId("");
    }
  }

  return (
    <section className="classPlanResources">
      <div className="classPlanResourcesHeader">
        <div>
          <strong>Lesson Resources</strong>
          <p>Add links or files once; they follow the lesson whenever it appears on your schedule.</p>
        </div>
        <details className="classPlanAddResource">
          <summary className="btn">＋ Add Resource</summary>
          <div className="classPlanAddResourcePanel">
            <fieldset>
              <legend>Attach to</legend>
              <div className="classPlanLessonChoices">
                {lessonOptions.map((lesson) => (
                  <label key={lesson.id}>
                    <input
                      type="checkbox"
                      checked={selectedLessonIds.includes(lesson.id)}
                      onChange={() => toggleLesson(lesson.id)}
                    />
                    <span>{lesson.label}</span>
                  </label>
                ))}
              </div>
              {lessonOptions.length > 1 ? <small>Select one lesson or leave both selected.</small> : null}
            </fieldset>

            <div className="classPlanResourceTypeTabs" role="group" aria-label="Resource type">
              <button
                className={`btn ${resourceType === "link" ? "primary" : ""}`}
                type="button"
                onClick={() => setResourceType("link")}
              >
                Add Link
              </button>
              <button
                className={`btn ${resourceType === "file" ? "primary" : ""}`}
                type="button"
                onClick={() => setResourceType("file")}
              >
                Upload File
              </button>
            </div>

            <label>
              <span>Title <small>(optional)</small></span>
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder={resourceType === "link" ? "Example: Lesson slides" : "Defaults to the file name"}
              />
            </label>

            {resourceType === "link" ? (
              <form onSubmit={addLink}>
                <label>
                  <span>Link</span>
                  <input
                    className="input"
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://…"
                    required
                  />
                </label>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Adding…" : "Add Link to Lesson"}
                </button>
              </form>
            ) : (
              <form onSubmit={uploadFile}>
                <label>
                  <span>File <small>PDF, Office, text, or image · 25 MB max</small></span>
                  <input className="input" type="file" ref={fileInputRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required />
                </label>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Uploading…" : "Upload File to Lesson"}
                </button>
              </form>
            )}
          </div>
        </details>
      </div>

      {ownResources.length > 0 ? (
        <div className="classPlanResourceList">
          {ownResources.map((resource) => (
            <article className="classPlanResourceCard" key={resource.id}>
              <div>
                <ResourceLink resource={resource} />
                <div className="classPlanResourceLessonChips">{lessonChips(resource)}</div>
              </div>
              <div className="classPlanResourceActions">
                <a className="btn" href={`/api/lesson-resources/${resource.id}/open`} target="_blank" rel="noreferrer">
                  Open
                </a>
                {connectedTeachers.length > 0 ? (
                  <details>
                    <summary className="btn">Share</summary>
                    <div className="classPlanResourceSharePopover">
                      <strong>Share this resource</strong>
                      {connectedTeachers.map((teacher) => (
                        <label key={teacher.id}>
                          <input
                            type="checkbox"
                            checked={(shareSelections[resource.id] || []).includes(teacher.id)}
                            onChange={() => toggleResourceShare(resource.id, teacher.id)}
                          />
                          <span>{teacher.display_name}</span>
                        </label>
                      ))}
                      <button
                        className="btn"
                        type="button"
                        onClick={() => saveResourceShares(resource.id)}
                        disabled={sharingId === resource.id}
                      >
                        {sharingId === resource.id ? "Saving…" : "Save Sharing"}
                      </button>
                    </div>
                  </details>
                ) : null}
                <button className="btn" type="button" onClick={() => removeResource(resource)} disabled={saving}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="classPlanResourcesEmpty">No resources attached to this lesson yet.</p>
      )}

      {sharedResources.length > 0 ? (
        <details className="classPlanSharedResources">
          <summary className="btn">
            Show Connected Teachers&apos; Resources ({sharedResources.length})
          </summary>
          <div className="classPlanResourceList">
            {sharedResources.map((resource) => (
              <article className="classPlanResourceCard" key={resource.id}>
                <div>
                  <ResourceLink resource={resource} ownerName={resource.ownerName} />
                  <div className="classPlanResourceLessonChips">{lessonChips(resource)}</div>
                </div>
                <a className="btn" href={`/api/lesson-resources/${resource.id}/open`} target="_blank" rel="noreferrer">
                  Open
                </a>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <span className="statusNote" aria-live="polite">{status}</span>
    </section>
  );
}
