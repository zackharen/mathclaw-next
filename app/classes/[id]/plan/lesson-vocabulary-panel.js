"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_RESOURCE_FILE_ACCEPT,
  formatLessonResourceSize,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import {
  postLessonResource,
  uploadLessonVocabularyFile,
} from "@/lib/lesson-resources/client";

function attachmentLabel(entry) {
  if (entry.resource_type === "file") {
    return `${entry.file_name || "File"} · ${formatLessonResourceSize(entry.size_bytes)}`;
  }
  if (entry.resource_type === "link") return "Supporting link";
  return "No attachment";
}

export default function LessonVocabularyPanel({
  courseId,
  classDate,
  ownerId,
  lessonOptions,
  initialVocabulary,
}) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const addDetailsRef = useRef(null);
  const [entries, setEntries] = useState(initialVocabulary || []);
  const [selectedLessonIds, setSelectedLessonIds] = useState(
    lessonOptions.map((lesson) => lesson.id)
  );
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [attachmentType, setAttachmentType] = useState("none");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
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

  function resetDraft() {
    setWord("");
    setDefinition("");
    setUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function addVocabulary(event) {
    event.preventDefault();
    if (!word.trim()) {
      setStatus("Enter a vocabulary word.");
      return;
    }
    if (selectedLessonIds.length === 0) {
      setStatus("Choose at least one lesson.");
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (attachmentType === "file") {
      if (!file) {
        setStatus("Choose a file to upload.");
        return;
      }
      const validation = validateLessonResourceFile(file);
      if (validation.error) {
        setStatus(validation.error);
        return;
      }
    }

    setSaving(true);
    setStatus(attachmentType === "file" ? "Uploading vocabulary file…" : "Adding vocabulary…");
    try {
      const data = attachmentType === "file"
        ? await uploadLessonVocabularyFile({
            ownerId,
            courseId,
            classDate,
            lessonIds: selectedLessonIds,
            word,
            definition,
            file,
          })
        : await postLessonResource({
            action: "create-vocabulary",
            courseId,
            classDate,
            lessonIds: selectedLessonIds,
            word,
            definition,
            attachmentType,
            url,
          });
      setEntries((current) => [...current, data.vocabulary]);
      resetDraft();
      setStatus("Vocabulary added to the lesson.");
      if (addDetailsRef.current) addDetailsRef.current.open = false;
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeVocabulary(entry) {
    if (!window.confirm(`Remove “${entry.title}” from this vocabulary list?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await postLessonResource({ action: "delete", resourceId: entry.id });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setStatus("Vocabulary removed.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="classPlanResources classPlanVocabulary">
      <div className="classPlanResourcesHeader">
        <div>
          <strong>Lesson Vocabulary</strong>
          <p>Associate words with lessons now so completed-class vocabulary can feed Projector later.</p>
        </div>
      </div>

      <details ref={addDetailsRef} className="classPlanAddResource classPlanAddResourceBottom">
        <summary className="btn">＋ Add Vocabulary</summary>
        <form className="classPlanAddResourcePanel" onSubmit={addVocabulary}>
          <fieldset>
            <legend>Associate with</legend>
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
          </fieldset>

          <label>
            <span>Vocabulary word</span>
            <input
              className="input"
              value={word}
              onChange={(event) => setWord(event.target.value)}
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>Definition <small>(optional)</small></span>
            <textarea
              className="input"
              value={definition}
              onChange={(event) => setDefinition(event.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>

          <div className="classPlanResourceTypeTabs" role="group" aria-label="Vocabulary attachment type">
            {[
              ["none", "No Attachment"],
              ["link", "Add Link"],
              ["file", "Upload File"],
            ].map(([value, label]) => (
              <button
                className={`btn ${attachmentType === value ? "primary" : ""}`}
                type="button"
                onClick={() => setAttachmentType(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>

          {attachmentType === "link" ? (
            <label>
              <span>Supporting link</span>
              <input
                className="input"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                required
              />
            </label>
          ) : null}
          {attachmentType === "file" ? (
            <label>
              <span>Supporting file <small>PDF, Office, text, or image · 25 MB max</small></span>
              <input
                className="input"
                type="file"
                ref={fileInputRef}
                accept={LESSON_RESOURCE_FILE_ACCEPT}
                required
              />
            </label>
          ) : null}

          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add Vocabulary to Lesson"}
          </button>
        </form>
      </details>

      {entries.length > 0 ? (
        <div className="classPlanResourceList">
          {entries.map((entry) => (
            <article className="classPlanResourceCard" key={entry.id}>
              <div className="classPlanVocabularyIdentity">
                <strong>{entry.title}</strong>
                {entry.definition ? <p>{entry.definition}</p> : null}
                <small>{attachmentLabel(entry)}</small>
                <div className="classPlanResourceLessonChips">
                  {(entry.lessonIds || [])
                    .filter((lessonId) => lessonLabelById.has(lessonId))
                    .map((lessonId) => (
                      <span className="classPlanResourceLessonChip" key={lessonId}>
                        {lessonLabelById.get(lessonId)}
                      </span>
                    ))}
                </div>
              </div>
              <div className="classPlanResourceActions">
                {entry.resource_type !== "none" ? (
                  <a className="btn" href={`/api/lesson-resources/${entry.id}/open`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
                <button className="btn" type="button" onClick={() => removeVocabulary(entry)} disabled={saving}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="classPlanResourcesEmpty">No vocabulary associated with this lesson yet.</p>
      )}

      {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
    </section>
  );
}
