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
