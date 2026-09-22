"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_VOCABULARY_IMAGE_ACCEPT,
  validateLessonVocabularyImage,
} from "@/lib/lesson-resources/constants";
import {
  postLessonResource,
  uploadLessonVocabularyImage,
} from "@/lib/lesson-resources/client";

function VocabularyEditor({ entry, lessons, ownerId, courseId, onChanged }) {
  const fileRef = useRef(null);
  const [word, setWord] = useState(entry.title);
  const [definition, setDefinition] = useState(entry.definition || "");
  const [lessonIds, setLessonIds] = useState(() =>
    entry.lessonIds.filter((lessonId) => lessons.some((lesson) => lesson.id === lessonId))
  );
  const [image, setImage] = useState(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const hasAttachment = entry.resource_type !== "none";
  const hasImage = entry.resource_type === "file" && entry.mime_type?.startsWith("image/");

  function toggleLesson(lessonId) {
    setLessonIds((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId]
    );
  }

  function chooseImage(event) {
    const nextImage = event.target.files?.[0] || null;
    if (nextImage) {
      const validation = validateLessonVocabularyImage(nextImage);
      if (validation.error) {
        setStatus(validation.error);
        event.target.value = "";
        setImage(null);
        return;
      }
      setRemoveAttachment(false);
    }
    setImage(nextImage);
    setStatus("");
  }

  async function save(event) {
    event.preventDefault();
    if (!word.trim()) {
      setStatus("Enter a vocabulary word.");
      return;
    }
    if (lessonIds.length === 0) {
      setStatus("Choose at least one lesson.");
      return;
    }
    setSaving(true);
    setStatus(image ? "Uploading image…" : "Saving changes…");
    try {
      if (image) {
        await uploadLessonVocabularyImage({
          ownerId,
          courseId,
          resourceId: entry.id,
          lessonIds,
          word,
          definition,
          file: image,
        });
      } else {
        await postLessonResource({
          action: "update-vocabulary",
          courseId,
          resourceId: entry.id,
          lessonIds,
          word,
          definition,
          removeAttachment,
        });
      }
      setStatus("Vocabulary updated.");
      await onChanged("Vocabulary updated.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove “${entry.title}” from your vocabulary library?`)) return;
    setSaving(true);
    setStatus("Removing…");
    try {
      await postLessonResource({ action: "delete", resourceId: entry.id });
      await onChanged("Vocabulary removed.");
    } catch (error) {
      setStatus(error.message);
      setSaving(false);
    }
  }

  return (
    <article className="manageVocabularyCard">
      <div className="manageVocabularyMedia">
        {hasImage && !removeAttachment ? (
          // The protected image route needs the browser's auth cookie, so it cannot use the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/lesson-resources/${entry.id}/open?v=${encodeURIComponent(entry.updated_at || entry.created_at || "")}`}
            alt={`Vocabulary illustration for ${entry.title}`}
          />
        ) : (
          <span>{image ? image.name : hasAttachment && !removeAttachment ? "Attached item" : "No image"}</span>
        )}
        {hasAttachment && !removeAttachment ? (
          <a href={`/api/lesson-resources/${entry.id}/open`} target="_blank" rel="noreferrer">
            Open current attachment
          </a>
        ) : null}
      </div>

      <form onSubmit={save}>
        <label>
          <span>Word</span>
          <input className="input" value={word} onChange={(event) => setWord(event.target.value)} maxLength={160} required />
        </label>
        <label>
          <span>Definition</span>
          <textarea className="input" value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={1000} rows={3} />
        </label>

        <details className="manageVocabularyLessons">
          <summary>Lessons ({lessonIds.length})</summary>
          <div>
            {lessons.map((lesson) => (
              <label key={lesson.id}>
                <input type="checkbox" checked={lessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} />
                <span>{lesson.label}</span>
              </label>
            ))}
          </div>
        </details>

        <label>
          <span>{hasAttachment ? "Replace attachment with image" : "Add image"} <small>JPG, PNG, WebP, or GIF</small></span>
          <input
            className="input"
            type="file"
            accept={LESSON_VOCABULARY_IMAGE_ACCEPT}
            ref={fileRef}
            onChange={chooseImage}
            disabled={saving || removeAttachment}
          />
          {image ? <small>Selected: {image.name}</small> : null}
        </label>
        {hasAttachment ? (
          <label className="manageVocabularyRemoveAttachment">
            <input
              type="checkbox"
              checked={removeAttachment}
              onChange={(event) => {
                setRemoveAttachment(event.target.checked);
                if (event.target.checked) {
                  setImage(null);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            <span>Remove current attachment</span>
          </label>
        ) : null}

        <div className="ctaRow">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
          <button className="btn" type="button" onClick={remove} disabled={saving}>Remove Word</button>
          {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
        </div>
      </form>
    </article>
  );
}

export default function ManageClassVocabulary({ ownerId, courses }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [vocabulary, setVocabulary] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const visibleVocabulary = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return vocabulary.filter((entry) =>
      `${entry.title} ${entry.definition || ""}`.toLowerCase().includes(query)
    );
  }, [vocabulary, filter]);

  async function load(nextCourseId = courseId, successMessage = "") {
    if (!nextCourseId) return;
    setLoading(true);
    setStatus(successMessage);
    try {
      const response = await fetch(
        `/api/lesson-resources?kind=vocabulary&courseId=${encodeURIComponent(nextCourseId)}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Vocabulary could not be loaded.");
      setVocabulary(data.vocabulary || []);
      setLessons(data.lessons || []);
      setLoaded(true);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function changed(message) {
    await load(courseId, message);
    router.refresh();
  }

  if (!courses.length) return null;

  return (
    <details
      className="allClassesBulkResources manageVocabulary"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) load();
      }}
    >
      <summary>Manage Class Vocabulary</summary>
      <div className="manageVocabularyBody">
        <p>View and edit every vocabulary word associated with this class. Changes follow the lesson anywhere it is taught.</p>
        <div className="manageVocabularyToolbar">
          {courses.length > 1 ? (
            <select
              className="input"
              value={courseId}
              onChange={(event) => {
                const nextCourseId = event.target.value;
                setCourseId(nextCourseId);
                setFilter("");
                setLoaded(false);
                load(nextCourseId);
              }}
              aria-label="Class vocabulary to manage"
              disabled={loading}
            >
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          ) : null}
          <input
            className="input"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search vocabulary"
            aria-label="Search class vocabulary"
          />
          <button className="btn" type="button" onClick={() => load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh List"}
          </button>
          {loaded ? <small>{vocabulary.length} word{vocabulary.length === 1 ? "" : "s"}</small> : null}
        </div>

        {loaded && vocabulary.length === 0 ? <p>No vocabulary is associated with this class yet.</p> : null}
        {loaded && vocabulary.length > 0 ? (
          <div className="manageVocabularyList">
            {visibleVocabulary.map((entry) => (
              <VocabularyEditor
                key={`${entry.id}-${entry.updated_at || entry.created_at}`}
                entry={entry}
                lessons={lessons}
                ownerId={ownerId}
                courseId={courseId}
                onChanged={changed}
              />
            ))}
            {visibleVocabulary.length === 0 ? <p>No matching vocabulary words.</p> : null}
          </div>
        ) : null}
        {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
      </div>
    </details>
  );
}
