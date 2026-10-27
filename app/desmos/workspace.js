"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MathPrint from "../assessment/math-print";
import { api, ClassPicker, Question } from "../assessment/shared";

export default function DesmosWorkspace({ courseId }) {
  const [data, setData] = useState(null),
    [status, setStatus] = useState("Loading Desmos…"),
    [filter, setFilter] = useState("library"),
    [skill, setSkill] = useState(null),
    [run, setRun] = useState(null),
    [work, setWork] = useState({}),
    [hint, setHint] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState([]),
    [title, setTitle] = useState("Desmos mastery assignment");
  const workVersion = useRef(0);
  const timer = useRef(null),
    queue = useRef(Promise.resolve()),
    latest = useRef({}),
    dirty = useRef(false);
  const course = data?.course.id || courseId;
  const load = useCallback(async () => {
    const next = await api(
      `/api/desmos?course=${encodeURIComponent(courseId)}`,
    );
    setData(next);
    setStatus("");
  }, [courseId]);
  useEffect(() => {
    load().catch((e) => setStatus(e.message));
    return () => clearTimeout(timer.current);
  }, [load]);
  function action(payload) {
    return api("/api/desmos", { course, ...payload });
  }
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
  async function open(topic, review = false) {
    await perform(async () => {
      clearTimeout(timer.current);
      await queue.current;
      const out = await action({ action: "start", skill: topic.id, review });
      setSkill(topic);
      setRun(out.run);
      workVersion.current = out.run.work_revision || 0;
      setWork(out.run.work);
      latest.current = out.run.work;
      setHint("");
      dirty.current = false;
      setStatus("");
    });
  }
  function enqueueSave(value) {
    const id = run.id,
      topic = skill.id;
    queue.current = queue.current
      .catch(() => {})
      .then(() =>
        action({
          action: "save",
          skill: topic,
          run_id: id,
          work_revision: workVersion.current,
          work: {
            answer: value.answer || "",
            typed: value.typed || "",
            graph: value.graph || null,
          },
        }),
      )
      .then((out) => {
        workVersion.current = out.work_revision;
        dirty.current =
          JSON.stringify(latest.current) !== JSON.stringify(value);
        setStatus(dirty.current ? "Saving…" : "Saved");
      })
      .catch((e) => {
        dirty.current = true;
        setStatus(
          `Not saved: ${e.message} Your work remains on this page. Retry saving before leaving.`,
        );
        throw e;
      });
    queue.current.catch(() => {});
    return queue.current;
  }
  function change(next) {
    if (typeof next === "function") next = next(latest.current);
    setWork(next);
    latest.current = next;
    dirty.current = true;
    setStatus("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => enqueueSave(latest.current).catch(() => {}),
      700,
    );
  }
  async function check() {
    await perform(async () => {
      clearTimeout(timer.current);
      await enqueueSave(latest.current);
      const out = await action({
        action: "check",
        skill: skill.id,
        run_id: run.id,
        work_revision: workVersion.current,
        answer: latest.current.answer,
      });
      setRun(out.run);
      dirty.current = false;
      await load();
      setStatus(
        out.run.feedback.correct
          ? "Correct. Your practice progress was saved."
          : "Keep practicing. Review the walkthrough below.",
      );
    });
  }
  async function showHint() {
    await perform(async () => {
      clearTimeout(timer.current);
      if (dirty.current) await enqueueSave(latest.current);
      const out = await action({
        action: "hint",
        skill: skill.id,
        run_id: run.id,
      });
      setHint(out.hint);
      setRun((r) => ({ ...r, hinted: true }));
      setStatus("Hint recorded. This question cannot earn proficiency.");
    });
  }
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
  if (!data)
    return (
      <div className="mcWorkspace">
        <h1>Desmos</h1>
        <p role="status">{status}</p>
      </div>
    );
  const due = data.topics.filter(
    (t) =>
      data.mastery[t.id]?.review_at &&
      Date.now() >= Date.parse(data.mastery[t.id].review_at),
  );
  const assigned = new Set(data.assignments.flatMap((a) => a.skills));
  const visible = data.topics.filter((t) =>
    filter === "due"
      ? due.some((s) => s.id === t.id)
      : filter === "assigned"
        ? assigned.has(t.id)
        : true,
  );
  return (
    <div className="mcWorkspace">
      <header className="mcHero">
        <div>
          <div className="mcEyebrow">Learn · practice · remember</div>
          <h1>Desmos</h1>
          <p>
            Build calculator skills with guided lessons, unlimited practice and
            review when it’s time.
          </p>
        </div>
        <ClassPicker
          courses={data.courses}
          course={data.course}
          base="/desmos"
        />
      </header>
      {status && (
        <div className="mcStatus" role="status">
          {status}
        </div>
      )}
      {skill && run ? (
        <>
          <div className="mcRow">
            <button
              onClick={() =>
                perform(async () => {
                  clearTimeout(timer.current);
                  if (dirty.current && !run.done)
                    await enqueueSave(latest.current);
                  setSkill(null);
                  setRun(null);
                  await load();
                })
              }
            >
              ← Skill library
            </button>
            <span className="mcPill">Level {run.question.level} / 5</span>
            <span>{run.hinted ? "Hint used · practice only" : "Unhinted"}</span>
          </div>
          <details className="mcPanel">
            <summary>Guided lesson · {skill.name}</summary>
            {skill.lesson ? (
              <>
                <p>
                  <MathPrint text={skill.lesson.intro} />
                </p>
                <ol>
                  {skill.lesson.inputs.map((v, i) => (
                    <li key={i}>
                      <code>{v}</code>
                    </li>
                  ))}
                </ol>
                <p>
                  <MathPrint text={skill.lesson.result} />
                </p>
                <p>
                  <strong>Watch for:</strong>{" "}
                  <MathPrint text={skill.lesson.pitfall} />
                </p>
                <div className="mcRow">
                  {skill.lesson.resources?.map((r) => (
                    <a
                      key={r.url}
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <p>
                Read the problem carefully, identify the requested quantity, and
                check your answer in the original situation. Use the hint and
                worked solution when you need support.
              </p>
            )}
          </details>
          <Question
            question={run.question}
            work={work}
            onChange={change}
            disabled={busy || run.done}
          />
          <div className="mcRow">
            {!run.done ? (
              <>
                <button disabled={busy} onClick={check}>
                  Check answer
                </button>
                <button disabled={busy} onClick={showHint}>
                  Show hint
                </button>
                <button
                  disabled={busy}
                  onClick={() => perform(() => enqueueSave(latest.current))}
                >
                  Save now
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => open(skill)}>
                Next question
              </button>
            )}
          </div>
          {hint && (
            <div className="mcNotice">
              <MathPrint text={hint} />
            </div>
          )}
          {run.done && (
            <section className="mcPanel">
              <h2>
                {run.feedback.correct ? "Correct" : "Review and try again"}
              </h2>
              <p>
                Answer: <MathPrint text={run.feedback.answer} />
              </p>
              <ol>
                {run.feedback.steps.map((v, i) => (
                  <li key={i}>
                    <MathPrint text={v} />
                  </li>
                ))}
              </ol>
              <p>Desmos entries:</p>
              {run.feedback.inputs?.map((v, i) => (
                <code key={i}>{v}</code>
              ))}
              <p>
                <MathPrint text={run.feedback.evidence} />
              </p>
            </section>
          )}
        </>
      ) : (
        <>
          <nav className="mcTabs" aria-label="Practice views">
            {[
              ["library", "Skill library"],
              ["assigned", "Assignments"],
              ["due", `Review due (${due.length})`],
            ].map(([v, l]) => (
              <button
                key={v}
                aria-pressed={filter === v}
                onClick={() => setFilter(v)}
              >
                {l}
              </button>
            ))}
          </nav>
          {filter === "assigned" && (
            <div className="mcGrid">
              {data.assignments.map((a) => (
                <article key={a.id} className="mcCard">
                  <h2>{a.title}</h2>
                  <p>
                    {data.completed.includes(a.id)
                      ? "Completed · achievement preserved"
                      : "In progress"}
                  </p>
                  <p>
                    {a.skills
                      .map((s) => data.topics.find((t) => t.id === s)?.name)
                      .join(" · ")}
                  </p>
                </article>
              ))}
            </div>
          )}
          {filter === "due" && !due.length && (
            <p className="mcEmpty">
              You’re up to date. Keep practicing any skill below.
            </p>
          )}
          <div className="mcGrid">
            {visible.map((t) => {
              const m = data.mastery[t.id],
                isDue = due.some((s) => s.id === t.id);
              return (
                <article className="mcCard mcSkill" key={t.id}>
                  <div>
                    <div className="mcEyebrow">
                      {t.id.startsWith("repair:")
                        ? "Graph repair"
                        : t.bank === "qas"
                          ? "QAS practice"
                          : "Calculator skill"}
                    </div>
                    <h2>{t.name.replace(/^Repair · |^QAS · /, "")}</h2>
                    <p>
                      {m?.proficient_at
                        ? isDue
                          ? "Proficient · due for review"
                          : "Proficient · current"
                        : `Learning · level ${m?.level || 1}`}
                    </p>
                    {m?.proficient_at && (
                      <p className="mcMuted">
                        Review {new Date(m.review_at).toLocaleDateString()}
                      </p>
                    )}
                    <p className="mcMuted">
                      {data.settings.needed} of the last {data.settings.window}{" "}
                      top-level questions correct without hints.
                    </p>
                  </div>
                  <div className="mcRow">
                    <button disabled={busy} onClick={() => open(t, isDue)}>
                      {isDue ? "Review skill" : "Practice"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {data.teacher && (
            <details className="mcPanel">
              <summary>Teacher · assignments and mastery settings</summary>
              <label>
                Assignment title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="mcGrid">
                {data.topics
                  .filter((t) => t.bank === "desmos")
                  .map((t) => (
                    <label className="mcCheck" key={t.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(t.id)}
                        onChange={() =>
                          setSelected((s) =>
                            s.includes(t.id)
                              ? s.filter((v) => v !== t.id)
                              : [...s, t.id],
                          )
                        }
                      />
                      {t.name}
                    </label>
                  ))}
              </div>
              <button
                disabled={busy || !selected.length}
                onClick={() =>
                  perform(async () => {
                    await action({ action: "assign", title, skills: selected });
                    await load();
                    setStatus("Class assignment created.");
                  })
                }
              >
                Assign selected skills to this class
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  perform(async () => {
                    await action({
                      action: "settings",
                      settings: {
                        needed: Number(f.get("needed")),
                        window: Number(f.get("window")),
                        intervals: String(f.get("intervals"))
                          .split(",")
                          .map(Number),
                      },
                    });
                    await load();
                    setStatus("Mastery settings saved.");
                  });
                }}
              >
                <div className="mcRow">
                  <label>
                    Correct needed
                    <input
                      name="needed"
                      type="number"
                      defaultValue={data.settings.needed}
                      min="1"
                      max="12"
                    />
                  </label>
                  <label>
                    Recent window
                    <input
                      name="window"
                      type="number"
                      defaultValue={data.settings.window}
                      min="1"
                      max="12"
                    />
                  </label>
                  <label>
                    Review intervals (days)
                    <input
                      name="intervals"
                      defaultValue={data.settings.intervals.join(",")}
                    />
                  </label>
                  <button disabled={busy}>Save settings</button>
                </div>
              </form>
            </details>
          )}
          {data.teacher && (
            <details className="mcPanel">
              <summary>
                Class progress · {data.classProgress.length} students with saved
                practice
              </summary>
              <div className="mcTableWrap">
                <table className="mcTable">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Proficient skills</th>
                      <th>Review due</th>
                      <th>Completed assignments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classProgress.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          {
                            Object.values(s.mastery).filter(
                              (m) => m.proficient_at,
                            ).length
                          }
                        </td>
                        <td>
                          {
                            Object.values(s.mastery).filter(
                              (m) =>
                                m.review_at &&
                                Date.now() >= Date.parse(m.review_at),
                            ).length
                          }
                        </td>
                        <td>{s.completed.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
