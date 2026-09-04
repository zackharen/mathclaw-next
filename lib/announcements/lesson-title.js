import { formatLessonLabel } from "../curriculum/lesson-label.js";

export function formatAnnouncementLessonTitle({ rowsForDate, lessonById, fallback }) {
  const rows = rowsForDate || [];
  if (rows.length > 1) {
    return rows
      .map((row, index) => {
        const lesson = lessonById.get(row.lesson_id);
        return `Lesson ${index + 1}: ${
          lesson
            ? formatLessonLabel(lesson.source_lesson_code, lesson.title)
            : "TBD"
        }`;
      })
      .join("\n");
  }

  const lesson = rows.length === 1 ? lessonById.get(rows[0].lesson_id) : null;
  return lesson
    ? formatLessonLabel(lesson.source_lesson_code, lesson.title)
    : fallback;
}
