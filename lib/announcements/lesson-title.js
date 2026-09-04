import { formatLessonLabel } from "../curriculum/lesson-label.js";

const LESSON_TITLE_TOKEN = "{lesson_title}";
const OBJECTIVE_TOKEN = "{objective}";
const STANDARDS_TOKEN = "{standards}";

function curriculumEntry(row, lessonById, standardsByLesson) {
  const lesson = lessonById.get(row.lesson_id);
  return {
    lessonTitle: lesson
      ? formatLessonLabel(lesson.source_lesson_code, lesson.title)
      : "TBD",
    objective: lesson?.objective || "No objective provided.",
    standards: (standardsByLesson.get(row.lesson_id) || []).join(", ") || "None listed",
  };
}

function replaceCurriculumTokens(template, entry) {
  return template
    .replaceAll(LESSON_TITLE_TOKEN, entry.lessonTitle)
    .replaceAll(OBJECTIVE_TOKEN, entry.objective)
    .replaceAll(STANDARDS_TOKEN, entry.standards);
}

function repeatedCurriculumBlock(template, entries) {
  const lessonIndex = template.indexOf(LESSON_TITLE_TOKEN);
  const objectiveIndex = template.indexOf(OBJECTIVE_TOKEN);
  const standardsIndex = template.indexOf(STANDARDS_TOKEN);
  if (
    lessonIndex < 0 ||
    objectiveIndex < lessonIndex ||
    standardsIndex < objectiveIndex
  ) {
    return null;
  }

  const blockStart = template.lastIndexOf("\n", lessonIndex) + 1;
  const standardsEnd = standardsIndex + STANDARDS_TOKEN.length;
  const nextLineBreak = template.indexOf("\n", standardsEnd);
  const blockEnd = nextLineBreak < 0 ? template.length : nextLineBreak;
  const blockTemplate = template.slice(blockStart, blockEnd);

  return `${template.slice(0, blockStart)}${entries
    .map((entry) => replaceCurriculumTokens(blockTemplate, entry))
    .join("\n")}${template.slice(blockEnd)}`;
}

export function buildAnnouncementCurriculum({
  template,
  rowsForDate,
  lessonById,
  standardsByLesson,
  fallback,
}) {
  const rows = rowsForDate || [];
  if (rows.length === 0) {
    return {
      template,
      values: {
        lesson_title: fallback,
        objective: "No objective provided.",
        standards: "None listed",
      },
    };
  }

  const entries = rows.map((row) => curriculumEntry(row, lessonById, standardsByLesson));
  if (entries.length === 1) {
    return {
      template,
      values: {
        lesson_title: entries[0].lessonTitle,
        objective: entries[0].objective,
        standards: entries[0].standards,
      },
    };
  }

  const expandedTemplate = repeatedCurriculumBlock(template, entries);
  if (expandedTemplate) {
    return {
      template: expandedTemplate,
      values: { lesson_title: "", objective: "", standards: "" },
    };
  }

  return {
    template,
    values: {
      lesson_title: entries
        .map((entry) => `${entry.lessonTitle}\n${entry.objective}\n${entry.standards}`)
        .join("\n"),
      objective: "",
      standards: "",
    },
  };
}
