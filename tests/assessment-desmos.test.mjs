import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  eligibleCourse,
  ZACK_ID,
  lessonSetKey,
  coverageSnapshot,
  safeQuestion,
  scoreQuestion,
  scorePercent,
  accessState,
  advanceMastery,
  addReviewDays,
  adaptiveNext,
  adaptiveGrade,
  anonymousStats,
  validateDraft,
} from "../lib/assessments/core.js";
import { makeQuestion, topicCatalog } from "../lib/assessments/bank.js";
import {
  choiceExpressions,
  relation,
} from "../lib/assessments/graph-choices.js";

test("scope excludes ECC, archived classes and other owners", () => {
  assert.equal(
    eligibleCourse({
      owner_id: ZACK_ID,
      title: "12B",
      pacing_mode: "two_lessons_per_day",
    }),
    true,
  );
  for (const patch of [
    { owner_id: "other" },
    { title: "ECC | Stats" },
    { archived_at: "2026-01-01" },
    { pacing_mode: "fixed_dates" },
  ])
    assert.equal(eligibleCourse({ owner_id: ZACK_ID, ...patch }), false);
});
test("grouping uses exact library and stable lesson IDs rather than overlapping codes", () => {
  const a = { library_id: "calc", id: "chain1" },
    b = { library_id: "calc", id: "chain2" };
  assert.equal(lessonSetKey([a, b]), lessonSetKey([b, a, a]));
  assert.notEqual(lessonSetKey([a]), lessonSetKey([a, b]));
  assert.notEqual(
    lessonSetKey([a]),
    lessonSetKey([{ ...a, library_id: "other" }]),
  );
  assert.notEqual(
    coverageSnapshot([
      { class_date: "2026-10-27", lesson_slot: 1, lesson_id: "x" },
    ]),
    coverageSnapshot([
      { class_date: "2026-10-28", lesson_slot: 1, lesson_id: "x" },
    ]),
  );
});
test("public question projection strips answer keys and generator seeds recursively", () => {
  const q = makeQuestion("systems", 4, 88, 1),
    view = safeQuestion(q);
  for (const key of [
    "answer",
    "solution",
    "seed",
    "inputs",
    "steps",
    "hint",
    "model",
    "generator",
  ])
    assert.equal(view[key], undefined);
  assert.ok(view.choices.every((c) => Object.keys(c).join() === "text"));
  assert.equal(scoreQuestion(q, { answer: q.answer }), 3);
  assert.equal(
    scoreQuestion({ ...q, manual: true }, { answer: q.answer }),
    null,
  );
  assert.equal(scorePercent([q], { [q.id]: 1.5 }), 50);
});
test("timers continue away and closing freezes without submission", () => {
  const c = { approved_at: "2026-01-01", is_open: true, time_minutes: 30 };
  const a = { started_at: "2026-10-26T12:00:00Z" };
  assert.equal(
    accessState(c, a, {}, Date.parse("2026-10-26T12:29:59Z")),
    "open",
  );
  assert.equal(
    accessState(c, a, {}, Date.parse("2026-10-26T12:30:00Z")),
    "frozen",
  );
  assert.equal(a.submitted_at, undefined);
  assert.equal(
    accessState(
      c,
      a,
      { extra_minutes: 15 },
      Date.parse("2026-10-26T12:35:00Z"),
    ),
    "open",
  );
  assert.equal(
    accessState(
      { ...c, is_open: false },
      a,
      {},
      Date.parse("2026-10-26T12:01:00Z"),
    ),
    "locked",
  );
  assert.equal(
    accessState(
      { ...c, close_at: "2026-10-26T12:10:00Z" },
      a,
      {},
      Date.parse("2026-10-26T12:11:00Z"),
    ),
    "frozen",
  );
  assert.equal(
    accessState(
      { ...c, is_open: false, open_at: "2026-10-26T12:00:00Z" },
      null,
      {},
      Date.parse("2026-10-26T11:59:00Z"),
    ),
    "locked",
  );
});
test("hints cannot earn mastery; failed review preserves achievement and due date", () => {
  let state = { level: 5 };
  for (let i = 0; i < 4; i++)
    state = advanceMastery(state, {
      level: 5,
      correct: true,
      hinted: true,
      at: "2026-10-26T12:00:00Z",
    });
  assert.equal(state.proficient_at, undefined);
  for (let i = 0; i < 4; i++)
    state = advanceMastery(state, {
      level: 5,
      correct: true,
      hinted: false,
      at: "2026-10-26T12:00:00Z",
    });
  assert.ok(state.proficient_at);
  const due = state.review_at,
    achievement = state.proficient_at;
  const fail = advanceMastery(state, {
    level: 5,
    correct: false,
    hinted: false,
    at: "2026-11-03T12:00:00Z",
  });
  assert.equal(fail.review_at, due);
  assert.equal(fail.proficient_at, achievement);
  const hinted = advanceMastery(state, {
    level: 5,
    correct: true,
    hinted: true,
    at: "2026-11-03T12:00:00Z",
  });
  assert.equal(hinted.review_at, due);
  const pass = advanceMastery(state, {
    level: 5,
    correct: true,
    hinted: false,
    at: "2026-11-03T12:00:00Z",
  });
  assert.equal(pass.interval, 1);
  assert.equal(pass.review_at, "2026-11-17T12:00:00.000Z");
});
test("review uses Eastern calendar days across fall and spring DST", () => {
  assert.equal(
    addReviewDays("2026-10-26T12:00:00Z", 7),
    "2026-11-02T13:00:00.000Z",
  );
  assert.equal(
    addReviewDays("2026-03-02T13:00:00Z", 7),
    "2026-03-09T12:00:00.000Z",
  );
});
test("adaptive balances skills, has enough-evidence stop and never fabricates untested mastery", () => {
  assert.deepEqual(adaptiveNext([], ["a", "b"]), { skill: "a", level: 2 });
  const h = [{ skill: "a", level: 2, correct: true }];
  assert.deepEqual(adaptiveNext(h, ["a", "b"]), { skill: "b", level: 2 });
  assert.equal(adaptiveGrade(h, ["a", "b"]).score, null);
  assert.equal(
    adaptiveNext(
      Array.from({ length: 18 }, () => ({
        skill: "a",
        level: 1,
        correct: false,
      })),
      ["a", "b"],
      18,
    ),
    null,
  );
  assert.equal(
    adaptiveGrade(
      [
        { skill: "a", level: 1, correct: true },
        { skill: "a", level: 5, correct: false },
      ],
      ["a"],
    ).score,
    26,
  );
});
test("statistics suppress small cohorts and never return individual arrays", () => {
  assert.equal(anonymousStats([100, 0], 100).suppressed, true);
  const s = anonymousStats([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50);
  assert.equal(s.mean, 50);
  assert.equal(s.median, 50);
  assert.equal(s.distribution.filter((b) => b.self).length, 1);
  assert.equal(s.values, undefined);
});
test("approval enforces exactly one spiral and reviewed adaptive grading", () => {
  const q = makeQuestion("linear", 2, 12, 0);
  assert.throws(() =>
    validateDraft({ title: "Test", mode: "standard", questions: [q] }),
  );
  assert.doesNotThrow(() =>
    validateDraft({
      title: "Test",
      mode: "standard",
      questions: [{ ...q, spiral: true }],
    }),
  );
  assert.throws(() =>
    validateDraft({ title: "Test", mode: "adaptive", questions: [q] }),
  );
});
test("all 23 topics and 10 repairs preserved; every reference generator has one valid key across difficulty and seeds", () => {
  const topics = topicCatalog();
  assert.equal(
    topics.filter((t) => t.bank === "desmos" && !t.id.startsWith("repair:"))
      .length,
    23,
  );
  assert.equal(topics.filter((t) => t.id.startsWith("repair:")).length, 10);
  for (const t of topics)
    for (let level = 1; level <= 5; level++)
      for (let seed = 1; seed <= 12; seed++) {
        const q = makeQuestion(t.id, level, seed, seed % 4);
        assert.equal(
          q.choices.filter((c) => c.correct).length,
          1,
          `${t.id} ${level}`,
        );
        assert.equal(q.choices.length, 4);
        assert.equal(new Set(q.choices.map((c) => c.text)).size, 4);
        assert.equal(q.choices.find((c) => c.correct).text, q.answer);
      }
});
test("inequality choices preserve entered boundaries, strictness, colors and four alternative regions", () => {
  const expressions = [
    { id: "a", latex: "y\\ge 2x-3", color: "#c74440" },
    { id: "b", latex: "y<-x+6", color: "#2d70b3" },
  ];
  const choices = choiceExpressions(expressions);
  assert.equal(choices.length, 4);
  assert.equal(choices[0][0].color, "#c74440");
  assert.equal(choices[0][1].lineStyle, "DASHED");
  assert.equal(new Set(choices.map((c) => c.at(-1).latex)).size, 4);
  assert.match(choices[1].at(-1).latex, /ge/);
  assert.equal(relation({ latex: "y>2x\\left\\{x>0\\right\\}" }), null);
});
test("migration denies direct browser access to private keys, grades and mastery writes", () => {
  const sql = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261026234033_assessment_desmos.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public.%I from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public.mc_save_attempt/);
  assert.match(sql, /for update/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /a.revision<>p_revision/);
});

