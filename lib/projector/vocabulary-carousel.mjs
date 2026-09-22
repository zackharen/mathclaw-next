export const VOCABULARY_CAROUSEL_TYPE = "vocabulary_carousel";

export function eligibleVocabulary(resources, associations, completedLessonIds, completedOnly) {
  const completed = new Set(completedLessonIds);
  const eligibleIds = new Set(
    associations
      .filter((row) => !completedOnly || completed.has(row.lesson_id))
      .map((row) => row.resource_id)
  );
  return resources.filter((resource) => eligibleIds.has(resource.id));
}

export function shuffledVocabulary(entries, randomInt) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function vocabularyCarouselIndex(startedAt, intervalSeconds, now, count) {
  if (!count) return 0;
  const start = Date.parse(startedAt);
  const intervalMs = Math.max(1, intervalSeconds) * 1000;
  if (!Number.isFinite(start)) return 0;
  return Math.floor(Math.max(0, now - start) / intervalMs) % count;
}

// Turns a "HH:MM" time-of-day picker value into a same-day ISO timestamp, so a
// teacher can schedule a carousel to start later today instead of immediately.
// Shared by the class-vocabulary client component and its tests.
export function resolveScheduledStartIso(timeOfDay, referenceDate = new Date()) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(timeOfDay || "").trim());
  if (!match) return { error: "Choose a start time." };
  const target = new Date(referenceDate.getTime());
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= referenceDate.getTime()) return { error: "Choose a time later today." };
  return { iso: target.toISOString() };
}
