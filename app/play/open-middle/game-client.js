"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildDefaultOpenMiddleRules,
  generateOpenMiddleVersions,
  getOpenMiddleVisibilityLabel,
  normalizeDigitPool,
  OPEN_MIDDLE_OPERATORS,
  parseOpenMiddleTemplate,
} from "@/lib/open-middle/core";

function courseTitle(courses, courseId) {
  return courses.find((course) => course.id === courseId)?.title || "Selected class";
}

function emptyTemplateForm(courseId = "") {
  return {
    title: "",
    rawInput: "_ + _ = _\n_ - _ = _",
    standardCode: "",
    visibility: "private",
    digitPool: "0,1,2,3,4,5,6,7,8,9",
    courseId: courseId || "",
    schoolName: "",
    versionOperators: OPEN_MIDDLE_OPERATORS.map((item) => item.value),
  };
}

function PreviewLine({ line }) {
  return (
    <div className="openMiddleEquationLine">
      {(line.tokens || []).map((token, index) =>
        token.type === "blank" ? (
          <span key={`${line.lineIndex}-${index}`} className="openMiddlePreviewBlank">
            _
          </span>
        ) : (
          <span key={`${line.lineIndex}-${index}`} className="openMiddlePreviewText">
            {token.value}
          </span>
        )
      )}
    </div>
  );
}

