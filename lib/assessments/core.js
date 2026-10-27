// These helpers contain no keys, database clients, or question solutions.
export const ZACK_ID = "1fd7cb6e-265a-431e-831d-8f9fada5d5dd";
export const REVIEW_INTERVALS = [7, 14, 30, 60];
export function eligibleCourse(course) {
  return Boolean(
    course &&
    course.owner_id === ZACK_ID &&
    !course.archived_at &&
    course.pacing_mode !== "fixed_dates" &&
    !/\bECC\b/i.test(`${course.title} ${course.class_name}`),
  );
}
export function lessonSetKey(lessons) {
  return [...new Set(lessons.map((l) => `${l.library_id}:${l.id}`))]
    .sort()
    .join("|");
}
export function coverageSnapshot(rows) {
  return JSON.stringify(
    rows
      .map((r) => [r.class_date, r.lesson_slot, r.lesson_id])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
export function safeQuestion(q) {
  return Object.fromEntries(
    [
      "id",
      "skill",
      "name",
      "prompt",
      "visual",
      "points",
      "criteria",
      "desmos",
      "supports",
      "spiral",
      "level",
      "kind",
      "repair",
      "graphGroup",
      "graphChoices",
    ]
      .filter((k) => q[k] !== undefined)
      .map((k) => [k, q[k]])
      .concat(
        q.choices
          ? [["choices", q.choices.map((c) => ({ text: c.text }))]]
          : [],
      ),
  );
}
export function normalizedAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}
export function scoreQuestion(q, answer) {
  if (q.manual || !q.answer) return null;
  return normalizedAnswer(answer?.answer) === normalizedAnswer(q.answer)
    ? q.points
    : 0;
}
export function scorePercent(questions, marks) {
  if (questions.some((q) => !Number.isFinite(marks[q.id]))) return null;
  return (
    Math.round(
      (10000 * questions.reduce((s, q) => s + marks[q.id], 0)) /
        questions.reduce((s, q) => s + q.points, 0),
    ) / 100
  );
}
export function accessState(assignment, attempt, grant = {}, now = Date.now()) {
  if (attempt?.submitted_at) return "submitted";
  const open = grant.open_at || assignment.open_at;
  const close = grant.close_at || assignment.close_at;
  const manuallyOpen = grant.is_open ?? assignment.is_open;
  if (
    !assignment.approved_at ||
    !(manuallyOpen || (open && now >= Date.parse(open)))
  )
    return "locked";
  if (open && now < Date.parse(open)) return "locked";
  if (close && now >= Date.parse(close)) return "frozen";
  const limit = Object.hasOwn(grant, "time_minutes")
    ? grant.time_minutes
    : assignment.time_minutes;
  if (
    attempt?.started_at &&
    limit &&
    now >=
      Date.parse(attempt.started_at) +
        (limit + (grant.extra_minutes || 0)) * 60000
  )
    return "frozen";
  return "open";
}
export function addReviewDays(instant, days, timeZone = "America/New_York") {
  // Add calendar days at the same local hour; account for DST with an offset correction.
  const start = new Date(instant);
  const parts = (d) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(d)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)]),
    );
  const localAsUTC = (d) => {
    const p = parts(d);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  };
  let result = new Date(start.getTime() + days * 86400000);
  result = new Date(
    result.getTime() + localAsUTC(start) + days * 86400000 - localAsUTC(result),
  );
  return result.toISOString();
}
export function advanceMastery(previous = {}, event, settings = {}) {
  const intervals = settings.intervals || REVIEW_INTERVALS;
  const needed = settings.needed || 3,
    window = settings.window || 4;
  const next = {
    ...previous,
    level: previous.level || 1,
    recent: previous.recent || [],
    interval: previous.interval || 0,
  };
  const qualifies = event.correct && !event.hinted;
  next.level = Math.max(1, Math.min(5, next.level + (qualifies ? 1 : -1)));
  if (event.level === 5)
    next.recent = [...next.recent, qualifies].slice(-window);
  if (
    !next.proficient_at &&
    next.recent.length >= needed &&
    next.recent.filter(Boolean).length >= needed
  ) {
    next.proficient_at = event.at;
    next.review_at = addReviewDays(event.at, intervals[0]);
    next.interval = 0;
  } else if (next.proficient_at && event.level === 5 && qualifies) {
    const due =
      next.review_at && Date.parse(event.at) >= Date.parse(next.review_at);
    if (due) next.interval = Math.min(next.interval + 1, intervals.length - 1);
    next.review_at = addReviewDays(event.at, intervals[next.interval]);
  }
  next.last_attempt_at = event.at;
  return next;
}
export function adaptiveNext(history, skills, cap = 18) {
  const evidence = skills.map((skill) => {
    const entries = history.filter((h) => h.skill === skill);
    const last = entries.at(-1);
    return {
      skill,
      entries,
      level: last
        ? Math.max(1, Math.min(5, last.level + (last.correct ? 1 : -1)))
        : 2,
    };
  });
  const complete =
    history.length >= cap ||
    evidence.every(
      (e) =>
        e.entries.length >= 3 &&
        (e.entries.slice(-2).every((h) => h.correct && h.level >= 4) ||
          e.entries.length >= 5),
    );
  if (complete) return null;
  evidence.sort(
    (a, b) =>
      a.entries.length - b.entries.length ||
      skills.indexOf(a.skill) - skills.indexOf(b.skill),
  );
  return { skill: evidence[0].skill, level: evidence[0].level };
}
export function adaptiveGrade(history, skills) {
  // Proposed criterion score: average demonstrated difficulty-weighted evidence, including misses.
  // Untested skills are explicitly ungraded. Teacher must approve before real-grade use.
  const bySkill = skills.map((skill) => {
    const entries = history.filter((h) => h.skill === skill);
    return {
      skill,
      count: entries.length,
      score: entries.length
        ? Math.round(
            (100 *
              entries.reduce(
                (s, h) =>
                  s +
                  (Number.isFinite(h.credit) ? h.credit : h.correct ? 1 : 0) *
                    (0.4 + 0.12 * h.level),
                0,
              )) /
              entries.length,
          )
        : null,
    };
  });
  return {
    method: "evidence-v1",
    bySkill,
    score: bySkill.some((s) => s.score === null)
      ? null
      : Math.round(bySkill.reduce((s, v) => s + v.score, 0) / bySkill.length),
  };
}
export function anonymousStats(scores, ownScore) {
  const values = scores.filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length < 10)
    return {
      suppressed: true,
      reason: "Class statistics appear after at least 10 released results.",
    };
  const count = values.length,
    mean = values.reduce((s, n) => s + n, 0) / count;
  const frequency = new Map();
  values.forEach((n) => frequency.set(n, (frequency.get(n) || 0) + 1));
  const max = Math.max(...frequency.values());
  return {
    count,
    mean,
    median:
      count % 2
        ? values[(count - 1) / 2]
        : (values[count / 2 - 1] + values[count / 2]) / 2,
    mode:
      max > 1
        ? [...frequency].filter(([, n]) => n === max).map(([n]) => n)
        : [],
    range: values.at(-1) - values[0],
    standardDeviation: Math.sqrt(
      values.reduce((s, n) => s + (n - mean) ** 2, 0) / count,
    ),
    distribution: Array.from({ length: 10 }, (_, i) => ({
      from: i * 10,
      to: i === 9 ? 100 : i * 10 + 9.99,
      count: values.filter((n) => Math.min(9, Math.floor(n / 10)) === i).length,
      self:
        Number.isFinite(ownScore) &&
        Math.min(9, Math.floor(ownScore / 10)) === i,
    })),
  };
}
export function validateDraft(draft) {
  if (!["standard", "adaptive", "spiral"].includes(draft.mode))
    throw Error("Choose standard or adaptive mode.");
  if (
    draft.cap !== undefined &&
    (!Number.isInteger(draft.cap) || draft.cap < 1 || draft.cap > 30)
  )
    throw Error("Adaptive question cap must be 1–30.");
  if (
    !draft.title?.trim() ||
    !Array.isArray(draft.questions) ||
    !draft.questions.length ||
    draft.questions.length > 30
  )
    throw Error("Add a title and 1–30 questions.");
  if (new Set(draft.questions.map((q) => q.id)).size !== draft.questions.length)
    throw Error("Question IDs must be unique.");
  if (
    draft.mode === "standard" &&
    draft.questions.filter((q) => q.spiral).length !== 1
  )
    throw Error("Standard assessments need exactly one spiral question.");
  for (const q of draft.questions)
    if (
      !q.id ||
      !q.skill ||
      !q.prompt ||
      !Number.isFinite(q.points) ||
      q.points <= 0 ||
      q.points > 100 ||
      !q.criteria ||
      (!q.manual && !q.answer)
    )
      throw Error(
        "Each question needs a skill, prompt, points, student criteria and a teacher scoring key or manual rubric.",
      );
  if (draft.mode !== "standard" && !draft.grading_reviewed_at)
    throw Error(
      "Review and approve the adaptive grading method before approving this assessment.",
    );
}

export function latestSubmittedScores(attempts) {
  const byUser = new Map();
  for (const a of attempts) {
    if (!a.submitted_at || !Number.isFinite(a.score)) continue;
    const prior = byUser.get(a.user_id);
    if (!prior || a.attempt_number > prior.attempt_number)
      byUser.set(a.user_id, a);
  }
  return [...byUser.values()].map((a) => a.score);
}
