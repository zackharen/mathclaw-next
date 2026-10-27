import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { ZACK_ID, accessState } from "../lib/assessments/core.js";
import { makeQuestion } from "../lib/assessments/bank.js";
register("./helpers/assessment-loader.mjs", import.meta.url);
const endpoint = await import("../app/api/assessment/route.js"),
  desmos = await import("../app/api/desmos/route.js");

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.values = null;
    this.one = false;
  }
  select() {
    return this;
  }
  eq(k, v) {
    this.filters.push((x) => x[k] === v);
    return this;
  }
  in(k, vs) {
    this.filters.push((x) => vs.includes(x[k]));
    return this;
  }
  is(k, v) {
    this.filters.push((x) => (v === null ? x[k] == null : x[k] === v));
    return this;
  }
  not(k, op, v) {
    this.filters.push((x) => (v === null ? x[k] != null : x[k] !== v));
    return this;
  }
  order(k, o = {}) {
    this.sort = [k, o.ascending !== false];
    return this;
  }
  limit(n) {
    this.max = n;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  insert(values) {
    this.operation = "insert";
    this.values = values;
    return this;
  }
  update(values) {
    this.operation = "update";
    this.values = values;
    return this;
  }
  then(ok, bad) {
    return Promise.resolve()
      .then(() => {
        this.db[this.table] ||= [];
        let rows = this.db[this.table].filter((x) =>
          this.filters.every((f) => f(x)),
        );
        if (this.operation === "insert") {
          rows = (Array.isArray(this.values) ? this.values : [this.values]).map(
            (v) => ({
              id: crypto.randomUUID(),
              revision: 0,
              created_at: new Date().toISOString(),
              submitted_at: null,
              score: null,
              attempt_number: 1,
              started_at: new Date().toISOString(),
              ...structuredClone(v),
            }),
          );
          this.db[this.table].push(...rows);
        }
        if (this.operation === "update")
          rows.forEach((x) => Object.assign(x, structuredClone(this.values)));
        if (this.sort)
          rows.sort(
            (a, b) =>
              String(a[this.sort[0]]).localeCompare(String(b[this.sort[0]])) *
              (this.sort[1] ? 1 : -1),
          );
        if (this.max) rows = rows.slice(0, this.max);
        return {
          data: structuredClone(this.one ? rows[0] || null : rows),
          error: null,
        };
      })
      .then(ok, bad);
  }
}
function fixture() {
  const db = {
    courses: [
      {
        id: "class-a",
        owner_id: ZACK_ID,
        title: "Daytime A",
        pacing_mode: "one_lesson_per_day",
        archived_at: null,
      },
      {
        id: "class-b",
        owner_id: ZACK_ID,
        title: "Daytime B",
        pacing_mode: "one_lesson_per_day",
        archived_at: null,
      },
      {
        id: "ecc",
        owner_id: ZACK_ID,
        title: "ECC",
        pacing_mode: "fixed_dates",
        archived_at: null,
      },
    ],
    student_course_memberships: [
      { course_id: "class-a", profile_id: "student" },
      { course_id: "class-b", profile_id: "other-student" },
    ],
    profiles: [
      { id: "student", display_name: "Student" },
      { id: "other-student", display_name: "Other student" },
    ],
  };
  const admin = {
    from: (t) => new Query(db, t),
    rpc: async (name, p) => {
      const a = db.mc_assessment_attempts.find((a) => a.id === p.p_id),
        c = db.mc_assessment_classes.find((c) => c.id === a.assignment_id);
      if (a.revision !== p.p_revision || c.revision !== p.p_assignment_revision)
        return { error: { message: "Work changed" } };
      if (accessState(c, a, c.document.grants?.[a.user_id]) !== "open")
        return { error: { message: "Work locked or frozen" } };
      a.document = structuredClone(p.p_document);
      a.revision++;
      if (p.p_submit) a.submitted_at = new Date().toISOString();
      return { data: structuredClone(a) };
    },
  };
  globalThis.__mcFixture = { db, admin, user: { id: ZACK_ID } };
  return db;
}
async function post(data, who = ZACK_ID, api = endpoint) {
  globalThis.__mcFixture.user = { id: who };
  const response = await api.POST(
    new Request("http://localhost/api/assessment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ course: "class-a", ...data }),
    }),
  );
  return { status: response.status, data: await response.json() };
}
async function get(query = "", who = ZACK_ID, api = endpoint) {
  globalThis.__mcFixture.user = who ? { id: who } : null;
  const response = await api.GET(
    new Request(`http://localhost/api/assessment?course=class-a${query}`),
  );
  return { status: response.status, data: await response.json() };
}
async function approvedDraft(q, mode = "standard") {
  let out = await post({ action: "create", title: "API assessment" });
  const draft = out.data;
  out = await post({
    action: "edit",
    id: draft.id,
    revision: 0,
    document: {
      mode,
      questions: [q],
      grading_reviewed_at:
        mode === "standard" ? null : new Date().toISOString(),
    },
    title: "API assessment",
  });
  assert.equal(out.status, 200);
  const c = globalThis.__mcFixture.db.mc_assessment_classes[0];
  out = await post({ action: "approve", id: c.id });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  return c;
}

