import { randomUUID } from "node:crypto";
// Only explicitly curated versions may be automatically suggested in a later
// week's draft. Incomplete coverage stays an explicit teacher-review warning.
export function curatedDraft(lessons, library, attempts = []) {
  const covered = new Set(lessons.map((l) => l.id));
  const candidates = library
    .filter((v) => v.status === "curated")
    .map((v) => ({ ...v.document, libraryVersion: v.id }));
  const main = candidates.filter(
    (q) =>
      !q.spiral &&
      Array.isArray(q.lessonIds) &&
      q.lessonIds.length &&
      q.lessonIds.every((id) => covered.has(id)),
  );
  const questions = [];
  let minutes = 0;
  for (const q of main) {
    if (
      minutes + (q.minutes || 4) > 27 ||
      questions.some((v) => v.skill === q.skill)
    )
      continue;
    questions.push({ ...q, id: randomUUID(), spiral: false });
    minutes += q.minutes || 4;
  }
  const losses = new Map();
  for (const a of attempts)
    for (const q of a.document.questions || []) {
      const mark = a.document.marks?.[q.id];
      if (!Number.isFinite(mark)) continue;
      const e = losses.get(q.skill) || { lost: 0, count: 0 };
      e.lost += 1 - mark / q.points;
      e.count++;
      losses.set(q.skill, e);
    }
  const struggling = [...losses]
    .sort((a, b) => b[1].lost / b[1].count - a[1].lost / a[1].count)
    .find(([, v]) => v.lost > 0)?.[0];
  const spiral =
    candidates.find((q) => q.skill === struggling) ||
    candidates.find((q) => q.spiral || q.prerequisite);
  if (spiral) questions.push({ ...spiral, id: randomUUID(), spiral: true });
  const missing = lessons.filter(
    (l) =>
      !questions
        .filter((q) => !q.spiral)
        .some((q) => q.lessonIds?.includes(l.id)),
  );
  return {
    questions,
    sources: [
      ...new Map(
        questions.filter((q) => q.source).map((q) => [q.source.url, q.source]),
      ).values(),
    ],
    warnings: [
      ...missing.map(
        (l) =>
          `No curated question mapped to ${l.source_lesson_code}: ${l.title}.`,
      ),
      ...(!spiral
        ? ["Select exactly one prerequisite or class-struggle spiral question."]
        : []),
    ],
    spiralRationale:
      struggling && spiral?.skill === struggling
        ? `Prior submitted class evidence suggests ${struggling} needs review.`
        : "No clear class struggle evidence; a curated prerequisite is suggested for teacher review.",
  };
}
export function draftDrift(draft, manifest) {
  return (
    !manifest ||
    draft.document.coverageSnapshots?.[manifest.course_id] !==
      manifest.snapshot ||
    draft.document.coverage?.classes?.find(
      (c) => c.course_id === manifest.course_id,
    )?.entry?.date !== manifest.entry?.date
  );
}
