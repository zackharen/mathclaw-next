const CURRICULUM_PLACEHOLDERS = [
  "{lesson_title}",
  "{objective}",
  "{standards}",
];

export function announcementTemplateForCourse(template, hasCurriculum) {
  if (hasCurriculum) return template;

  return String(template || "")
    .split(/\r?\n/)
    .filter(
      (line) =>
        !CURRICULUM_PLACEHOLDERS.some((placeholder) => line.includes(placeholder))
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shouldIncludeCurriculumDoNow(includeDoNow, hasCurriculum) {
  return Boolean(includeDoNow && hasCurriculum);
}
