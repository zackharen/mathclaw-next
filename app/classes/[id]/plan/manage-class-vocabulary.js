"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_VOCABULARY_IMAGE_ACCEPT,
  buildClipboardImageFileName,
  validateLessonVocabularyImage,
} from "@/lib/lesson-resources/constants";
import {
  postLessonResource,
  uploadLessonVocabularyImage,
} from "@/lib/lesson-resources/client";
import { resolveScheduledStartIso } from "@/lib/projector/vocabulary-carousel.mjs";

function VocabularyEditor({ entry, lessons, ownerId, courseId, onChanged }) {
  const fileRef = useRef(null);
  const [word, setWord] = useState(entry.title);
  const [definition, setDefinition] = useState(entry.definition || "");
  const [lessonIds, setLessonIds] = useState(() =>
    entry.lessonIds.filter((lessonId) => lessons.some((lesson) => lesson.id === lessonId))
  );
  const [image, setImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const hasAttachment = entry.resource_type !== "none";
  const hasImage = entry.resource_type === "file" && entry.mime_type?.startsWith("image/");

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function toggleLesson(lessonId) {
    setLessonIds((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId]
    );
  }

  // Shared by the file picker and clipboard paste so both go through
  // identical validation and produce identical Save Changes behavior.
  function applyImageFile(file) {
    const validation = validateLessonVocabularyImage(file);
    if (validation.error) {
      setStatus(validation.error);
      setImage(null);
      return false;
    }
    setRemoveAttachment(false);
    setImage(file);
    setStatus("");
    return true;
  }

  function chooseImage(event) {
    const nextImage = event.target.files?.[0] || null;
    if (!nextImage) {
      setImage(null);
      setStatus("");
      return;
    }
    if (!applyImageFile(nextImage)) {
      event.target.value = "";
    }
  }

  function handlePaste(event) {
    if (saving) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    if (!imageItem) return;
    event.preventDefault();
    const pastedFile = imageItem.getAsFile();
    if (!pastedFile) return;
    const namedFile = pastedFile.name
      ? pastedFile
      : new File([pastedFile], buildClipboardImageFileName(pastedFile.type), { type: pastedFile.type });
    applyImageFile(namedFile);
    if (fileRef.current) fileRef.current.value = "";
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
    <article className="manageVocabularyCard" tabIndex={0} onPaste={handlePaste}>
      <div className="manageVocabularyMedia">
        {imagePreviewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt={`New image for ${entry.title}`} />
            <small>New image selected — Save Changes will upload it.</small>
          </>
        ) : hasImage && !removeAttachment ? (
          // The protected image route needs the browser's auth cookie, so it cannot use the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/lesson-resources/${entry.id}/open?v=${encodeURIComponent(entry.updated_at || entry.created_at || "")}`}
            alt={`Vocabulary illustration for ${entry.title}`}
          />
        ) : (
          <span>{hasAttachment && !removeAttachment ? "Attached item" : "No image"}</span>
        )}
        {hasAttachment && !removeAttachment && !imagePreviewUrl ? (
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
          <span>{hasAttachment ? "Replace attachment with image" : "Add image"} <small>JPG, PNG, WebP, or GIF — or paste an image (Ctrl/Cmd+V)</small></span>
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
  const [projectorOpen, setProjectorOpen] = useState(false);
  const [projectorLoading, setProjectorLoading] = useState(false);
  const [projectorSaving, setProjectorSaving] = useState(false);
  const [projectorSetup, setProjectorSetup] = useState(null);
  const [projectorScreens, setProjectorScreens] = useState([]);
  const [projectorInterval, setProjectorInterval] = useState(30);
  const [completedOnly, setCompletedOnly] = useState(false);
  const [scheduleStart, setScheduleStart] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [projectorMessage, setProjectorMessage] = useState("");
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

  useEffect(() => {
    if (!projectorOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setProjectorOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectorOpen]);

  async function openProjector() {
    setProjectorOpen(true);
    setProjectorLoading(true);
    setProjectorSetup(null);
    setProjectorMessage("");
    try {
      const response = await fetch(`/api/projector/vocabulary-carousel?courseId=${encodeURIComponent(courseId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Projector screens could not be loaded.");
      setProjectorSetup(data);
      const availableIds = data.screens.filter((screen) => screen.enabled).map((screen) => screen.id);
      const runningAvailable = data.runningScreenIds.filter((id) => availableIds.includes(id));
      setProjectorScreens(runningAvailable.length ? runningAvailable : availableIds);
      const scheduledMs = data.runningStartedAt ? Date.parse(data.runningStartedAt) : NaN;
      if (Number.isFinite(scheduledMs) && scheduledMs > Date.now()) {
        const scheduled = new Date(scheduledMs);
        setScheduleStart(true);
        setScheduleTime(`${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`);
      } else {
        setScheduleStart(false);
        setScheduleTime("");
      }
    } catch (error) {
      setProjectorMessage(error.message);
    } finally {
      setProjectorLoading(false);
    }
  }

  async function updateProjector(action) {
    let startAt = null;
    if (action === "start" && scheduleStart) {
      const resolved = resolveScheduledStartIso(scheduleTime);
      if (resolved.error) {
        setProjectorMessage(resolved.error);
        return;
      }
      startAt = resolved.iso;
    }
    setProjectorSaving(true);
    setProjectorMessage(action === "start" ? (startAt ? "Scheduling carousel…" : "Starting carousel…") : "Stopping carousel…");
    try {
      const response = await fetch("/api/projector/vocabulary-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, courseId, screenIds: projectorScreens, intervalSeconds: projectorInterval, completedOnly, startAt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The projector could not be updated.");
      setProjectorSetup((current) => ({ ...current, runningScreenIds: data.runningScreenIds || [], runningStartedAt: data.startedAt || null }));
      const screenCount = data.runningScreenIds.length;
      setProjectorMessage(action === "start"
        ? startAt
          ? `${data.wordCount} word${data.wordCount === 1 ? "" : "s"} scheduled to start at ${new Date(startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} on ${screenCount} screen${screenCount === 1 ? "" : "s"}.`
          : `${data.wordCount} word${data.wordCount === 1 ? "" : "s"} rotating on ${screenCount} screen${screenCount === 1 ? "" : "s"}.`
        : "Vocabulary carousel stopped.");
    } catch (error) {
      setProjectorMessage(error.message);
    } finally {
      setProjectorSaving(false);
    }
  }

  const runningStartedAtMs = projectorSetup?.runningStartedAt ? Date.parse(projectorSetup.runningStartedAt) : NaN;
  const runningIsScheduled = Number.isFinite(runningStartedAtMs) && runningStartedAtMs > Date.now();

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
                setProjectorSetup(null);
                setProjectorOpen(false);
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
          <button className="btn primary" type="button" onClick={openProjector} disabled={!loaded || loading || vocabulary.length === 0}>
            Push Vocabulary to Projector
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
      {projectorOpen ? (
        <div className="manageVocabularyProjectorBackdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setProjectorOpen(false);
        }}>
          <section className="manageVocabularyProjectorDialog" role="dialog" aria-modal="true" aria-labelledby="vocabulary-projector-title">
            <div className="manageVocabularyProjectorHeader">
              <h2 id="vocabulary-projector-title">Vocabulary on Projector</h2>
              <button className="btn" type="button" onClick={() => setProjectorOpen(false)} aria-label="Close projector setup">✕</button>
            </div>
            <p>Random words and definitions rotate independently on each selected screen. You can close this page while they play.</p>
            {projectorLoading ? <p>Loading projector screens…</p> : null}
            {projectorSetup ? (
              <>
                <fieldset className="manageVocabularyProjectorScreens">
                  <legend>Choose displays</legend>
                  {projectorSetup.screens.map((screen) => (
                    <label key={screen.id}>
                      <input type="checkbox" checked={projectorScreens.includes(screen.id)} disabled={!screen.enabled || projectorSaving}
                        onChange={(event) => setProjectorScreens((current) => event.target.checked
                          ? [...current, screen.id]
                          : current.filter((id) => id !== screen.id))} />
                      <span>{screen.name}</span>
                      {screen.reason ? <small>{screen.reason}</small> : null}
                    </label>
                  ))}
                </fieldset>
                <label className="manageVocabularyProjectorInterval">
                  <span>Change words every</span>
                  <select className="input" value={projectorInterval} onChange={(event) => setProjectorInterval(Number(event.target.value))} disabled={projectorSaving}>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </label>
                <label className="manageVocabularyProjectorCompleted">
                  <input type="checkbox" checked={completedOnly} onChange={(event) => setCompletedOnly(event.target.checked)} disabled={projectorSaving} />
                  <span>Only words from completed lessons</span>
                </label>
                <label className="manageVocabularyProjectorCompleted">
                  <input type="checkbox" checked={scheduleStart} onChange={(event) => setScheduleStart(event.target.checked)} disabled={projectorSaving} />
                  <span>Schedule a start time</span>
                </label>
                {scheduleStart ? (
                  <label className="manageVocabularyProjectorInterval">
                    <span>Start at</span>
                    <input
                      className="input"
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                      disabled={projectorSaving}
                    />
                  </label>
                ) : null}
                <p className="manageVocabularyProjectorCount">
                  {completedOnly ? projectorSetup.completedCount : projectorSetup.allCount} eligible word{(completedOnly ? projectorSetup.completedCount : projectorSetup.allCount) === 1 ? "" : "s"}
                  {projectorSetup.runningScreenIds.length
                    ? runningIsScheduled
                      ? ` · Scheduled to start at ${new Date(runningStartedAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} on ${projectorSetup.runningScreenIds.length} screen${projectorSetup.runningScreenIds.length === 1 ? "" : "s"}`
                      : ` · Running on ${projectorSetup.runningScreenIds.length} screen${projectorSetup.runningScreenIds.length === 1 ? "" : "s"}`
                    : ""}
                </p>
                <div className="ctaRow">
                  <button className="btn primary" type="button" onClick={() => updateProjector("start")}
                    disabled={projectorSaving || !projectorScreens.length || !(completedOnly ? projectorSetup.completedCount : projectorSetup.allCount)}>
                    {projectorSaving
                      ? "Updating…"
                      : projectorSetup.runningScreenIds.length
                        ? "Update Carousel"
                        : scheduleStart
                          ? "Schedule Carousel"
                          : "Start Carousel"}
                  </button>
                  {projectorSetup.runningScreenIds.length ? (
                    <button className="btn" type="button" onClick={() => updateProjector("stop")} disabled={projectorSaving}>Stop Carousel</button>
                  ) : null}
                  <a className="btn" href="/projector" target="_blank" rel="noreferrer">Open Projector</a>
                </div>
              </>
            ) : null}
            {projectorMessage ? <p className="statusNote" role="status">{projectorMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </details>
  );
}
