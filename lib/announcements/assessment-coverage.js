import { formatAnnouncementAssignmentDate, isWeeklyAssessmentRule, weekStartIso } from "./assignment-rules.js";

export function isReviewLessonCode(code) {
  return /^review\b/i.test(String(code || "").trim());
}

// What each weekly assessment covers: the lessons taught from the previous
// assessment day (that day's lesson included) up to, but not including, its own
// day. Skipped assessments and short weeks roll their lessons into the next one.
// planRows: [{ class_date, lesson_slot, code }]; occurrences come from
// numberRuleAssignmentOccurrences.
export function buildAssessmentCoverage({ rules, occurrences, planRows }) {
  const assessmentRuleIds = new Set((rules || []).filter(isWeeklyAssessmentRule).map((rule) => rule.id));
  const rows = [...(planRows || [])].sort(
    (a, b) => a.class_date.localeCompare(b.class_date) || (a.lesson_slot || 0) - (b.lesson_slot || 0)
  );
  const lastDateByRule = new Map();

  return (occurrences || [])
    .filter((occurrence) => assessmentRuleIds.has(occurrence.rule_id) && !occurrence.is_skipped)
    .sort((a, b) => a.assignment_date.localeCompare(b.assignment_date))
    .map((occurrence) => {
      const from = lastDateByRule.get(occurrence.rule_id) || "";
      const date = occurrence.assignment_date;
      lastDateByRule.set(occurrence.rule_id, date);
      const codes = [];
      for (const row of rows) {
        if (row.class_date < from || row.class_date >= date) continue;
        if (!row.code || isReviewLessonCode(row.code) || codes.includes(row.code)) continue;
        codes.push(row.code);
      }
      return {
        rule_id: occurrence.rule_id,
        date,
        week: weekStartIso(date),
        label: `${occurrence.label} ${occurrence.assessment_number}`.trim(),
        codes,
      };
    });
}

export function formatAssessmentCoverage(entry) {
  const covers = entry.codes.length ? entry.codes.join(", ") : "no new lessons";
  return `${entry.label} (${formatAnnouncementAssignmentDate(entry.date)}) covers: ${covers}`;
}

export function coverageByWeek(entries) {
  const byWeek = new Map();
  for (const entry of entries || []) byWeek.set(entry.week, [...(byWeek.get(entry.week) || []), entry]);
  return byWeek;
}

// Announcements list the coverage on the assessment day and the class meeting
// before it.
export function coverageByAnnouncementDate(entries, meetingDates) {
  const dates = [...(meetingDates || [])].sort();
  const byDate = new Map();
  for (const entry of entries || []) {
    const index = dates.indexOf(entry.date);
    const days = index > 0 ? [dates[index - 1], entry.date] : [entry.date];
    for (const date of days) byDate.set(date, [...(byDate.get(date) || []), entry]);
  }
  return byDate;
}
