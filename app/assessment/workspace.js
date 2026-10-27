"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClassPicker, Question } from "./shared";
import { adaptiveNext, adaptiveGrade } from "@/lib/assessments/core";
import MathPrint from "./math-print";
import { spiralLast, safeQuestion } from "@/lib/assessments/core";

export default function AssessmentWorkspace({ courseId }) {
  const [data, setData] = useState(null),
    [status, setStatus] = useState("Loading assessments…"),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState(null),
    [detail, setDetail] = useState(null),
    [practice, setPractice] = useState(null),
    [week, setWeek] = useState("2026-10-26");
  const leaveGuard = useRef(null);
  const course = data?.course.id || courseId;
  const load = useCallback(async () => {
    const out = await api(
      `/api/assessment?course=${encodeURIComponent(courseId)}`,
    );
    setData(out);
    setStatus("");
  }, [courseId]);
  useEffect(() => {
    load().catch((e) => setStatus(e.message));
  }, [load]);
  const action = (payload) => api("/api/assessment", { course, ...payload });
  async function perform(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id) {
    await perform(async () => {
      setDetail(await api(`/api/assessment?course=${course}&id=${id}`));
      setDraft(null);
      setStatus("");
    });
  }
  async function refreshDetail(id) {
    setDetail(await api(`/api/assessment?course=${course}&id=${id}`));
  }
  if (!data)
    return (
      <div className="mcWorkspace">
        <h1>Assessment</h1>
        <p role="status">{status}</p>
      </div>
    );
  return (
    <div className="mcWorkspace">
      <header className="mcHero">
        <div>
          <div className="mcEyebrow">Show what you know</div>
          <h1>Assessment</h1>
          <p>
            {data.teacher
              ? "Prepare, preview and approve. Practice opens on approval; assessment access and results stay in your hands."
              : "Practice what you’re learning, save your work, and return when your teacher opens an assessment."}
          </p>
        </div>
        <ClassPicker
          courses={data.courses}
          course={data.course}
          base="/assessment"
        />
      </header>
      {status && (
        <div className="mcStatus" role="status">
          {status}
        </div>
      )}
      {(draft || detail || practice) && (
        <button
          onClick={async () => {
            try {
              await leaveGuard.current?.();
            } catch (e) {
              setStatus(e.message);
              return;
            }
            setDraft(null);
            setDetail(null);
            setPractice(null);
            load().catch((e) => setStatus(e.message));
          }}
        >
          ← All assessments
        </button>
      )}
      {draft ? (
        <DraftEditor
          key={draft.id}
          draft={draft}
          topics={data.topics}
          library={data.library}
          action={action}
          busy={busy}
          save={(next) =>
            perform(async () => {
              const out = await action({
                action: "edit",
                id: draft.id,
                revision: draft.revision,
                title: next.title,
                document: next.document,
              });
              setDraft(out);
              setStatus("Draft saved. Published versions remain fixed.");
            })
          }
          candidate={(q) =>
            perform(async () => {
              await action({ action: "library", question: q });
              await load();
              setStatus(
                "Saved as a library candidate. Curation still needs your approval.",
              );
            })
          }
        />
      ) : practice ? (
        <Practice
          key={practice.id}
          assignment={practice}
          leaveGuard={leaveGuard}
          action={action}
          setStatus={setStatus}
        />
      ) : detail ? (
        data.teacher ? (
          <TeacherAssignment
            key={detail.assignment.id}
            detail={detail}
            busy={busy}
            perform={perform}
            action={action}
            refresh={() => refreshDetail(detail.assignment.id)}
            setStatus={setStatus}
            editDraft={(questionId) =>
              perform(async () => {
                const source = await api(
                  `/api/assessment?course=${course}&draft=${detail.assignment.draft_id}`,
                );
                setDraft({
                  ...source,
                  initialPreview: Boolean(questionId),
                  initialEditingId: questionId,
                });
                setDetail(null);
              })
            }
          />
        ) : (
          <StudentAssignment
            key={detail.assignment.id}
            detail={detail}
            leaveGuard={leaveGuard}
            action={action}
            refresh={() => refreshDetail(detail.assignment.id)}
            setStatus={setStatus}
          />
        )
      ) : (
        <>
          <section className="mcGrid">
            {data.assignments.map((a) => (
              <article className="mcCard" key={a.id}>
                <span className="mcPill">
                  {a.approved_at
                    ? a.is_open
                      ? "Open"
                      : a.open_at
                        ? "Scheduled / locked"
                        : "Locked"
                    : "Teacher draft"}
                </span>
                <h2>{a.title}</h2>
                <p>
                  {a.mode === "spiral"
                    ? "Spiral Review"
                    : a.mode === "adaptive"
                      ? "Adaptive assessment"
                      : "Standard assessment"}
                </p>
                {a.released_at && <p>Results released</p>}
                <div className="mcRow">
                  <button disabled={busy} onClick={() => open(a.id)}>
                    {data.teacher ? "Manage class" : "View assessment"}
                  </button>
                  {a.practice && (
                    <button onClick={() => setPractice(a)}>
                      Practice fresh variations
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
          {!data.assignments.length && (
            <p className="mcEmpty">
              {data.teacher
                ? "Create a draft or prepare a week below."
                : "Your teacher hasn’t approved an assessment for this class yet."}
            </p>
          )}
          {data.teacher && (
            <>
              <section className="mcPanel">
                <h2>Teacher drafting</h2>
                <div className="mcRow">
                  <label>
                    Week beginning (Monday)
                    <input
                      type="date"
                      value={week}
                      onChange={(e) => setWeek(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const out = await action({ action: "generate", week });
                        await load();
                        setStatus(
                          out.skipped
                            ? out.reason
                            : `Prepared ${out.drafts.length} private draft groups. ${out.coverage.manifests
                                .filter((m) => m.warning)
                                .map((m) => `${m.title}: ${m.warning}`)
                                .join(
                                  " ",
                                )}${out.drafts.some((d) => d.drift) ? " Calendar drift found: review coverage before making changes." : ""}`,
                        );
                      })
                    }
                  >
                    Prepare provisional weekly drafts
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const out = await action({
                          action: "create",
                          title: "New assessment",
                        });
                        setDraft(out);
                        setDetail(null);
                      })
                    }
                  >
                    Create assessment for this class
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const out = await api(
                          `/api/assessment?course=${course}&coverage=${week}`,
                        );
                        setStatus(JSON.stringify(out, null, 2));
                      })
                    }
                  >
                    Inspect current lesson coverage
                  </button>
                </div>
                <p className="mcMuted">
                  November 2–6, 2026 is skipped. Equal curriculum lesson sets
                  share a draft. Existing drafts are preserved and calendar
                  differences flagged.
                </p>
              </section>
              <details className="mcPanel">
                <summary>Draft library · {data.drafts.length} drafts</summary>
                <div className="mcGrid">
                  {data.drafts.map((d) => (
                    <article key={d.id} className="mcCard">
                      <h3>{d.title}</h3>
                      <p>
                        {d.document.questions?.length || 0} questions · revision{" "}
                        {d.revision}
                      </p>
                      <button onClick={() => setDraft(d)}>
                        Edit and preview draft
                      </button>
                    </article>
                  ))}
                </div>
              </details>
              <details className="mcPanel">
                <summary>
                  Question library · curated versions and candidates
                </summary>
                <p>
                  Candidate questions and future rubric suggestions require
                  explicit approval before curation. Every curated record is a
                  separate fixed version.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    perform(async () => {
                      await action({
                        action: "library",
                        skill: f.get("skill"),
                        level: Number(f.get("level")),
                      });
                      await load();
                      setStatus("Question candidate generated.");
                    });
                  }}
                >
                  <div className="mcRow">
                    <label>
                      Skill
                      <select name="skill">
                        {data.topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Difficulty
                      <select name="level">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy}>Generate candidate</button>
                  </div>
                </form>
                <div className="mcGrid">
                  {data.library.map((q) => (
                    <article key={q.id} className="mcCard">
                      <span className="mcPill">{q.status}</span>
                      <h3>{q.title}</h3>
                      <p>{q.document.prompt}</p>
                      <details>
                        <summary>Scoring key</summary>
                        <p>
                          <MathPrint
                            text={q.document.solution || q.document.answer}
                          />
                        </p>
                      </details>
                      {q.status !== "curated" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await action({
                                action: "library",
                                id: q.id,
                                approve: true,
                              });
                              await load();
                              setStatus("New curated version approved.");
                            })
                          }
                        >
                          Approve as a curated version
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  topics,
  library,
  busy,
  save,
  candidate,
  action,
}) {
  const [title, setTitle] = useState(draft.title),
    [doc, setRawDoc] = useState(() => ({
      ...draft.document,
      questions: spiralLast(
        draft.document.questions,
        draft.document.mode || "standard",
      ),
    })),
    [preview, setPreview] = useState(Boolean(draft.initialPreview)),
    [editingId, setEditingId] = useState(draft.initialEditingId || null),
    [selected, setSelected] = useState(
      library.find((q) => q.status === "curated")?.id || "",
    ),
    [advanced, setAdvanced] = useState(JSON.stringify(draft.document, null, 2)),
    [error, setError] = useState("");
  const setDoc = (update) =>
    setRawDoc((previous) => {
      const next = typeof update === "function" ? update(previous) : update;
      return {
        ...next,
        questions: spiralLast(next.questions, next.mode || "standard"),
      };
    });
  const questions = doc.questions || [];
  function change(index, patch) {
    setDoc((d) => ({
      ...d,
      questions: d.questions.map((q, i) => {
        if (i !== index) return q;
        const next = { ...q, ...patch };
        if (
          patch.prompt !== undefined ||
          patch.answer !== undefined ||
          patch.solution !== undefined
        ) {
          delete next.generator;
          delete next.adaptiveGenerator;
        }
        return next;
      }),
    }));
  }
  function add() {
    const q = library.find((q) => q.id === selected)?.document || {
      id: crypto.randomUUID(),
      skill: "teacher-authored",
      prompt: "",
      points: 3,
      criteria: "Explain your reasoning and support your answer.",
      manual: true,
      desmos: true,
      solution: "",
      supports: "Desmos calculator",
      practice: { prompt: "", answer: "", solution: "" },
    };
    setDoc((d) => ({
      ...d,
      questions: [...d.questions, { ...q, id: crypto.randomUUID() }],
    }));
  }
  return (
    <section className="mcPanel">
      <div className="mcRow">
        <h2>Edit teacher-only draft</h2>
        <button onClick={() => setPreview((v) => !v)}>
          {preview ? "Return to editing" : "Preview student experience"}
        </button>
        <button disabled={busy} onClick={() => save({ title, document: doc })}>
          Save draft
        </button>
      </div>
      <p className="mcMuted">
        MathPrint formats recognized equations and fractions automatically. Use
        $...$ for inline LaTeX or $$...$$ for a separate equation. Standard
        assessments keep the spiral question last.
      </p>
      <label>
        Assessment title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="mcRow">
        <label>
          Mode
          <select
            value={doc.mode || "standard"}
            onChange={(e) => setDoc((d) => ({ ...d, mode: e.target.value }))}
          >
            <option value="standard">Standard</option>
            <option value="adaptive">Adaptive</option>
          </select>
        </label>
        <label>
          Design target (minutes)
          <input
            type="number"
            value={doc.target_minutes || 30}
            onChange={(e) =>
              setDoc((d) => ({ ...d, target_minutes: Number(e.target.value) }))
            }
          />
        </label>
        <label className="mcCheck">
          <input
            type="checkbox"
            checked={doc.variants || false}
            onChange={(e) =>
              setDoc((d) => ({ ...d, variants: e.target.checked }))
            }
          />
          Equivalent student variants
        </label>
      </div>
      <button
        onClick={async () => {
          try {
            setDoc(
              await action({
                action: "convertAdaptive",
                draft_id: draft.id,
                document: doc,
              }),
            );
            setError("");
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Preview supported adaptive choice counterparts
      </button>
      {doc.mode !== "standard" && <AdaptivePreview doc={doc} action={action} />}
      {doc.mode !== "standard" && (
        <div className="mcNotice">
          <p>
            Proposed adaptive grading: each skill’s score averages
            correct-response evidence weighted by difficulty (52%, 64%, 76%,
            88%, 100% at levels 1–5); misses contribute zero. Required skills
            are balanced. Untested skills remain ungraded. Stop after enough
            repeated evidence or the question cap. This is a transparent
            proposed criterion model, not a validated confidence estimate.
          </p>
          <label className="mcCheck">
            <input
              type="checkbox"
              checked={Boolean(doc.grading_reviewed_at)}
              onChange={(e) =>
                setDoc((d) => ({
                  ...d,
                  grading_reviewed_at: e.target.checked
                    ? new Date().toISOString()
                    : null,
                }))
              }
            />
            I reviewed this grading method and approve it for real grades
          </label>
          <label>
            Question cap
            <input
              type="number"
              min="6"
              max="30"
              value={doc.cap || 18}
              onChange={(e) =>
                setDoc((d) => ({ ...d, cap: Number(e.target.value) }))
              }
            />
          </label>
        </div>
      )}
      <details className="mcPanel">
        <summary>Coverage, provenance and spiral rationale</summary>
        <p>
          {doc.coverage?.lessons
            ?.map((l) => `${l.source_lesson_code} · ${l.title}`)
            .join("\n") || "Teacher-specified coverage"}
        </p>
        <p>{doc.spiralRationale}</p>
        {doc.sources?.map((s, i) => (
          <p key={i}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label || s.url}
            </a>{" "}
            · {s.status}
          </p>
        ))}
        {doc.warnings?.map((w, i) => (
          <p className="mcNotice" key={i}>
            {w}
          </p>
        ))}
      </details>
      {questions.map((q, index) =>
        preview && editingId !== q.id ? (
          <section key={q.id} className="mcPreviewQuestion">
            <div className="mcRow">
              <strong>Question {index + 1}</strong>
              <button onClick={() => setEditingId(q.id)}>
                Edit this question
              </button>
            </div>
            <Question question={safeQuestion(q)} />
          </section>
        ) : (
          <div className="mcEditorQuestion" key={q.id}>
            <div className="mcRow">
              <strong>Question {index + 1}</strong>
              {preview && (
                <button onClick={() => setEditingId(null)}>
                  Back to student preview
                </button>
              )}
              <button
                disabled={!index || (doc.mode === "standard" && q.spiral)}
                onClick={() =>
                  setDoc((d) => {
                    const a = [...d.questions];
                    [a[index - 1], a[index]] = [a[index], a[index - 1]];
                    return { ...d, questions: a };
                  })
                }
              >
                Move up
              </button>
              <button
                onClick={() =>
                  setDoc((d) => ({
                    ...d,
                    questions: d.questions.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove
              </button>
              <button onClick={() => candidate(q)}>
                Save library candidate
              </button>
            </div>
            <label>
              Question
              <textarea
                value={q.prompt}
                onChange={(e) => change(index, { prompt: e.target.value })}
              />
            </label>
            <div className="mcRow">
              <label>
                Skill
                <input
                  value={q.skill}
                  onChange={(e) => change(index, { skill: e.target.value })}
                />
              </label>
              <label>
                Points
                <input
                  type="number"
                  min="1"
                  value={q.points}
                  onChange={(e) =>
                    change(index, { points: Number(e.target.value) })
                  }
                />
              </label>
              <label className="mcCheck">
                <input
                  type="checkbox"
                  checked={q.spiral || false}
                  onChange={(e) => change(index, { spiral: e.target.checked })}
                />
                Spiral question
              </label>
              <label className="mcCheck">
                <input
                  type="checkbox"
                  checked={q.desmos || false}
                  onChange={(e) => change(index, { desmos: e.target.checked })}
                />
                Desmos allowed
              </label>
              <label className="mcCheck">
                <input
                  type="checkbox"
                  checked={q.manual || false}
                  onChange={(e) => change(index, { manual: e.target.checked })}
                />
                Teacher reviews scoring
              </label>
            </div>
            <label>
              Student-visible success criteria (no answers)
              <textarea
                value={q.criteria || ""}
                onChange={(e) => change(index, { criteria: e.target.value })}
              />
            </label>
            <label>
              Allowed supports
              <input
                value={q.supports || ""}
                onChange={(e) => change(index, { supports: e.target.value })}
              />
            </label>
            <label>
              Teacher answer / solution
              <textarea
                value={q.solution || q.answer || ""}
                onChange={(e) => change(index, { solution: e.target.value })}
              />
            </label>
            {!q.manual && (
              <label>
                Exact automatically scored answer
                <input
                  value={q.answer || ""}
                  onChange={(e) => change(index, { answer: e.target.value })}
                />
              </label>
            )}
            {!q.generator && (
              <>
                <label>
                  Fresh practice prompt
                  <textarea
                    value={q.practice?.prompt || ""}
                    onChange={(e) =>
                      change(index, {
                        practice: { ...q.practice, prompt: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Practice answer / walkthrough
                  <textarea
                    value={q.practice?.solution || q.practice?.answer || ""}
                    onChange={(e) =>
                      change(index, {
                        practice: {
                          ...q.practice,
                          solution: e.target.value,
                          answer: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
        ),
      )}
      {!preview && (
        <div className="mcRow">
          <label>
            Curated question
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">New teacher-authored question</option>
              {library
                .filter((q) => q.status === "curated")
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
            </select>
          </label>
          <button onClick={add}>Add question</button>
        </div>
      )}
      <details
        className="mcPanel"
        onToggle={(e) => {
          if (e.currentTarget.open) setAdvanced(JSON.stringify(doc, null, 2));
        }}
      >
        <summary>Advanced question and rubric editor</summary>
        <p>
          Use for explicit equivalent variants, linked graph groups,
          graphChoices, source mappings and partial-credit rubrics. Published
          snapshots never change when a draft changes.
        </p>
        <textarea
          className="mcCode"
          aria-label="Draft JSON"
          value={advanced}
          onChange={(e) => setAdvanced(e.target.value)}
        />
        <button
          onClick={() => {
            try {
              const parsed = JSON.parse(advanced);
              if (!Array.isArray(parsed.questions))
                throw Error("Questions must be an array.");
              setDoc(parsed);
              setError("");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Apply editor changes to draft
        </button>
        {error && <p role="alert">{error}</p>}
      </details>
      <p>
        {questions.length} questions ·{" "}
        {questions.reduce((s, q) => s + Number(q.points || 0), 0)} points ·{" "}
        {questions.filter((q) => q.spiral).length} spiral questions
      </p>
    </section>
  );
}

function TeacherAssignment({
  detail,
  busy,
  perform,
  action,
  refresh,
  setStatus,
  editDraft,
}) {
  const c = detail.assignment,
    [preview, setPreview] = useState(false),
    [student, setStudent] = useState(detail.roster[0]?.id || ""),
    [grading, setGrading] = useState(null),
    [bulk, setBulk] = useState(null);
  async function mutate(payload, message) {
    await action({ id: c.id, assignmentRevision: c.revision, ...payload });
    await refresh();
    setStatus(message);
  }
  return (
    <section className="mcPanel">
      <h2>{c.title}</h2>
      {detail.coverageDrift && (
        <p className="mcNotice">
          Calendar coverage changed since this draft was prepared. Review
          current lessons before approving or revising. Your draft has been
          preserved.
        </p>
      )}
      <div className="mcRow">
        <span className="mcPill">
          {c.approved_at
            ? "Approved · fixed question version"
            : "Private draft"}
        </span>
        <button onClick={() => editDraft()}>Edit source draft</button>
        {c.approved_at && (
          <button onClick={() => setPreview((v) => !v)}>
            Preview published student questions
          </button>
        )}
        {!c.approved_at && (
          <button
            disabled={busy}
            onClick={() =>
              perform(() =>
                mutate(
                  { action: "approve" },
                  "Approved. Fresh-variation practice is available. The assessment remains locked.",
                ),
              )
            }
          >
            Approve assessment and open practice
          </button>
        )}
      </div>
      {preview &&
        spiralLast(c.document.questions, c.document.mode || "standard").map(
          (q) => (
            <section key={q.id} className="mcPreviewQuestion">
              <button onClick={() => editDraft(q.id)}>
                Edit this question in source draft
              </button>
              <Question question={safeQuestion(q)} />
            </section>
          ),
        )}
      {c.approved_at && (
        <>
          <form
            key={c.revision}
            className="mcPanel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              perform(() =>
                mutate(
                  {
                    action: "access",
                    is_open: f.get("open") === "on",
                    open_at: f.get("openAt")
                      ? new Date(f.get("openAt")).toISOString()
                      : null,
                    close_at: f.get("closeAt")
                      ? new Date(f.get("closeAt")).toISOString()
                      : null,
                    time_minutes: f.get("minutes")
                      ? Number(f.get("minutes"))
                      : null,
                  },
                  "Assessment access saved.",
                ),
              );
            }}
          >
            <h3>Assessment access</h3>
            <p>
              Time fields use this device’s local time zone. Timers keep running
              while students are away. Closing freezes work for review; it never
              submits it.
            </p>
            <div className="mcRow">
              <label className="mcCheck">
                <input name="open" type="checkbox" defaultChecked={c.is_open} />
                Open manually
              </label>
              <label>
                Scheduled opening
                <input
                  name="openAt"
                  type="datetime-local"
                  defaultValue={localDate(c.open_at)}
                />
              </label>
              <label>
                Scheduled closing
                <input
                  name="closeAt"
                  type="datetime-local"
                  defaultValue={localDate(c.close_at)}
                />
              </label>
              <label>
                Timer minutes (blank = untimed)
                <input
                  type="number"
                  name="minutes"
                  min="1"
                  max="240"
                  defaultValue={c.time_minutes || ""}
                />
              </label>
              <button disabled={busy}>Save access</button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  perform(() =>
                    mutate(
                      {
                        action: "access",
                        is_open: false,
                        open_at: null,
                        close_at: new Date().toISOString(),
                        time_minutes: c.time_minutes,
                      },
                      "Assessment closed. Saved attempts are frozen.",
                    ),
                  )
                }
              >
                Close and freeze now
              </button>
            </div>
          </form>
          <div className="mcRow">
            <button
              disabled={busy}
              onClick={() =>
                perform(() =>
                  mutate(
                    { action: "release", release: !c.released_at },
                    c.released_at
                      ? "Results hidden."
                      : "Results and solutions released to students.",
                  ),
                )
              }
            >
              {c.released_at
                ? "Hide results"
                : "Release results, answers and feedback"}
            </button>
            <span>
              {c.released_at
                ? "Results released"
                : "Results hidden from students"}
            </span>
          </div>
          <details className="mcPanel">
            <summary>Individual makeup and Spiral Review</summary>
            <label>
              Student
              <select
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              >
                <option value="">Choose student</option>
                {detail.roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <form
              key={`${student}:${c.revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                perform(() =>
                  mutate(
                    {
                      action: "grant",
                      student,
                      grant: {
                        is_open: f.get("allowed") === "on",
                        attempts: Number(f.get("attempts")),
                        extra_minutes: Number(f.get("extra") || 0),
                        ...(f.get("untimed") === "on"
                          ? { time_minutes: null }
                          : f.get("timer")
                            ? { time_minutes: Number(f.get("timer")) }
                            : {}),
                        variants: f.get("variants") === "on",
                        ...(f.get("open")
                          ? { open_at: new Date(f.get("open")).toISOString() }
                          : {}),
                        ...(f.get("close")
                          ? { close_at: new Date(f.get("close")).toISOString() }
                          : {}),
                        supervised_only: f.get("supervised") === "on",
                      },
                    },
                    "Student makeup permission saved.",
                  ),
                );
              }}
            >
              <div className="mcRow">
                <label className="mcCheck">
                  <input
                    type="checkbox"
                    name="allowed"
                    defaultChecked={
                      c.document.grants?.[student]?.is_open || false
                    }
                  />
                  Allow assessment access
                </label>
                <label>
                  Attempts allowed
                  <input
                    type="number"
                    name="attempts"
                    min="1"
                    max="10"
                    defaultValue={c.document.grants?.[student]?.attempts || 1}
                  />
                </label>
                <label>
                  Extra minutes
                  <input
                    type="number"
                    name="extra"
                    min="0"
                    max="480"
                    defaultValue={
                      c.document.grants?.[student]?.extra_minutes || 0
                    }
                  />
                </label>
                <label>
                  Individual timer (blank = inherit)
                  <input
                    name="timer"
                    type="number"
                    min="1"
                    max="240"
                    defaultValue={
                      c.document.grants?.[student]?.time_minutes || ""
                    }
                  />
                </label>
                <label className="mcCheck">
                  <input
                    name="untimed"
                    type="checkbox"
                    defaultChecked={
                      c.document.grants?.[student]?.time_minutes === null
                    }
                  />
                  Untimed makeup
                </label>
                <label className="mcCheck">
                  <input
                    name="variants"
                    type="checkbox"
                    defaultChecked={
                      c.document.grants?.[student]?.variants || false
                    }
                  />
                  Equivalent makeup variation
                </label>
                <label>
                  Open
                  <input
                    type="datetime-local"
                    name="open"
                    defaultValue={localDate(
                      c.document.grants?.[student]?.open_at,
                    )}
                  />
                </label>
                <label>
                  Close
                  <input
                    type="datetime-local"
                    name="close"
                    defaultValue={localDate(
                      c.document.grants?.[student]?.close_at,
                    )}
                  />
                </label>
                <label className="mcCheck">
                  <input
                    type="checkbox"
                    name="supervised"
                    defaultChecked={
                      c.document.grants?.[student]?.supervised_only || false
                    }
                  />
                  Supervised makeup (teacher supervision required)
                </label>
                <button disabled={busy || !student}>
                  Save makeup permission
                </button>
              </div>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                perform(() =>
                  mutate(
                    {
                      action: "spiral",
                      student,
                      random: f.get("target") === "all",
                      minutes: Number(f.get("minutes")),
                      reviewed: f.get("reviewed") === "on",
                    },
                    "Spiral Review unlocked for this student. Original grades remain unchanged.",
                  ),
                );
              }}
            >
              <h3>Unlock adaptive Spiral Review</h3>
              <p>
                Uses previously assessed skills with verified generators.
                Written-response items use explicit selected-response
                counterparts where available; these do not automatically score
                written proofs or graph construction. No backtracking. Grade
                recovery always needs a separate teacher approval.
              </p>
              <div className="mcRow">
                <label>
                  Review pool
                  <select name="target">
                    <option value="this">This assessment</option>
                    <option value="all">
                      Random across previously assessed work
                    </option>
                  </select>
                </label>
                <label>
                  Target minutes
                  <input
                    name="minutes"
                    type="number"
                    min="10"
                    max="60"
                    defaultValue="30"
                  />
                </label>
              </div>
              <p>
                Proposed grading averages difficulty-weighted evidence for each
                tested skill: correct answers contribute 52/64/76/88/100% at
                levels 1–5; misses zero. Untested skills remain ungraded. This
                does not claim statistical confidence.
              </p>
              <label className="mcCheck">
                <input name="reviewed" type="checkbox" />I reviewed the grading
                method and approve it for this review
              </label>
              <button disabled={busy || !student}>Unlock Spiral Review</button>
            </form>
          </details>
          <h3>Class roster · manual grade entry</h3>
          <div className="mcTableWrap">
            <table className="mcTable">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Completion</th>
                  <th>Score / 100</th>
                  <th>Skills needing support / flags</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {detail.roster.map((s) => {
                  const attempts = detail.attempts.filter(
                      (a) => a.user_id === s.id,
                    ),
                    a = attempts.at(-1);
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        {a
                          ? a.submitted_at
                            ? "Submitted"
                            : a.state === "frozen"
                              ? "Frozen · teacher action needed"
                              : "Started"
                          : "Not started"}
                      </td>
                      <td>{a?.score ?? "Needs review"}</td>
                      <td>
                        {a?.questions
                          .filter(
                            (q) => (a.marks?.[q.id] ?? q.points) < q.points,
                          )
                          .map((q) => q.skill)
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .join(", ")}
                        {c.document.grants?.[s.id]?.supervised_only
                          ? " · Supervised makeup"
                          : ""}
                      </td>
                      <td>
                        {attempts.map((at) => (
                          <button
                            key={at.id}
                            onClick={() => {
                              setGrading(at);
                              setBulk(null);
                            }}
                          >
                            Review{" "}
                            {attempts.length > 1 ? at.id.slice(0, 4) : "work"}
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {grading &&
            c.document.mode === "spiral" &&
            grading.submitted_at &&
            grading.score !== null && (
              <button
                disabled={busy}
                onClick={() =>
                  perform(() =>
                    mutate(
                      {
                        action: "recovery",
                        attempt_id: grading.id,
                        approve: true,
                      },
                      "Recovery grade explicitly approved. Original grade history preserved.",
                    ),
                  )
                }
              >
                Approve this Spiral Review score as the original assessment
                replacement
              </button>
            )}
          {grading && (
            <GradeEditor
              key={`${grading.id}:${grading.revision}`}
              attempt={grading}
              busy={busy}
              save={(payload) =>
                perform(async () => {
                  await mutate(
                    {
                      action: "grade",
                      attempt_id: grading.id,
                      revision: grading.revision,
                      ...payload,
                    },
                    "Grade saved. Release results when ready.",
                  );
                  setGrading(null);
                })
              }
              teacherSubmit={() =>
                perform(async () => {
                  await mutate(
                    { action: "teacherSubmit", attempt_id: grading.id },
                    "Saved work submitted by teacher.",
                  );
                  setGrading(null);
                })
              }
              future={(q) =>
                perform(async () => {
                  await action({
                    action: "library",
                    question: q,
                    suggestion: true,
                  });
                  setStatus(
                    "Future rubric suggestion saved. Explicit approval required before reuse.",
                  );
                })
              }
              previewBulk={(q, answer) =>
                perform(async () => {
                  const out = await action({
                    action: "bulkPreview",
                    id: c.id,
                    question_id: q.id,
                    prompt: q.prompt,
                    answer,
                  });
                  setBulk({ q, answer, preview: out.matches });
                })
              }
            />
          )}
          {bulk && (
            <form
              className="mcNotice"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                perform(async () => {
                  await mutate(
                    {
                      action: "bulkApply",
                      question_id: bulk.q.id,
                      prompt: bulk.q.prompt,
                      answer: bulk.answer,
                      preview: bulk.preview,
                      mark: Number(f.get("mark")),
                      note: f.get("note"),
                    },
                    "Matching answers adjusted in this class only.",
                  );
                  setBulk(null);
                  setGrading(null);
                });
              }}
            >
              <h3>
                {bulk.preview.length} matching submitted responses in this class
              </h3>
              <p>
                Question and prompt must match exactly. Different-number
                variants are excluded.
              </p>
              <label>
                New mark (0–{bulk.q.points})
                <input
                  name="mark"
                  type="number"
                  step=".25"
                  min="0"
                  max={bulk.q.points}
                  required
                />
              </label>
              <label>
                Feedback
                <input name="note" />
              </label>
              <button disabled={busy || !bulk.preview.length}>
                Apply to these matching class responses
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
function localDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function GradeEditor({
  attempt: a,
  busy,
  save,
  teacherSubmit,
  future,
  previewBulk,
}) {
  const [marks, setMarks] = useState(a.marks || {}),
    [feedback, setFeedback] = useState(a.feedback || {}),
    [override, setOverride] = useState(""),
    [note, setNote] = useState("");
  return (
    <section className="mcPanel">
      <h3>Submission review</h3>
      {!a.submitted_at && (
        <div className="mcNotice">
          This is saved, unsubmitted work. It remains unsubmitted after expiry.
          <button disabled={busy} onClick={teacherSubmit}>
            Teacher-submit this saved attempt
          </button>
        </div>
      )}
      {a.questions.map((q) => (
        <details className="mcPanel" key={q.id}>
          <summary>
            {q.prompt.slice(0, 100)} · {marks[q.id] ?? "Review"}/{q.points}
          </summary>
          <Question question={q} work={a.work?.[q.id]} disabled />
          <p>
            <strong>Teacher solution:</strong>{" "}
            <MathPrint text={q.solution || q.answer} />
          </p>
          <p>
            <strong>Rubric:</strong> <MathPrint text={q.rubric || q.criteria} />
          </p>
          <div className="mcRow">
            <label>
              Points awarded
              <input
                type="number"
                step=".25"
                min="0"
                max={q.points}
                value={marks[q.id] ?? ""}
                onChange={(e) =>
                  setMarks((m) => ({ ...m, [q.id]: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Feedback
              <textarea
                value={feedback[q.id] || ""}
                onChange={(e) =>
                  setFeedback((m) => ({ ...m, [q.id]: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="mcRow">
            <button
              disabled={busy || !a.submitted_at}
              onClick={() => previewBulk(q, a.work?.[q.id]?.answer)}
            >
              Preview identical-answer adjustment
            </button>
            <button
              disabled={busy}
              onClick={() =>
                future({
                  ...q,
                  rubric: feedback[q.id] || q.rubric || q.criteria,
                })
              }
            >
              Save future rubric suggestion
            </button>
          </div>
        </details>
      ))}
      <label>
        Optional overall override (0–100)
        <input
          type="number"
          min="0"
          max="100"
          value={override}
          onChange={(e) => setOverride(e.target.value)}
        />
      </label>
      <label>
        Teacher note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        disabled={busy || !a.submitted_at}
        onClick={() =>
          save({
            marks,
            feedback,
            override: override === "" ? null : Number(override),
            note,
          })
        }
      >
        Save reviewed grade
      </button>
      {a.gradeHistory?.length > 0 && (
        <details>
          <summary>
            Original grade history · {a.gradeHistory.length} changes
          </summary>
          {a.gradeHistory.map((h, i) => (
            <p key={i}>
              {h.at} · {h.score ?? "Ungraded"}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}

// Unsaved answers are copied to this tab's sessionStorage so a reload or a
// dropped connection doesn't lose them. sessionStorage clears when the tab
// closes, so nothing lingers on a shared Chromebook.
const draftKey = (attemptId) => `mathclaw:assessment-draft:${attemptId}`;
function readDraft(attemptId) {
  try {
    return JSON.parse(window.sessionStorage.getItem(draftKey(attemptId)) || "null");
  } catch {
    return null;
  }
}
function writeDraft(attemptId, revision, work) {
  try {
    window.sessionStorage.setItem(draftKey(attemptId), JSON.stringify({ revision, work }));
  } catch {}
}
function clearDraft(attemptId) {
  try {
    window.sessionStorage.removeItem(draftKey(attemptId));
  } catch {}
}

function StudentAssignment({ detail, action, refresh, setStatus, leaveGuard }) {
  const [remoteVersion, setRemoteVersion] = useState(0);
  const [attempt, setAttempt] = useState(detail.attempt),
    [busy, setBusy] = useState(false),
    [index, setIndex] = useState(0),
    [work, setWork] = useState(detail.attempt?.work || {}),
    [now, setNow] = useState(Date.now()),
    [conflict, setConflict] = useState(false);
  const current = useRef(detail.attempt),
    latestWork = useRef(detail.attempt?.work || {}),
    dirty = useRef(false),
    timer = useRef(null),
    chain = useRef(Promise.resolve());
  const c = detail.assignment,
    questions = attempt?.questions || [],
    q = questions[index] || questions[0];
  const expired = attempt?.deadline && now >= Date.parse(attempt.deadline),
    frozen =
      expired ||
      ["frozen", "locked", "submitted"].includes(attempt?.state) ||
      Boolean(attempt?.submitted_at) ||
      conflict;
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(clock);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    function before(e) {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  useEffect(() => {
    let live = true;
    async function poll() {
      if (dirty.current || busy) return;
      try {
        const out = await api(
          `/api/assessment?course=${new URLSearchParams(window.location.search).get("course") || ""}&id=${c.id}`,
        );
        if (live && out.attempt && !dirty.current) {
          if (out.attempt.revision !== current.current?.revision)
            setRemoteVersion((v) => v + 1);
          current.current = out.attempt;
          setAttempt(out.attempt);
          latestWork.current = out.attempt.work || {};
          setWork(out.attempt.work || {});
        }
      } catch (e) {
        if (live) setStatus(e.message);
      }
    }
    const id = setInterval(poll, 15000);
    window.addEventListener("online", poll);
    window.addEventListener("focus", poll);
    return () => {
      live = false;
      clearInterval(id);
      window.removeEventListener("online", poll);
      window.removeEventListener("focus", poll);
    };
  }, [c.id, busy, setStatus]);
  const attemptId = attempt?.id;
  useEffect(() => {
    if (!attemptId) return;
    const draft = readDraft(attemptId);
    const a = current.current;
    if (!draft || !a) return;
    const closed =
      Boolean(a.submitted_at) || ["frozen", "locked", "submitted"].includes(a.state);
    if (closed || draft.revision !== a.revision) {
      clearDraft(attemptId);
      return;
    }
    if (JSON.stringify(draft.work) === JSON.stringify(a.work || {})) return;
    latestWork.current = draft.work;
    setWork(draft.work);
    dirty.current = true;
    setStatus("Restored unsaved answers from this tab. Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save().catch(() => {}), 300);
    // Run once per attempt; save() reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);
  useEffect(() => {
    function resend() {
      if (dirty.current) save().catch(() => {});
    }
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  });
  async function start() {
    setBusy(true);
    try {
      const out = await action({ action: "start", id: c.id });
      current.current = out;
      latestWork.current = out.work || {};
      setWork(out.work || {});
      setAttempt(out);
      setStatus("");
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  function save(options = {}) {
    const snapshot = structuredClone(latestWork.current);
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        if (conflict)
          throw Error("Reload the current saved version before continuing.");
        const a = current.current;
        if (!a) return;
        const allowed =
          a.mode === "standard"
            ? snapshot
            : a.current_id
              ? {
                  [a.current_id]: snapshot[a.current_id] || {
                    answer: "",
                    typed: "",
                  },
                }
              : {};
        try {
          const out = await action({
            action: "save",
            id: c.id,
            attempt_id: a.id,
            revision: a.revision,
            work: allowed,
            ...options,
          });
          current.current = out;
          setAttempt(out);
          dirty.current =
            JSON.stringify(latestWork.current) !== JSON.stringify(snapshot);
          if (options.advance || options.submit) {
            latestWork.current = out.work;
            setWork(out.work);
            dirty.current = false;
            setIndex(0);
          }
          if (dirty.current) writeDraft(a.id, out.revision, latestWork.current);
          else clearDraft(a.id);
          setStatus(
            options.submit
              ? "Submitted. Your teacher will release results when ready."
              : "Saved",
          );
          return out;
        } catch (e) {
          setStatus(
            `Not saved: ${e.message} Your work remains here. Download a copy before reloading if needed.`,
          );
          if (/changed|Reload/i.test(e.message)) setConflict(true);
          throw e;
        }
      });
    chain.current.catch(() => {});
    return chain.current;
  }
  useEffect(() => {
    if (leaveGuard)
      leaveGuard.current = async () => {
        clearTimeout(timer.current);
        if (dirty.current) await save();
      };
    return () => {
      if (leaveGuard) leaveGuard.current = null;
    };
  });
  function change(next) {
    if (typeof next === "function") next = next(latestWork.current[q.id] || {});
    const updated = { ...latestWork.current, [q.id]: next };
    if (q.graphGroup)
      questions
        .filter((x) => x.graphGroup === q.graphGroup)
        .forEach((x) => {
          updated[x.id] = { ...updated[x.id], graph: next.graph };
        });
    latestWork.current = updated;
    setWork(updated);
    dirty.current = true;
    if (current.current?.id)
      writeDraft(current.current.id, current.current.revision, updated);
    setStatus(navigator.onLine === false ? "Offline: saved in this tab until you reconnect." : "Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save().catch(() => {}), 700);
  }
  async function submit(options) {
    setBusy(true);
    clearTimeout(timer.current);
    try {
      await save(options);
      if (options.submit) await refresh();
    } catch {
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            assessment: c.title,
            savedAt: new Date().toISOString(),
            work: latestWork.current,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "assessment-work.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="mcPanel">
      <h2>{c.title}</h2>
      {!attempt ? (
        <>
          <p>
            One attempt unless your teacher authorizes another. Your answers and
            typed/Desmos work save automatically. Results stay hidden until
            release.
          </p>
          <button disabled={busy} onClick={start}>
            Start or resume assessment
          </button>
        </>
      ) : (
        <>
          <div className="mcRow">
            <span className="mcPill">
              {attempt.submitted_at
                ? "Submitted"
                : frozen
                  ? "Work frozen"
                  : "In progress"}
            </span>
            {attempt.deadline && !attempt.submitted_at && (
              <span className="mcTimer">
                {expired
                  ? "Time expired"
                  : `${Math.max(0, Math.ceil((Date.parse(attempt.deadline) - now) / 60000))} minutes remaining`}
              </span>
            )}
            <button onClick={download}>Download my work</button>
          </div>
          {frozen && !attempt.submitted_at && (
            <p className="mcNotice">
              Your work is frozen and has not been submitted. Your teacher can
              submit your saved work or extend access.
            </p>
          )}
          {attempt.mode === "standard" ? (
            <nav className="mcTabs" aria-label="Assessment questions">
              {questions.map((question, i) => (
                <button
                  key={question.id}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => {
                    clearTimeout(timer.current);
                    if (dirty.current && !frozen) save().catch(() => {});
                    setIndex(i);
                  }}
                >
                  {i + 1}
                  {work[question.id]?.answer ? " ✓" : ""}
                </button>
              ))}
            </nav>
          ) : (
            <p>
              Adaptive assessment · earlier questions cannot be revisited.
              Difficulty changes are part of the assessment; grades and feedback
              appear after release.
            </p>
          )}
          {q && (
            <Question
              key={`${q.id}:${remoteVersion}`}
              question={q}
              work={work[q.id] || {}}
              onChange={change}
              disabled={frozen || busy}
            />
          )}
          {!frozen && (
            <div className="mcRow">
              <button disabled={busy} onClick={() => submit({})}>
                Save now
              </button>
              {attempt.mode !== "standard" && !attempt.finished ? (
                <button
                  disabled={busy}
                  onClick={() => submit({ advance: true })}
                >
                  Lock answer and continue
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => submit({ submit: true })}
                >
                  Submit assessment
                </button>
              )}
            </div>
          )}
          {attempt.submitted_at && c.canStartAnother && (
            <button disabled={busy} onClick={start}>
              Start authorized new attempt
            </button>
          )}
          {c.supervisedOnly && (
            <p className="mcNotice">
              Your teacher requires supervision for this makeup. Start only when
              your teacher is present.
            </p>
          )}
          {attempt.submitted_at && !attempt.released && (
            <p className="mcNotice">
              Submitted. Scores, answers, feedback and statistics stay private
              until your teacher releases them.
            </p>
          )}
          {attempt.released && (
            <section className="mcPanel">
              <h2>
                Your result · {attempt.score ?? "Teacher review pending"}/100
              </h2>
              {attempt.questions.map((question) => (
                <article key={question.id}>
                  <h3>
                    <MathPrint text={question.prompt} />
                  </h3>
                  <p>
                    {attempt.marks?.[question.id] ?? "Pending"}/
                    {question.points}
                  </p>
                  <p>
                    <MathPrint text={question.solution || question.answer} />
                  </p>
                  <p>
                    <MathPrint text={attempt.feedback?.[question.id]} />
                  </p>
                </article>
              ))}
              {detail.stats && !detail.stats.suppressed ? (
                <>
                  <h3>Anonymous class results</h3>
                  <p>
                    Mean {detail.stats.mean.toFixed(1)} · Median{" "}
                    {detail.stats.median} · Mode{" "}
                    {detail.stats.mode.join(", ") || "None"} · Range{" "}
                    {detail.stats.range} · Standard deviation{" "}
                    {detail.stats.standardDeviation.toFixed(1)}
                  </p>
                  <div className="mcDistribution">
                    {detail.stats.distribution.map((b) => (
                      <div key={b.from} className={b.self ? "self" : ""}>
                        <span>{b.count}</span>
                        <i
                          style={{
                            height: `${Math.max(2, (b.count / detail.stats.count) * 140)}px`,
                          }}
                        />
                        {b.from}–{Math.ceil(b.to)}
                        {b.self && " · You"}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>{detail.stats?.reason}</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
function Practice({ assignment, action, setStatus, leaveGuard }) {
  const [q, setQ] = useState(null),
    [work, setWork] = useState({}),
    [feedback, setFeedback] = useState(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(
      assignment.practiceSkills?.[0]?.id || "",
    );
  const practiceDirty = useRef(false),
    practiceLatest = useRef({});
  const started = useRef(false),
    timer = useRef(null),
    queue = useRef(Promise.resolve());
  async function next() {
    clearTimeout(timer.current);
    setBusy(true);
    try {
      await queue.current;
      const out = await action({
        action: "practice",
        id: assignment.id,
        fresh: started.current,
        question_id: selected,
      });
      setQ(out.question);
      setWork(out.work || {});
      practiceLatest.current = out.work || {};
      practiceDirty.current = false;
      setFeedback(null);
      started.current = true;
      setStatus("");
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    next(); /* Start once per selected practice assignment. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function savePractice(value) {
    const id = q.id;
    queue.current = queue.current
      .catch(() => {})
      .then(() =>
        action({
          action: "practiceSave",
          id: assignment.id,
          question_id: id,
          work: value,
        }),
      )
      .then(() => {
        practiceDirty.current =
          JSON.stringify(practiceLatest.current) !== JSON.stringify(value);
      })
      .catch((e) => {
        setStatus(`Practice not saved: ${e.message}`);
        throw e;
      });
    queue.current.catch(() => {});
    return queue.current;
  }
  useEffect(() => {
    if (leaveGuard)
      leaveGuard.current = async () => {
        clearTimeout(timer.current);
        if (practiceDirty.current) await savePractice(practiceLatest.current);
      };
    return () => {
      if (leaveGuard) leaveGuard.current = null;
    };
  });
  useEffect(() => {
    function before(e) {
      if (practiceDirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      clearTimeout(timer.current);
    };
  }, []);
  function changePractice(next) {
    if (typeof next === "function") next = next(practiceLatest.current);
    practiceDirty.current = true;
    practiceLatest.current = next;
    setWork(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => savePractice(next).catch(() => {}), 700);
  }
  return (
    <section className="mcPanel">
      <h2>Practice · {assignment.title}</h2>
      <label>
        Practice skill
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {assignment.practiceSkills?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Fresh values, unlimited attempts and immediate feedback. This does not
        change your assessment grade.
      </p>
      {q && (
        <>
          <Question
            key={q.id}
            question={q}
            work={work}
            onChange={changePractice}
            disabled={busy}
          />
          <div className="mcRow">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  clearTimeout(timer.current);
                  await savePractice(work);
                  setFeedback(
                    await action({
                      action: "practiceCheck",
                      id: assignment.id,
                      answer: work.answer,
                    }),
                  );
                } catch (e) {
                  setStatus(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check and show walkthrough
            </button>
            <button disabled={busy} onClick={next}>
              Fresh practice variation
            </button>
          </div>
          {feedback && (
            <div className="mcNotice">
              <h3>
                {feedback.manual
                  ? "Compare your reasoning"
                  : feedback.correct
                    ? "Correct"
                    : "Review your approach"}
              </h3>
              <p>
                <MathPrint text={feedback.solution} />
              </p>
              <p>
                <MathPrint text={feedback.rubric} />
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AdaptivePreview({ doc, action }) {
  const [history, setHistory] = useState([]),
    [question, setQuestion] = useState(null),
    [error, setError] = useState("");
  const skills = [...new Set(doc.questions.map((q) => q.skill))];
  async function advance(correct, restart = false) {
    const updated = restart
      ? []
      : question
        ? [
            ...history,
            { skill: question.skill, level: question.level, correct },
          ]
        : [];
    setHistory(updated);
    const next = adaptiveNext(updated, skills, doc.cap || 18);
    if (!next) {
      setQuestion(null);
      return;
    }
    const template = doc.questions.find((q) => q.skill === next.skill);
    try {
      const q = await action({
        action: "previewPath",
        generator: template.generator,
        level: next.level,
      });
      setQuestion(q);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <details className="mcPanel">
      <summary>Teacher sample adaptive path</summary>
      <p>
        This simulation saves no student attempt or grade. Use correct/missed
        choices to inspect balancing, difficulty changes and stopping.
      </p>
      <button
        onClick={() => {
          advance(false, true);
        }}
      >
        Start sample path
      </button>
      {question && (
        <>
          <Question question={safeQuestion(question)} />
          <p>Teacher key: {question.answer}</p>
          <div className="mcRow">
            <button onClick={() => advance(true)}>Simulate correct</button>
            <button onClick={() => advance(false)}>Simulate missed</button>
          </div>
        </>
      )}
      <p>
        {history.length} answers · proposed score{" "}
        {adaptiveGrade(history, skills).score ??
          "Untested skills remain ungraded"}
      </p>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