test("actual route handlers enforce teacher, student and outsider boundaries without production mutations", async () => {
  const db = fixture();
  assert.equal((await get("", null)).status, 401);
  assert.equal((await get("", "outsider")).status, 403);
  assert.equal((await post({ action: "create" }, "student")).status, 403);
  assert.equal((await get("&draft=secret", "student")).status, 403);
  assert.equal((await post({ action: "create", course: "ecc" })).status, 403);
  let out = await post({ action: "create", title: "Private" });
  assert.equal(out.status, 200);
  assert.equal((await get("", "student")).data.assignments.length, 0);
  assert.equal(db.mc_assessment_classes[0].approved_at, undefined);
});
test("standard assessment: approval opens fresh practice, access stays locked, trusted scoring and release gate work", async () => {
  const db = fixture(),
    q = { ...makeQuestion("linear", 3, 55, 1), spiral: true };
  const c = await approvedDraft(q);
  assert.equal(c.is_open, false);
  assert.equal(
    (await post({ action: "start", id: c.id }, "student")).status,
    423,
  );
  const practice = await post(
    { action: "practice", id: c.id, fresh: true },
    "student",
  );
  assert.equal(practice.status, 200);
  assert.notEqual(practice.data.question.prompt, q.prompt);
  assert.equal(practice.data.question.answer, undefined);
  await post({ action: "access", id: c.id, is_open: true, time_minutes: null });
  let a = (await post({ action: "start", id: c.id }, "student")).data;
  assert.equal(a.questions[0].answer, undefined);
  const id = a.id;
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: id,
        revision: a.revision,
        work: { [q.id]: { answer: q.answer, typed: "Saved work" } },
      },
      "student",
    )
  ).data;
  assert.equal(
    (
      await post(
        { action: "save", id: c.id, attempt_id: id, revision: 0, work: {} },
        "student",
      )
    ).status,
    409,
  );
  assert.equal(
    (await post({ action: "start", id: c.id }, "student")).data.work[q.id]
      .typed,
    "Saved work",
  );
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: id,
        revision: a.revision,
        work: { [q.id]: { answer: q.answer, typed: "Saved work" } },
        submit: true,
        score: 0,
      },
      "student",
    )
  ).data;
  assert.equal(a.score, null);
  assert.equal(db.mc_assessment_attempts[0].score, 100);
  assert.equal(
    (
      await post(
        {
          action: "save",
          id: c.id,
          attempt_id: id,
          revision: a.revision,
          work: {},
        },
        "student",
      )
    ).status,
    409,
  );
  assert.equal((await get(`&id=${c.id}`, "other-student")).status, 403);
  const teacher = (await get(`&id=${c.id}`)).data.attempts[0];
  assert.equal(
    (
      await post({
        action: "grade",
        id: c.id,
        attempt_id: id,
        revision: teacher.revision,
        marks: { [q.id]: 1.5 },
        feedback: { [q.id]: "Partial credit" },
      })
    ).status,
    200,
  );
  await post({ action: "release", id: c.id, release: true });
  {
    const released = (await get(`&id=${c.id}`, "student")).data;
    assert.equal(released.attempt.score, 50);
    assert.equal(released.stats.suppressed, true);
    assert.equal(released.attempt.questions[0].answer, q.answer);
  }
});
test("manual keys are never fabricated as automatic grades, and release waits for review", async () => {
  fixture();
  const q = { ...makeQuestion("weekly:corner", 3, 26, 0), spiral: true };
  const c = await approvedDraft(q);
  await post({ action: "access", id: c.id, is_open: true, time_minutes: null });
  let a = (await post({ action: "start", id: c.id }, "student")).data;
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: a.id,
        revision: a.revision,
        work: { [q.id]: { answer: "My proof", typed: "Reasoning" } },
        submit: true,
      },
      "student",
    )
  ).data;
  assert.equal(a.score, null);
  assert.equal(
    (await post({ action: "release", id: c.id, release: true })).status,
    400,
  );
});
test("adaptive server rejects backtracking, hides intermediate scoring, stops at cap", async () => {
  const db = fixture();
  const q = { ...makeQuestion("linear", 2, 45, 0), spiral: false };
  const c = await approvedDraft(q, "adaptive");
  c.document.cap = 2;
  await post({ action: "access", id: c.id, is_open: true, time_minutes: null });
  let a = (await post({ action: "start", id: c.id }, "student")).data;
  const first = a.current_id;
  const key = db.mc_assessment_attempts[0].document.questions[0].answer;
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: a.id,
        revision: a.revision,
        work: { [first]: { answer: key } },
        advance: true,
      },
      "student",
    )
  ).data;
  assert.equal(a.questions.length, 1);
  assert.notEqual(a.current_id, first);
  assert.equal(a.marks, undefined);
  assert.equal(
    (
      await post(
        {
          action: "save",
          id: c.id,
          attempt_id: a.id,
          revision: a.revision,
          work: { [first]: { answer: key } },
        },
        "student",
      )
    ).status,
    400,
  );
  const current = a.current_id;
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: a.id,
        revision: a.revision,
        work: { [current]: { answer: "wrong" } },
        advance: true,
      },
      "student",
    )
  ).data;
  assert.equal(a.finished, true);
  assert.equal(a.questions.length, 0);
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: a.id,
        revision: a.revision,
        work: {},
        submit: true,
      },
      "student",
    )
  ).data;
  assert.ok(a.submitted_at);
  assert.equal(a.score, null);
});
test("hint persistence, idempotent checking, top-level mastery, due review and assignment completion persist together", async () => {
  const db = fixture();
  let assigned = await post(
    { action: "assign", skills: ["linear"], title: "Practice" },
    ZACK_ID,
    desmos,
  );
  assert.equal(assigned.status, 200);
  for (let n = 0; n < 9; n++) {
    let out = await post(
      { action: "start", skill: "linear" },
      "student",
      desmos,
    );
    assert.equal(out.status, 200, JSON.stringify(out.data));
    const run = out.data.run;
    if (n === 0) {
      await post(
        { action: "hint", skill: "linear", run_id: run.id },
        "student",
        desmos,
      );
      assert.equal(
        (await post({ action: "start", skill: "linear" }, "student", desmos))
          .data.run.hinted,
        true,
      );
    }
    const state = db.mc_learning_state.find((s) => s.user_id === "student"),
      raw = state.document.active.linear.question;
    out = await post(
      {
        action: "check",
        skill: "linear",
        run_id: run.id,
        answer: raw.answer,
        correct: true,
      },
      "student",
      desmos,
    );
    assert.equal(out.status, 200);
    const count = state.document.history.length;
    await post(
      { action: "check", skill: "linear", run_id: run.id, answer: raw.answer },
      "student",
      desmos,
    );
    assert.equal(state.document.history.length, count);
  }
  const state = db.mc_learning_state.find((s) => s.user_id === "student");
  assert.ok(state.document.mastery.linear.proficient_at);
  assert.ok(state.document.completed.includes(assigned.data.id));
  const original = state.document.mastery.linear.proficient_at;
  state.document.mastery.linear.review_at = "2020-01-01T00:00:00Z";
  let run = (
    await post({ action: "start", skill: "linear" }, "student", desmos)
  ).data.run;
  assert.equal(run.question.level, 5);
  await post(
    { action: "hint", skill: "linear", run_id: run.id },
    "student",
    desmos,
  );
  const raw = state.document.active.linear.question;
  await post(
    { action: "check", skill: "linear", run_id: run.id, answer: raw.answer },
    "student",
    desmos,
  );
  assert.equal(state.document.mastery.linear.review_at, "2020-01-01T00:00:00Z");
  assert.equal(state.document.mastery.linear.proficient_at, original);
  assert.ok(state.document.completed.includes(assigned.data.id));
});

