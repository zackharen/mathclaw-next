import {
  context,
  teacherOnly,
  result,
  fail,
  body,
  originCheck,
  responseError,
  json,
  requireRow,
} from "@/lib/assessments/server";
import {
  safeQuestion,
  advanceMastery,
  REVIEW_INTERVALS,
} from "@/lib/assessments/core";
import { topicCatalog, makeQuestion } from "@/lib/assessments/bank";
export const dynamic = "force-dynamic";
async function loadState(ctx) {
  let row = result(
    await ctx.admin
      .from("mc_learning_state")
      .select("*")
      .eq("user_id", ctx.user.id)
      .eq("course_id", ctx.course.id)
      .maybeSingle(),
  );
  if (!row) {
    const created = await ctx.admin
      .from("mc_learning_state")
      .insert({
        user_id: ctx.user.id,
        course_id: ctx.course.id,
        document: { mastery: {}, active: {}, completed: [], history: [] },
      })
      .select()
      .single();
    if (created.error?.code === "23505")
      row = result(
        await ctx.admin
          .from("mc_learning_state")
          .select("*")
          .eq("user_id", ctx.user.id)
          .eq("course_id", ctx.course.id)
          .single(),
      );
    else row = result(created);
  }
  return row;
}
async function writeState(ctx, row, document) {
  const out = result(
    await ctx.admin
      .from("mc_learning_state")
      .update({ document, revision: row.revision + 1 })
      .eq("user_id", ctx.user.id)
      .eq("course_id", ctx.course.id)
      .eq("revision", row.revision)
      .select()
      .maybeSingle(),
  );
  if (!out)
    fail("Practice changed in another window. Reload to continue.", 409);
  return out;
}
async function settings(ctx) {
  const teacher = result(
    await ctx.admin
      .from("mc_learning_state")
      .select("document")
      .eq("user_id", ctx.course.owner_id)
      .eq("course_id", ctx.course.id)
      .maybeSingle(),
  );
  return (
    teacher?.document?.settings || {
      needed: 3,
      window: 4,
      intervals: REVIEW_INTERVALS,
    }
  );
}
function activeView(run) {
  return {
    id: run.id,
    work_revision: run.work_revision || 0,
    question: safeQuestion(run.question),
    work: run.work || {},
    hinted: run.hinted,
    done: run.done,
    feedback: run.done ? run.feedback : undefined,
  };
}
export async function GET(request) {
  try {
    const url = new URL(request.url),
      ctx = await context(url.searchParams.get("course"));
    if (url.searchParams.has("calculator")) {
      const row = result(
        await ctx.admin
          .from("mc_learning_state")
          .select("document")
          .eq("user_id", ctx.course.owner_id)
          .eq("course_id", ctx.course.id)
          .maybeSingle(),
      );
      return json({
        apiKey:
          row?.document?.calculatorApiKey ||
          process.env.NEXT_PUBLIC_DESMOS_API_KEY ||
          null,
      });
    }
    const [state, config, assignments] = await Promise.all([
      loadState(ctx),
      settings(ctx),
      ctx.admin
        .from("mc_desmos_assignments")
        .select("*")
        .eq("course_id", ctx.course.id)
        .order("created_at", { ascending: false })
        .then(result),
    ]);
    if (url.searchParams.has("skill")) {
      const run = state.document.active?.[url.searchParams.get("skill")];
      return json({
        run: run ? activeView(run) : null,
        revision: state.revision,
      });
    }
    let classProgress = [];
    if (ctx.teacher) {
      const rows = result(
        await ctx.admin
          .from("mc_learning_state")
          .select("user_id,document")
          .eq("course_id", ctx.course.id),
      );
      const ids = rows.map((r) => r.user_id);
      const profiles = ids.length
        ? result(
            await ctx.admin
              .from("profiles")
              .select("id,display_name")
              .in("id", ids),
          )
        : [];
      classProgress = rows
        .filter((r) => r.user_id !== ctx.user.id)
        .map((r) => ({
          id: r.user_id,
          name:
            profiles.find((p) => p.id === r.user_id)?.display_name || "Student",
          mastery: r.document.mastery || {},
          completed: r.document.completed || [],
        }));
    }
    return json({
      teacher: ctx.teacher,
      courses: ctx.courses,
      course: ctx.course,
      topics: topicCatalog(),
      assignments,
      settings: config,
      mastery: state.document.mastery || {},
      completed: state.document.completed || [],
      classProgress,
    });
  } catch (e) {
    return responseError(e);
  }
}
export async function POST(request) {
  try {
    originCheck(request);
    const d = await body(request),
      ctx = await context(d.course),
      catalog = topicCatalog();
    if (d.action === "assign") {
      teacherOnly(ctx);
      if (
        !Array.isArray(d.skills) ||
        !d.skills.length ||
        d.skills.some((s) => !catalog.some((t) => t.id === s))
      )
        fail("Choose valid skills.");
      return json(
        result(
          await ctx.admin
            .from("mc_desmos_assignments")
            .insert({
              course_id: ctx.course.id,
              owner_id: ctx.user.id,
              title: String(d.title || "Desmos mastery").slice(0, 200),
              skills: [...new Set(d.skills)],
            })
            .select()
            .single(),
        ),
      );
    }
    const row = await loadState(ctx),
      doc = structuredClone(row.document);
    doc.active ||= {};
    doc.mastery ||= {};
    doc.completed ||= [];
    doc.history ||= [];
    if (d.action === "settings") {
      teacherOnly(ctx);
      const s = d.settings;
      if (
        !s ||
        !Number.isInteger(s.needed) ||
        !Number.isInteger(s.window) ||
        s.needed < 1 ||
        s.needed > s.window ||
        s.window > 12 ||
        !Array.isArray(s.intervals) ||
        s.intervals.length !== 4 ||
        s.intervals.some(
          (n, i) =>
            !Number.isInteger(n) ||
            n < 1 ||
            n > 365 ||
            (i && n < s.intervals[i - 1]),
        )
      )
        fail(
          "Choose a valid mastery threshold and four increasing review intervals.",
        );
      doc.settings = s;
      return json(await writeState(ctx, row, doc));
    }
    if (!catalog.some((t) => t.id === d.skill)) fail("Unknown skill.");
    if (d.action === "start") {
      if (doc.active[d.skill] && !doc.active[d.skill].done)
        return json({
          run: activeView(doc.active[d.skill]),
          revision: row.revision,
        });
      const m = doc.mastery[d.skill] || {},
        due = m.review_at && Date.now() >= Date.parse(m.review_at);
      const q = makeQuestion(d.skill, due || d.review ? 5 : m.level || 1);
      q.criteria =
        "Choose the correct answer. Correct unhinted responses can count toward proficiency.";
      const run = {
        id: crypto.randomUUID(),
        question: q,
        hinted: false,
        work: {},
        started_at: new Date().toISOString(),
      };
      doc.active[d.skill] = run;
      const saved = await writeState(ctx, row, doc);
      return json({ run: activeView(run), revision: saved.revision });
    }
    const run = requireRow(doc.active[d.skill]);
    if (run.id !== d.run_id)
      fail("This practice question has changed. Reload.", 409);
    if (d.action === "hint") {
      if (!run.done) {
        run.hinted = true;
        await writeState(ctx, row, doc);
      }
      return json({ hint: run.question.hint, hinted: true });
    }
    if (d.action === "save") {
      if (run.done) fail("This response was already checked.", 409);
      if (
        typeof d.work?.answer !== "string" ||
        String(d.work.typed || "").length > 32000 ||
        JSON.stringify(d.work).length > 500000
      )
        fail("Invalid saved work.");
      if ((d.work_revision ?? 0) !== (run.work_revision || 0))
        fail(
          "Saved work changed in another window. Reload before continuing.",
          409,
        );
      run.work_revision = (run.work_revision || 0) + 1;
      run.work = {
        answer: d.work.answer,
        typed: String(d.work.typed || ""),
        graph: d.work.graph || null,
      };
      const saved = await writeState(ctx, row, doc);
      return json({
        revision: saved.revision,
        work_revision: run.work_revision,
      });
    }
    if (d.action === "check") {
      if (run.done)
        return json({ run: activeView(run), mastery: doc.mastery[d.skill] });
      if ((d.work_revision ?? 0) !== (run.work_revision || 0))
        fail("Saved work changed. Reload before checking.", 409);
      const answer = String(d.answer ?? run.work.answer ?? "");
      if (!run.question.choices.some((c) => c.text === answer))
        fail("Choose an answer first.");
      run.work = { ...run.work, answer };
      run.done = true;
      run.feedback = {
        correct: answer === run.question.answer,
        answer: run.question.answer,
        steps: run.question.steps,
        inputs: run.question.inputs,
        hinted: run.hinted,
        evidence:
          "Correct unhinted answers count. Calculator state is saved for review; it is not proof of independent reasoning.",
      };
      const event = {
        correct: run.feedback.correct,
        hinted: run.hinted,
        level: run.question.level,
        at: new Date().toISOString(),
      };
      doc.mastery[d.skill] = advanceMastery(
        doc.mastery[d.skill],
        event,
        await settings(ctx),
      );
      doc.history = [
        ...doc.history,
        { id: run.id, skill: d.skill, ...event },
      ].slice(-500);
      const assignments = result(
        await ctx.admin
          .from("mc_desmos_assignments")
          .select("id,skills")
          .eq("course_id", ctx.course.id),
      );
      for (const a of assignments)
        if (
          a.skills.every((s) => doc.mastery[s]?.proficient_at) &&
          !doc.completed.includes(a.id)
        )
          doc.completed.push(a.id);
      await writeState(ctx, row, doc);
      return json({ run: activeView(run), mastery: doc.mastery[d.skill] });
    }
    fail("Unknown action.");
  } catch (e) {
    return responseError(e);
  }
}
