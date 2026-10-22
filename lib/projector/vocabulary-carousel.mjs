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

// The "next unfinished lesson" day: the earliest class date on or after
// `today` (YYYY-MM-DD) that still has a planned lesson. Returns that date and
// its planned rows in slot order, or null when nothing is left.
export function nextLessonDay(planRows, today) {
  const upcoming = (planRows || []).filter((row) =>
    row.status === "planned" && row.lesson_id && String(row.class_date) >= today
  );
  if (!upcoming.length) return null;
  const date = upcoming.reduce((min, row) => (row.class_date < min ? row.class_date : min), upcoming[0].class_date);
  const rows = upcoming
    .filter((row) => row.class_date === date)
    .sort((a, b) => (a.lesson_slot || 1) - (b.lesson_slot || 1));
  return { date, rows };
}

// The objectives card moves one screen per tick, so exactly one carousel screen
// shows it at a time. Each screen stores its slot and the number of screens.
export function carouselShowsObjectives(carousel, now) {
  if (!carousel?.objectives?.lessons?.length) return false;
  const count = Math.max(1, Number(carousel.objectivesScreenCount) || 1);
  const slot = Number(carousel.objectivesSlot) || 0;
  const intervalSeconds = Number(carousel.intervalSeconds) || 30;
  return vocabularyCarouselIndex(carousel.startedAt, intervalSeconds, now, count) === slot;
}
