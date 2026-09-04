"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_RESOURCE_BUCKET,
  LESSON_RESOURCE_FILE_ACCEPT,
  formatLessonResourceSize,
  getLessonResourceSiteSuggestion,
  sanitizeLessonResourceFileName,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { createClient } from "@/lib/supabase/client";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";

function occurrenceKey(item) {
  return `${item.rule_id}|${item.original_date}`;
}

function shortDate(iso) {
  const [, month, day] = String(iso || "").split("-");
  return `${Number(month)}/${Number(day)}`;
}

async function postAssessmentResource(body) {
  const response = await fetch("/api/assessment-resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Assessment resources could not be updated.");
  return data;
}

export function AssessmentResourceList({ resources, lessonLabelById, compact = false, onRemove, disabled = false }) {
  if (!resources?.length) return compact ? null : <p className="classPlanResourcesEmpty">No assessment links or files yet.</p>;
  return (
    <div className="classPlanResourceList">
      {resources.map((resource) => (
        <article className="classPlanResourceCard" key={resource.id}>
          <div>
            <div className="classPlanResourceIdentity">
              <span aria-hidden="true">{resource.resource_type === "file" ? "▧" : "↗"}</span>
              <span>
                <strong>{resource.title}</strong>
                <small>
                  {resource.assignment_label} {resource.assessment_number}
                  {resource.resource_type === "file"
                    ? ` · ${resource.file_name || "File"} · ${formatLessonResourceSize(resource.size_bytes)}`
                    : " · Link"}
                </small>
              </span>
            </div>
            {!compact ? (
              <div className="classPlanResourceLessonChips">
                {(resource.lessonIds || []).map((id) => lessonLabelById?.get(id)).filter(Boolean).map((label) => (
                  <span className="classPlanResourceLessonChip" key={label}>{label}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="classPlanResourceActions">
            <a className="btn" href={`/api/assessment-resources/${resource.id}/open`} target="_blank" rel="noreferrer">Open</a>
            {onRemove && resource.canDelete ? (
              <button className="btn" type="button" onClick={() => onRemove(resource)} disabled={disabled}>Remove</button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AssessmentFolder({
  courseId,
  ownerId,
  occurrences,
  lessons,
  initialResources,
  initialDefaultLessonIds,
  defaultLessonCount,
  initialSiteNames,
}) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const activeOccurrences = (occurrences || []).filter((item) => !item.is_skipped);
  const [resources, setResources] = useState(initialResources || []);
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState(
    activeOccurrences.find((item) => item.assignment_date >= new Date().toISOString().slice(0, 10))
      ? occurrenceKey(activeOccurrences.find((item) => item.assignment_date >= new Date().toISOString().slice(0, 10)))
      : occurrenceKey(activeOccurrences[0] || {})
  );
  const [selectedLessonIds, setSelectedLessonIds] = useState(initialDefaultLessonIds || []);
  const [resourceType, setResourceType] = useState("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteNames, setSiteNames] = useState(initialSiteNames || {});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const lessonLabelById = useMemo(
    () => new Map((lessons || []).map((lesson) => [
      lesson.id,
      formatLessonLabel(lesson.source_lesson_code, lesson.title),
    ])),
    [lessons]
  );
  const selectedOccurrence = activeOccurrences.find((item) => occurrenceKey(item) === selectedOccurrenceKey);
  const siteSuggestion = useMemo(() => getLessonResourceSiteSuggestion(url, siteNames), [url, siteNames]);

  function chooseNextLessons(resource) {
    const selected = new Set(resource.lessonIds || []);
    let start = 0;
    lessons.forEach((lesson, index) => { if (selected.has(lesson.id)) start = index + 1; });
    setSelectedLessonIds(lessons.slice(start, start + defaultLessonCount).map((lesson) => lesson.id));
  }

  function toggleLesson(id) {
    setSelectedLessonIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function changeUrl(value) {
    const before = getLessonResourceSiteSuggestion(url, siteNames);
    const after = getLessonResourceSiteSuggestion(value, siteNames);
    setUrl(value);
    if (before.hostname !== after.hostname) setSiteName("");
    setTitle((current) => !current || current === before.name ? after.name : current);
  }

  async function createLink(event) {
    event.preventDefault();
    await save({ action: "create-link", url, siteName });
  }

  async function uploadFile(event) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return setStatus("Choose a file to upload.");
    const validation = validateLessonResourceFile(file);
    if (validation.error) return setStatus(validation.error);
    setSaving(true);
    setStatus("Uploading file…");
    const storagePath = `${ownerId}/assessments/${crypto.randomUUID()}/${sanitizeLessonResourceFileName(file.name)}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from(LESSON_RESOURCE_BUCKET).upload(storagePath, file, { contentType: validation.mimeType, upsert: false });
    if (error) {
      setSaving(false);
      return setStatus(error.message);
    }
    try {
      const saved = await save({ action: "register-file", storagePath, fileName: file.name, mimeType: validation.mimeType, sizeBytes: file.size }, true);
      if (!saved) await supabase.storage.from(LESSON_RESOURCE_BUCKET).remove([storagePath]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      await supabase.storage.from(LESSON_RESOURCE_BUCKET).remove([storagePath]);
    }
  }

  async function save(extra, alreadySaving = false) {
    if (!selectedOccurrence) { setStatus("Choose a numbered assessment."); return false; }
    if (!selectedLessonIds.length) { setStatus("Choose at least one curriculum lesson."); return false; }
    if (!alreadySaving) setSaving(true);
    setStatus("");
    try {
      const data = await postAssessmentResource({
        ...extra,
        courseId,
        ruleId: selectedOccurrence.rule_id,
        originalDate: selectedOccurrence.original_date,
        lessonIds: selectedLessonIds,
        title,
      });
      setResources((current) => [data.resource, ...current]);
      chooseNextLessons(data.resource);
      setTitle("");
      setUrl("");
      setSiteName("");
      if (data.resource.siteNamePreference?.hostname) {
        setSiteNames((current) => ({ ...current, [data.resource.siteNamePreference.hostname]: data.resource.siteNamePreference.displayName }));
      }
      setStatus(`Added to ${data.resource.assignment_label} ${data.resource.assessment_number}.`);
      router.refresh();
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(resource) {
    if (!window.confirm(`Remove “${resource.title}” from this assessment folder?`)) return;
    setSaving(true);
    try {
      await postAssessmentResource({ action: "delete", courseId, resourceId: resource.id });
      setResources((current) => current.filter((item) => item.id !== resource.id));
      setStatus("Assessment resource removed.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card assessmentFolder" id="assessment-folder">
      <div className="classPlanWorkspaceHeader">
        <div>
          <h2>Assessment Folder</h2>
          <p>Keep each assessment link or file with its numbered assignment and curriculum lessons.</p>
        </div>
        {activeOccurrences.length ? (
          <details className="classPlanAddResource">
            <summary className="btn">＋ Add Assessment</summary>
            <div className="classPlanAddResourcePanel assessmentFolderForm">
              <label>
                <span>Numbered assignment</span>
                <select className="input" value={selectedOccurrenceKey} onChange={(event) => setSelectedOccurrenceKey(event.target.value)}>
                  {activeOccurrences.map((item) => (
                    <option key={occurrenceKey(item)} value={occurrenceKey(item)}>
                      {item.label} {item.assessment_number} · {shortDate(item.assignment_date)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Curriculum lessons</legend>
                <div className="assessmentLessonChoices">
                  {lessons.map((lesson) => (
                    <label key={lesson.id}>
                      <input type="checkbox" checked={selectedLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} />
                      <span>{lessonLabelById.get(lesson.id)}</span>
                    </label>
                  ))}
                </div>
                <small>Suggested from the most recently added assessment: the next {defaultLessonCount} lessons.</small>
              </fieldset>
              <div className="classPlanResourceTypeTabs">
                <button className={`btn ${resourceType === "link" ? "primary" : ""}`} type="button" onClick={() => setResourceType("link")}>Add Link</button>
                <button className={`btn ${resourceType === "file" ? "primary" : ""}`} type="button" onClick={() => setResourceType("file")}>Upload File</button>
              </div>
              <label><span>Title <small>(optional)</small></span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
              {resourceType === "link" ? (
                <form onSubmit={createLink}>
                  <label><span>Link</span><input className="input" type="url" value={url} onChange={(event) => changeUrl(event.target.value)} placeholder="https://…" required /></label>
                  {siteSuggestion.source === "unknown" ? (
                    <label><span>What should MathClaw call {siteSuggestion.hostname} going forward?</span><input className="input" value={siteName} onChange={(event) => setSiteName(event.target.value)} required /></label>
                  ) : null}
                  <button className="btn" type="submit" disabled={saving}>{saving ? "Adding…" : "Add Assessment Link"}</button>
                </form>
              ) : (
                <form onSubmit={uploadFile}>
                  <label><span>File <small>25 MB max</small></span><input className="input" type="file" ref={fileInputRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required /></label>
                  <button className="btn" type="submit" disabled={saving}>{saving ? "Uploading…" : "Upload Assessment File"}</button>
                </form>
              )}
            </div>
          </details>
        ) : null}
      </div>
      {!activeOccurrences.length ? <p>Create an announcement assignment rule first so MathClaw has assessment dates to number.</p> : null}
      <AssessmentResourceList resources={resources} lessonLabelById={lessonLabelById} onRemove={remove} disabled={saving} />
      {status ? <p className="formStatus" aria-live="polite">{status}</p> : null}
    </section>
  );
}