test("original selected-response counterparts have one valid key and deterministic equivalent variants", async () => {
  const { WEEKLY_SKILLS } = await import("../lib/assessments/weekly-bank.js");
  for (const skill of WEEKLY_SKILLS)
    for (let level = 1; level <= 5; level++)
      for (let seed = 1; seed <= 30; seed++) {
        const q = makeQuestion(`weekly-mc:${skill}`, level, seed, seed % 4);
        assert.equal(q.manual, false);
        assert.equal(q.choices.filter((c) => c.correct).length, 1);
        assert.equal(new Set(q.choices.map((c) => c.text)).size, 4);
        assert.equal(q.choices.find((c) => c.correct).text, q.answer);
        assert.deepEqual(
          q,
          makeQuestion(`weekly-mc:${skill}`, level, seed, seed % 4),
        );
      }
});

test("statistics count one latest submitted result per student", async () => {
  const { latestSubmittedScores } = await import("../lib/assessments/core.js");
  const scores = latestSubmittedScores([
    { user_id: "a", attempt_number: 1, submitted_at: "now", score: 50 },
    { user_id: "a", attempt_number: 2, submitted_at: "later", score: 70 },
    { user_id: "b", attempt_number: 1, submitted_at: "now", score: 80 },
  ]);
  assert.deepEqual(scores, [70, 80]);
});

test("future drafting uses only curated mapped content and preserves drift warnings", async () => {
  const { curatedDraft, draftDrift } =
    await import("../lib/assessments/drafting.js");
  const lesson = { id: "l1", source_lesson_code: "1.1", title: "Lesson" };
  const q = {
    id: "q",
    skill: "linear",
    prompt: "Solve",
    points: 3,
    lessonIds: ["l1"],
  };
  const out = curatedDraft(
    [lesson],
    [
      { id: "candidate", status: "candidate", document: q },
      {
        id: "curated",
        status: "curated",
        document: { ...q, prerequisite: true },
      },
    ],
  );
  assert.ok(out.questions.every((v) => v.libraryVersion === "curated"));
  assert.equal(out.questions.filter((v) => v.spiral).length, 1);
  const draft = {
    document: {
      coverageSnapshots: { c: "same" },
      coverage: {
        classes: [{ course_id: "c", entry: { date: "2026-10-30" } }],
      },
    },
  };
  assert.equal(
    draftDrift(draft, {
      course_id: "c",
      snapshot: "same",
      entry: { date: "2026-10-29" },
    }),
    true,
  );
});
