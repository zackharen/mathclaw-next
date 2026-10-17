"use client";

import { useRef, useState } from "react";
import { GridSaveStatus, useGridSaveFeedback, useGridLessonSelection } from "./grid-save-feedback";
import { useGridCellToggle } from "./grid-cell-toggle";
import {
  LESSON_RESOURCE_FILE_ACCEPT,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import {
  postLessonResource,
  uploadLessonVocabularyFile,
} from "@/lib/lesson-resources/client";

export default function GridCellVocabulary({
  ownerId,
  courseId,
  classDate,
  lessons,
  vocabulary,
}) {
  const feedback = useGridSaveFeedback();
  const { saving, locked, beginSave, setSaving, setStatus, reportError, refresh } = feedback;
  const fileRef = useRef(null);
  const { buttonProps, panelProps } = useGridCellToggle();
  const { lessonIds, toggleLesson } = useGridLessonSelection(lessons);
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [attachmentType, setAttachmentType] = useState("none");
  const [url, setUrl] = useState("");


  async function saveVocabulary(event) {
    event.preventDefault();
    if (locked.current) return;
    if (!word.trim()) {
      reportError("Enter a vocabulary word.");
      return;
    }
    if (lessonIds.length === 0) {
      reportError("Choose a lesson.");
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (attachmentType === "file") {
      if (!file) {
        reportError("Choose a file.");
        return;
      }
      const validation = validateLessonResourceFile(file);
      if (validation.error) {
        reportError(validation.error);
        return;
      }
    }

    if (!beginSave()) return;
    setStatus(attachmentType === "file" ? "Uploading…" : "Adding…");
    try {
      if (attachmentType === "file") {
        await uploadLessonVocabularyFile({
          ownerId,
          courseId,
          classDate,
          lessonIds,
          word,
          definition,
          file,
        });
      } else {
        await postLessonResource({
          action: "create-vocabulary",
          courseId,
          classDate,
          lessonIds,
          word,
          definition,
          attachmentType,
          url,
        });
      }
      setWord("");
      setDefinition("");
      setUrl("");
      if (fileRef.current) fileRef.current.value = "";
      setStatus("Vocabulary added.");
      refresh();
    } catch (error) {
      reportError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn allClassesGridToggle allClassesGridSlotVocabulary" {...buttonProps}>
        {vocabulary.length > 0 ? `Vocabulary (${vocabulary.length})` : "＋ Vocabulary"}
      </button>
      <div className="allClassesGridFilesPanel allClassesGridVocabulary allClassesGridPanel" {...panelProps}>
        <strong className="allClassesGridPanelTitle">Vocabulary</strong>
        {vocabulary.length > 0 ? (
          <ul>
            {vocabulary.map((entry) => (
              <li key={entry.id}>
                {entry.resource_type === "none" ? (
                  <span>{entry.title}</span>
                ) : (
                  <a href={`/api/lesson-resources/${entry.id}/open`} target="_blank" rel="noreferrer">
                    {entry.title}
                  </a>
                )}
                {entry.definition ? <small>{entry.definition}</small> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={saveVocabulary}>
          {lessons.length > 1 ? (
            <fieldset className="allClassesGridFilesLessons">
              <legend>Associate with</legend>
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
          <input
            disabled={saving}
            className="input"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            maxLength={160}
            placeholder="Vocabulary word"
            required
          />
          <textarea
            disabled={saving}
            className="input"
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Definition (optional)"
          />
          <select
            disabled={saving}
            className="input"
            value={attachmentType}
            onChange={(event) => setAttachmentType(event.target.value)}
            aria-label="Vocabulary attachment type"
          >
            <option value="none">No attachment</option>
            <option value="link">Link</option>
            <option value="file">File</option>
          </select>
          {attachmentType === "link" ? (
            <input
              disabled={saving}
              className="input"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
            />
          ) : null}
          {attachmentType === "file" ? (
            <input disabled={saving} className="input" type="file" ref={fileRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required />
          ) : null}
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add Vocabulary"}
          </button>
        </form>
        <GridSaveStatus {...feedback} />
      </div>
    </>
  );
}