export default function OpenMiddleHubClient({
  courses,
  initialCourseId,
  userId,
  viewerAccountType,
}) {
  const isTeacher = viewerAccountType === "teacher";
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [dashboard, setDashboard] = useState({
    templates: [],
    sessions: [],
    schools: [],
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(120);
  const [form, setForm] = useState(() => emptyTemplateForm(initialCourseId));

  const loadDashboard = useCallback(async (nextCourseId = courseId) => {
    const query = nextCourseId ? `?courseId=${encodeURIComponent(nextCourseId)}` : "";
    const response = await fetch(`/api/play/open-middle${query}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Open Middle failed to load.");
    setDashboard(payload.dashboard || { templates: [], sessions: [], schools: [] });
    return payload.dashboard;
  }, [courseId]);

  useEffect(() => {
    loadDashboard(courseId).catch((loadError) => setError(loadError.message));
  }, [courseId, loadDashboard]);

  useEffect(() => {
    if (isTeacher) return;
    const liveSession = (dashboard.sessions || []).find(
      (session) =>
        session.courseId === courseId &&
        (session.status === "waiting" || session.status === "live" || session.status === "reveal")
    );
    if (liveSession) {
      window.location.href = `/play/open-middle/${liveSession.id}`;
    }
  }, [dashboard.sessions, courseId, isTeacher]);

  const preview = useMemo(() => parseOpenMiddleTemplate(form.rawInput), [form.rawInput]);
  const versionPreview = useMemo(() => {
    if (!preview.ok) return [];
    return generateOpenMiddleVersions({
      title: form.title || "Open Middle",
      rawInput: preview.normalizedRawInput,
      parsedStructure: preview.structure,
      rules: {
        ...buildDefaultOpenMiddleRules({ courseId: form.courseId }),
        versionOperators: form.versionOperators,
      },
    });
  }, [
    form.courseId,
    form.title,
    form.versionOperators,
    preview.normalizedRawInput,
    preview.ok,
    preview.structure,
  ]);

  const selectedTemplate = (dashboard.templates || []).find((template) => template.id === selectedTemplateId) || null;
  const selectedVersion =
    selectedTemplate?.versions?.find((version) => version.id === selectedVersionId) ||
    selectedTemplate?.versions?.[0] ||
    null;

  useEffect(() => {
    const firstTemplate = dashboard.templates?.[0] || null;
    if (!selectedTemplateId && firstTemplate) {
      setSelectedTemplateId(firstTemplate.id);
      setSelectedVersionId(firstTemplate.versions?.[0]?.id || "");
    }
  }, [dashboard.templates, selectedTemplateId]);

  async function postAction(body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/open-middle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      if (payload.dashboard) setDashboard(payload.dashboard);
      if (payload.session?.id) {
        window.location.href = `/play/open-middle/${payload.session.id}`;
        return;
      }
      setMessage(payload.result?.message || "Saved.");
    } catch (postError) {
      setError(postError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTemplateSave(event) {
    event.preventDefault();
    await postAction({
      action: "save_template",
      ...form,
      digitPool: normalizeDigitPool(form.digitPool),
    });
    setForm(emptyTemplateForm(courseId));
  }

  return (
    <div className="openMiddleHub">
      <section className="card openMiddleHubCard">
        <div className="openMiddleHubHeader">
          <div>
            <h2>{isTeacher ? "Teacher Dashboard" : "Live Puzzle Hub"}</h2>
            <p>
              {isTeacher
                ? "Author a reusable prompt, pick a version, set a timer, and push it live."
                : "If your teacher launches a puzzle in one of your classes, it will open here automatically."}
            </p>
          </div>
          <label className="openMiddleSelectField">
            <span>Class</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">Choose a class</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {message ? <p className="openMiddleSuccessNote">{message}</p> : null}
        {error ? <p className="openMiddleErrorNote">{error}</p> : null}
        {(dashboard.sessions || []).length ? (
          <div className="openMiddleSessionList">
            {dashboard.sessions.map((session) => (
              <Link key={session.id} href={`/play/open-middle/${session.id}`} className="openMiddleSessionCard">
                <strong>{session.templateTitle}</strong>
                <span>{session.versionTitle}</span>
                <small>
                  {session.status === "live"
                    ? `${session.secondsRemaining}s left`
                    : session.status === "waiting"
                      ? "Waiting to start"
                      : "Reveal is open"}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="openMiddleMutedNote">
            {isTeacher
              ? "No live Open Middle session is running for this class yet."
              : "No teacher has pushed an Open Middle puzzle to this class yet."}
          </p>
        )}
      </section>

      <div className="openMiddleHubGrid">
        <section className="card openMiddleHubCard">
          <h2>{isTeacher ? "Template Authoring" : "Create A Puzzle Draft"}</h2>
          <p>
            Type equations with underscores for blanks. Students and teachers can both draft
            templates, but non-private student drafts stay hidden until a teacher approves them.
          </p>
          <form className="openMiddleAuthorForm" onSubmit={handleTemplateSave}>
            <label>
              <span>Title</span>
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Example: Make both equations true"
              />
            </label>
            <label>
              <span>Puzzle</span>
              <textarea
                className="input"
                rows={6}
                value={form.rawInput}
                onChange={(event) => setForm((current) => ({ ...current, rawInput: event.target.value }))}
              />
            </label>
            <div className="openMiddleAuthorGrid">
              <label>
                <span>Digit pool</span>
                <input
                  className="input"
                  value={form.digitPool}
                  onChange={(event) => setForm((current) => ({ ...current, digitPool: event.target.value }))}
                />
              </label>
              <label>
                <span>Standard code</span>
                <input
                  className="input"
                  value={form.standardCode}
                  onChange={(event) => setForm((current) => ({ ...current, standardCode: event.target.value }))}
                  placeholder="NJ CCSS"
                />
              </label>
              <label>
                <span>Visibility</span>
                <select
                  value={form.visibility}
                  onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
                >
                  <option value="private">Private</option>
                  <option value="class">Class</option>
                  <option value="school">School</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                <span>School name</span>
                <input
                  className="input"
                  value={form.schoolName}
                  onChange={(event) => setForm((current) => ({ ...current, schoolName: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>
            <label>
              <span>Operator versions</span>
              <div className="openMiddleOperatorRow">
                {OPEN_MIDDLE_OPERATORS.map((operator) => {
                  const checked = form.versionOperators.includes(operator.value);
                  return (
                    <label key={operator.value} className="openMiddleOperatorChip">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            versionOperators: event.target.checked
                              ? [...current.versionOperators, operator.value]
                              : current.versionOperators.filter((value) => value !== operator.value),
                          }))
                        }
                      />
                      <span>{operator.label}</span>
                    </label>
                  );
                })}
              </div>
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Saving..." : isTeacher ? "Save Template" : "Save Draft"}
            </button>
          </form>
        </section>

        <section className="card openMiddleHubCard">
          <h2>Live Preview</h2>
          {preview.errors?.length ? (
            <div className="openMiddleErrorList">
              {preview.errors.map((item, index) => (
                <p key={`${item.code}-${index}`}>{item.message}</p>
              ))}
            </div>
          ) : null}
          <div className="openMiddlePreviewCard">
            {(preview.structure?.lines || []).map((line) => (
              <PreviewLine key={line.lineIndex} line={line} />
            ))}
          </div>
          <p className="openMiddleMutedNote">
            {preview.structure?.blankCount || 0} blank{preview.structure?.blankCount === 1 ? "" : "s"}.
            {" "}
            {versionPreview.length} version{versionPreview.length === 1 ? "" : "s"} ready from the selected operators.
          </p>
          {versionPreview.length ? (
            <div className="openMiddleVersionList">
              {versionPreview.slice(0, 8).map((version) => (
                <div key={version.operator_signature} className="openMiddleVersionCard">
                  <strong>{version.title}</strong>
                  <span>{version.operator_signature}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="openMiddleHubGrid">
        <section className="card openMiddleHubCard">
          <h2>Question Library</h2>
          <p>
            {dashboard.templates.length
              ? "Choose a reusable prompt below. Teachers can launch any visible version into a live session."
              : "Save a template to start building the library."}
          </p>
          <div className="openMiddleTemplateList">
            {(dashboard.templates || []).map((template) => (
              <button
                key={template.id}
                type="button"
                className={`openMiddleTemplateCard ${selectedTemplateId === template.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setSelectedVersionId(template.versions?.[0]?.id || "");
                }}
              >
                <strong>{template.title}</strong>
                <span>{template.standardCode || "No standard yet"}</span>
                <small>
                  {template.visibilityLabel}
                  {" "}
                  {template.approved ? "approved" : "awaiting approval"}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="card openMiddleHubCard">
          <h2>{isTeacher ? "Launch Live Session" : "Selected Template"}</h2>
          {selectedTemplate ? (
            <>
              <p>
                {selectedTemplate.title}
                {" "}
                <span className="openMiddleMutedInline">
                  {getOpenMiddleVisibilityLabel(selectedTemplate.visibility)}
                </span>
              </p>
              <div className="openMiddleVersionList">
                {selectedTemplate.versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    className={`openMiddleVersionCard ${selectedVersionId === version.id ? "selected" : ""}`}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    <strong>{version.title}</strong>
                    <span>{version.operatorSignature}</span>
                  </button>
                ))}
              </div>
              {selectedVersion?.parsedStructure?.lines?.length ? (
                <div className="openMiddlePreviewCard" style={{ marginTop: "1rem" }}>
                  {selectedVersion.parsedStructure.lines.map((line) => (
                    <PreviewLine key={line.lineIndex} line={line} />
                  ))}
                </div>
              ) : null}
              {isTeacher ? (
                <>
                  <label className="openMiddleSelectField" style={{ marginTop: "1rem" }}>
                    <span>Timer (seconds)</span>
                    <input
                      className="input"
                      type="number"
                      min="15"
                      max="900"
                      value={timerSeconds}
                      onChange={(event) => setTimerSeconds(event.target.value)}
                    />
                  </label>
                  <div className="ctaRow" style={{ marginTop: "1rem" }}>
                    <button
                      className="btn primary"
                      type="button"
                      disabled={busy || !courseId || !selectedVersionId}
                      onClick={() =>
                        postAction({
                          action: "create_session",
                          courseId,
                          templateId: selectedTemplate.id,
                          versionId: selectedVersionId,
                          timerSeconds,
                        })
                      }
                    >
                      Launch To {courseTitle(courses, courseId)}
                    </button>
                    {!selectedTemplate.approved ? (
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          postAction({
                            action: "approve_template",
                            templateId: selectedTemplate.id,
                            courseId,
                          })
                        }
                      >
                        Approve Template
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="openMiddleMutedNote">
                  Your teacher launches the live classroom session from this template screen.
                </p>
              )}
            </>
          ) : (
            <p className="openMiddleMutedNote">Choose a template from the library first.</p>
          )}
        </section>
      </div>
    </div>
  );
}