test("release snapshots exclude new retakes and later unreviewed submissions", async () => {
  const db = fixture(),
    q = { ...makeQuestion("linear", 2, 41, 0), spiral: true };
  const c = await approvedDraft(q);
  await post({ action: "access", id: c.id, is_open: true, time_minutes: null });
  let a = (await post({ action: "start", id: c.id }, "student")).data;
  a = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: a.id,
        revision: a.revision,
        work: { [q.id]: { answer: q.answer } },
        submit: true,
      },
      "student",
    )
  ).data;
  await post({ action: "release", id: c.id, release: true });
  assert.equal(
    (await get(`&id=${c.id}`, "student")).data.attempt.released,
    true,
  );
  await post({
    action: "grant",
    id: c.id,
    student: "student",
    grant: { is_open: true, attempts: 2 },
  });
  const fresh = (await post({ action: "start", id: c.id }, "student")).data;
  assert.equal(fresh.released, false);
  assert.equal(fresh.questions[0].answer, undefined);
  assert.equal((await get(`&id=${c.id}`, "student")).data.stats, null);
  const done = (
    await post(
      {
        action: "save",
        id: c.id,
        attempt_id: fresh.id,
        revision: fresh.revision,
        work: { [q.id]: { answer: q.answer } },
        submit: true,
      },
      "student",
    )
  ).data;
  assert.equal(done.released, false);
  assert.equal(done.score, null);
  assert.equal(db.mc_assessment_attempts.length, 2);
});

test("Desmos rejects stale work revisions without clearing persisted hint use", async () => {
  const db = fixture();
  const opened = (
    await post({ action: "start", skill: "linear" }, "student", desmos)
  ).data.run;
  let saved = await post(
    {
      action: "save",
      skill: "linear",
      run_id: opened.id,
      work_revision: 0,
      work: { answer: "", typed: "First tab" },
    },
    "student",
    desmos,
  );
  assert.equal(saved.status, 200);
  await post(
    { action: "hint", skill: "linear", run_id: opened.id },
    "student",
    desmos,
  );
  const stale = await post(
    {
      action: "save",
      skill: "linear",
      run_id: opened.id,
      work_revision: 0,
      work: { answer: "", typed: "Old tab" },
    },
    "student",
    desmos,
  );
  assert.equal(stale.status, 409);
  const state = db.mc_learning_state.find((r) => r.user_id === "student");
  assert.equal(state.document.active.linear.work.typed, "First tab");
  assert.equal(state.document.active.linear.hinted, true);
});
