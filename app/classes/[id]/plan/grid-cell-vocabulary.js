"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const fileRef = useRef(null);
  const [lessonIds, setLessonIds] = useState(() => lessons.map((lesson) => lesson.id));
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [attachmentType, setAttachmentType] = useState("none");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  function toggleLesson(lessonId) {
    setLessonIds((current) =>
      current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId]
    );
  }

  async function saveVocabulary(event) {
    event.preventDefault();
    if (!word.trim()) {
      setStatus("Enter a vocabulary word.");
      return;
    }
    if (lessonIds.length === 0) {
      setStatus("Choose a lesson.");
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (attachmentType === "file") {
      if (!file) {
        setStatus("Choose a file.");
        return;
      }
      const validation = validateLessonResourceFile(file);
      if (validation.error) {
        setStatus(validation.error);
        return;
      }
    }

    setSaving(true);
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
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="allClassesGridFiles allClassesGridVocabulary">
      <summary className="btn">
        {vocabulary.length > 0 ? `Vocabulary (${vocabulary.length})` : "＋ Vocabulary"}
      </summary>
      <div className="allClassesGridFilesPanel">
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
            className="input"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            maxLength={160}
            placeholder="Vocabulary word"
            required
          />
          <textarea
            className="input"
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Definition (optional)"
          />
          <select
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
              className="input"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
            />
          ) : null}
          {attachmentType === "file" ? (
            <input className="input" type="file" ref={fileRef} accept={LESSON_RESOURCE_FILE_ACCEPT} required />
          ) : null}
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add Vocabulary"}
          </button>
        </form>
        {status ? <small aria-live="polite">{status}</small> : null}
      </div>
    </details>
  );
}
