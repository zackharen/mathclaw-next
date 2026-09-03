export function formatLessonLabel(sourceLessonCode, title) {
  const safeTitle = title || "Untitled Lesson";
  if (!sourceLessonCode) return safeTitle;

  const normalizedCode = String(sourceLessonCode).trim();
  const normalizedTitle = String(safeTitle).trim();
  const lowerCode = normalizedCode.toLowerCase();
  const lowerTitle = normalizedTitle.toLowerCase();

  if (lowerTitle === lowerCode || lowerTitle.startsWith(`${lowerCode}:`)) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}
