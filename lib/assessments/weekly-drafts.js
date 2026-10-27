import { makeQuestion } from "./bank.js";
import { WEEKLY_SOURCES } from "./weekly-bank.js";
export function weeklyDraftQuestions(lessons, week) {
  if (week !== "2026-10-26") return { questions: [], sources: [] };
  const ids = new Set(lessons.map((l) => l.id));
  let families = [],
    sources = [];
  if (
    ids.has("731d2614-fd98-5817-870c-5528dc72a9b3") &&
    ids.has("af6bef5c-b310-5d67-a321-b716e83c6e94")
  ) {
    families = [
      "derivative-definition",
      "tangent-line",
      "slopes-meaning",
      "corner",
      "continuity",
      "smooth-turn",
      "average-rate",
    ];
    sources = [WEEKLY_SOURCES.derivative, WEEKLY_SOURCES.differentiability];
  }
  if (
    [
      "e53f1e47-6eb1-547f-8b9a-e71a144a466a",
      "35101f30-d91b-5036-8849-462b6d13aba4",
      "eae2c609-6b45-504d-82bc-1392cf9e5ea3",
    ].every((id) => ids.has(id))
  ) {
    families = [
      "context-function",
      "evaluate-function",
      "interpret-notation",
      "function-table",
      "graph-situation",
      "compare-notation",
      "solve-check",
    ];
    sources = [
      WEEKLY_SOURCES.situations,
      WEEKLY_SOURCES.notation,
      WEEKLY_SOURCES.interpretation,
    ];
  }
  return {
    questions: families.map((f, i) => ({
      ...makeQuestion(`weekly:${f}`, 3, 261026 + i * 101, 0),
      lessonIds: lessons.map((l) => l.id),
    })),
    sources,
  };
}
