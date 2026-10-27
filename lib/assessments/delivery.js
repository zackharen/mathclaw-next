import { randomUUID } from "node:crypto";
import {
  spiralLast,
  accessState,
  safeQuestion,
  adaptiveNext,
  adaptiveGrade,
  scoreQuestion,
  scorePercent,
  normalizedAnswer,
} from "./core";
import { assessmentVariation, makeQuestion } from "./bank";
import { result, fail, requireRow, cas } from "./server";

export function practiceQuestion(q, salt) {
  if (q.generator) {
    for (let i = 0; i < 12; i++) {
      const out = assessmentVariation(q, `${salt}:${i}`);
      if (out.prompt !== q.prompt) return out;
    }
    fail(
      "A fresh practice variation could not be generated. Choose another question.",
    );
  }
  if (q.practice && q.practice.prompt !== q.prompt)
    return { ...q, ...q.practice, id: q.id };
  fail(
    "Provide a fresh practice variation for every question before approval.",
  );
}
export function attemptReleased(a, c) {
  return Boolean(
    c.released_at &&
    a?.submitted_at &&
    c.document.releasedAttempts?.[a.id] === a.revision,
  );
}

export function attemptView(a, c, teacher = false) {
  const doc = a.document,
    released = attemptReleased(a, c),
    adaptive = doc.mode !== "standard";
  const questions =
    teacher || !adaptive || released
      ? doc.questions
      : doc.questions.filter((q) => q.id === doc.current_id);
  const out = {
    id: a.id,
    user_id: teacher ? a.user_id : undefined,
    revision: a.revision,
    assignmentRevision: c.revision,
    started_at: a.started_at,
    submitted_at: a.submitted_at,
    state: accessState(c, a, c.document.grants?.[a.user_id]),
    mode: doc.mode,
    questions: teacher ? questions : questions.map(safeQuestion),
    work:
      teacher || !adaptive || released
        ? doc.work
        : { [doc.current_id]: doc.work?.[doc.current_id] },
    current_id: doc.current_id,
    finished: doc.finished,
    score: teacher || released ? a.score : null,
    deadline: deadline(c, a),
    released,
  };
  if (teacher || released)
    Object.assign(out, {
      marks: doc.marks,
      feedback: doc.feedback,
      gradeHistory: doc.gradeHistory,
      questions: doc.questions,
    });
  return out;
}
function deadline(c, a) {
  const g = c.document.grants?.[a.user_id] || {},
    mins = Object.hasOwn(g, "time_minutes") ? g.time_minutes : c.time_minutes;
  return (
    [
      g.close_at || c.close_at,
      mins
        ? new Date(
            Date.parse(a.started_at) + (mins + (g.extra_minutes || 0)) * 60000,
          ).toISOString()
        : null,
    ]
      .filter(Boolean)
      .sort()[0] || null
  );
}
export function chosenQuestions(c, userId) {
  return spiralLast(c.document.questions, c.document.mode || "standard").map(
    (q) => {
      if (!(c.document.grants?.[userId]?.variants ?? c.document.variants))
        return structuredClone(q);
      if (q.generator) return assessmentVariation(q, `${c.id}:${userId}`);
      const variants = q.variants || [];
      if (!variants.length)
        fail("Equivalent variants are missing for a question.");
      const index =
        [...userId].reduce((s, v) => s + v.charCodeAt(0), 0) % variants.length;
      return { ...q, ...variants[index], id: q.id };
    },
  );
}
export async function loadAssignment(ctx, id) {
  const c = requireRow(
    result(
      await ctx.admin
        .from("mc_assessment_classes")
        .select("*")
        .eq("id", id)
        .eq("course_id", ctx.course.id)
        .maybeSingle(),
    ),
  );
  if (
    !ctx.teacher &&
    (!c.approved_at ||
      (c.document.target_user && c.document.target_user !== ctx.user.id))
  )
    fail("Assessment not available.", 404);
  return c;
}
export async function startAttempt(ctx, c) {
  const all = result(
    await ctx.admin
      .from("mc_assessment_attempts")
      .select("*")
      .eq("assignment_id", c.id)
      .eq("user_id", ctx.user.id)
      .order("attempt_number", { ascending: false }),
  );
  const latest = all[0],
    max = c.document.grants?.[ctx.user.id]?.attempts || 1;
  if (latest && (!latest.submitted_at || latest.attempt_number >= max))
    return latest;
  if (accessState(c, null, c.document.grants?.[ctx.user.id]) !== "open")
    fail("Assessment is locked or closed.", 423);
  const mode = c.document.mode || "standard",
    pool = chosenQuestions(c, ctx.user.id);
  const skills = [...new Set(pool.map((q) => q.skill))];
  const first =
    mode === "standard" ? null : adaptiveNext([], skills, c.document.cap || 18);
  const questions =
    mode === "standard" ? pool : [adaptiveQuestion(pool, first, randomUUID())];
  const doc = {
    mode,
    pool,
    skills,
    questions,
    work: {},
    history: [],
    current_id: questions[0]?.id,
    marks: {},
    feedback: {},
  };
  const inserted = await ctx.admin
    .from("mc_assessment_attempts")
    .insert({
      assignment_id: c.id,
      user_id: ctx.user.id,
      attempt_number: (latest?.attempt_number || 0) + 1,
      document: doc,
    })
    .select()
    .single();
  if (inserted.error?.code === "23505")
    return requireRow(
      result(
        await ctx.admin
          .from("mc_assessment_attempts")
          .select("*")
          .eq("assignment_id", c.id)
          .eq("user_id", ctx.user.id)
          .eq("attempt_number", (latest?.attempt_number || 0) + 1)
          .single(),
      ),
    );
  return result(inserted);
}
function adaptiveQuestion(pool, next, salt) {
  const q = pool.find((q) => q.skill === next.skill);
  if (q.generator)
    return {
      ...assessmentVariation({ ...q, level: next.level }, salt),
      id: randomUUID(),
      level: next.level,
    };
  return { ...q, id: randomUUID(), level: next.level };
}
export function validateWork(work, questions) {
  if (!work || typeof work !== "object" || Array.isArray(work))
    fail("Invalid saved work.");
  const output = {};
  for (const [id, value] of Object.entries(work)) {
    if (!questions.some((q) => q.id === id)) fail("Unknown question.");
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value.answer ?? "") !== "string" ||
      typeof (value.typed ?? "") !== "string" ||
      String(value.answer || "").length > 16000 ||
      String(value.typed || "").length > 32000
    )
      fail("Invalid response.");
    output[id] = {
      answer: value.answer || "",
      typed: value.typed || "",
      graph: value.graph || null,
      choice: value.choice || null,
    };
  }
  if (JSON.stringify(output).length > 1000000)
    fail("Saved graph work is too large.");
  return output;
}
export function gradeDocument(doc) {
  const marks = { ...doc.marks };
  for (const q of doc.questions)
    if (marks[q.id] === undefined)
      marks[q.id] = scoreQuestion(q, doc.work[q.id]);
  return { ...doc, marks };
}
export async function saveAttempt(ctx, c, a, input) {
  if (a.user_id !== ctx.user.id) fail("Attempt access denied.", 403);
  if (input.revision !== a.revision)
    fail("Work changed in another window. Reload to resume safely.", 409);
  let doc = { ...a.document },
    questions =
      doc.mode === "standard"
        ? doc.questions
        : doc.questions.filter((q) => q.id === doc.current_id);
  const work = validateWork(input.work, questions);
  doc.work = { ...doc.work, ...work };
  if (doc.mode !== "standard" && input.advance) {
    if (doc.finished) fail("All questions are complete.");
    const current = doc.questions.find((q) => q.id === doc.current_id);
    const mark = scoreQuestion(current, doc.work[current.id]);
    if (mark === null)
      fail("Adaptive questions require a verified automatic scoring rule.");
    doc.history = [
      ...doc.history,
      {
        questionId: current.id,
        skill: current.skill,
        level: current.level,
        correct: mark === current.points,
      },
    ];
    doc.marks = { ...doc.marks, [current.id]: mark };
    const next = adaptiveNext(doc.history, doc.skills, c.document.cap || 18);
    if (next) {
      const question = adaptiveQuestion(doc.pool, next, randomUUID());
      doc.questions = [...doc.questions, question];
      doc.current_id = question.id;
    } else {
      doc.finished = true;
      doc.current_id = null;
      doc.proposedGrade = adaptiveGrade(doc.history, doc.skills);
    }
  }
  if (input.submit && doc.mode !== "standard" && !doc.finished)
    fail("Complete the adaptive sequence before submitting.");
  if (input.submit) doc = gradeDocument(doc);
  const saved = result(
    await ctx.admin.rpc("mc_save_attempt", {
      p_id: a.id,
      p_revision: a.revision,
      p_assignment_revision: c.revision,
      p_document: doc,
      p_submit: Boolean(input.submit),
    }),
  );
  if (input.submit) {
    const score =
      doc.mode === "standard"
        ? scorePercent(doc.questions, doc.marks)
        : doc.proposedGrade?.score;
    return cas(ctx.admin, "mc_assessment_attempts", saved, { score });
  }
  return saved;
}
export function matchingAttempts(attempts, qid, answer, prompt) {
  return attempts.filter(
    (a) =>
      a.submitted_at &&
      a.document.questions.some((q) => q.id === qid && q.prompt === prompt) &&
      normalizedAnswer(a.document.work[qid]?.answer) ===
        normalizedAnswer(answer),
  );
}
export async function teacherGrade(ctx, c, a, input) {
  if (!a.submitted_at)
    fail("Submit or teacher-submit saved work before grading.");
  if (input.revision !== a.revision)
    fail("This grade changed. Reload before saving.", 409);
  const doc = structuredClone(a.document),
    marks = { ...doc.marks, ...input.marks };
  for (const q of doc.questions)
    if (
      !Number.isFinite(marks[q.id]) ||
      marks[q.id] < 0 ||
      marks[q.id] > q.points
    )
      fail("Enter each score within the question's point limit.");
  const proposed = reviewedScore(doc, marks);
  const score =
    input.override === null || input.override === undefined
      ? proposed
      : Number(input.override);
  if (!Number.isFinite(score) || score < 0 || score > 100)
    fail("Enter a score from 0 to 100.");
  doc.gradeHistory = [
    ...(doc.gradeHistory || []),
    {
      at: new Date().toISOString(),
      score: a.score,
      marks: doc.marks,
      feedback: doc.feedback,
      by: ctx.user.id,
    },
  ];
  doc.marks = marks;
  doc.feedback = input.feedback || {};
  doc.teacherNote = String(input.note || "").slice(0, 4000);
  // A revised grade needs a fresh teacher release for the class.
  await cas(ctx.admin, "mc_assessment_classes", c, { released_at: null });
  return cas(ctx.admin, "mc_assessment_attempts", a, { document: doc, score });
}

export function reviewedScore(doc, marks) {
  const evidence = (doc.history || []).map((h, i) => {
    const q =
      doc.questions.find((q) => q.id === h.questionId) || doc.questions[i];
    return {
      ...h,
      credit:
        q && Number.isFinite(marks[q.id]) ? marks[q.id] / q.points : undefined,
    };
  });
  return doc.mode === "standard"
    ? scorePercent(doc.questions, marks)
    : adaptiveGrade(evidence, doc.skills).score;
}
