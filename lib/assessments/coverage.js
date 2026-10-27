import "server-only";
import { loadAssessmentScheduleData } from "@/lib/assessment-resources/server";
import {
  buildAssessmentCoverage,
  isReviewLessonCode,
} from "@/lib/announcements/assessment-coverage";
import { coverageSnapshot, lessonSetKey } from "./core";
import { result, fail } from "./server";
export async function liveCoverage(ctx, week) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(week) ||
    new Date(`${week}T12:00:00Z`).getUTCDay() !== 1
  )
    fail("Choose a valid Monday date.");
  const end = new Date(`${week}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 4);
  const through = end.toISOString().slice(0, 10);
  const manifests = await Promise.all(
    ctx.courses.map(async (course) => {
      const [schedule, rows] = await Promise.all([
        loadAssessmentScheduleData({ course, admin: ctx.admin }),
        ctx.admin
          .from("course_lesson_plan")
          .select(
            "class_date,lesson_slot,lesson_id,curriculum_lessons(id,library_id,source_lesson_code,title,objective)",
          )
          .eq("course_id", course.id)
          .order("class_date")
          .then(result),
      ]);
      const entries = buildAssessmentCoverage({
        rules: schedule.rules,
        occurrences: schedule.occurrences,
        planRows: rows.map((r) => ({
          ...r,
          code: r.curriculum_lessons?.source_lesson_code,
        })),
      });
      const entry = entries.find((e) => e.date >= week && e.date <= through);
      const previous = entry
        ? entries
            .filter((e) => e.rule_id === entry.rule_id && e.date < entry.date)
            .at(-1)?.date || ""
        : "";
      const covered = entry
        ? rows.filter(
            (r) =>
              r.class_date >= previous &&
              r.class_date < entry.date &&
              r.lesson_id &&
              !isReviewLessonCode(r.curriculum_lessons?.source_lesson_code),
          )
        : [];
      const lessons = [
        ...new Map(
          covered.map((r) => [r.lesson_id, r.curriculum_lessons]),
        ).values(),
      ];
      return {
        course_id: course.id,
        title: course.title,
        entry,
        lessons,
        snapshot: coverageSnapshot(covered),
        key: lessonSetKey(lessons),
        warning: !course.selected_library_id
          ? "No selected curriculum or lesson plan. Teacher must supply coverage."
          : !entry
            ? "No assessment scheduled this week."
            : !lessons.length
              ? "No new lesson coverage found."
              : null,
      };
    }),
  );
  const skipped = week === "2026-11-02";
  return {
    week,
    skipped,
    manifests,
    groups: [
      ...new Set(
        manifests
          .filter((m) => m.entry && !m.warning && !skipped)
          .map((m) => m.key),
      ),
    ].map((key) => ({
      key,
      classes: manifests.filter((m) => m.key === key && !m.warning),
      lessons: manifests.find((m) => m.key === key).lessons,
    })),
  };
}
