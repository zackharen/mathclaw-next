export function assessmentOccurrenceKey(ruleId, originalDate) {
  return `${ruleId || ""}|${originalDate || ""}`;
}

export function activeAssessmentSupportRows(rows) {
  return (rows || []).filter((row) => !row.voided_at);
}

export function getAssessmentSupportCost({
  settings,
  supportId,
  occurrence,
  activations = [],
  overrides = [],
}) {
  if (!supportId || !occurrence) return 0;

  const existingActivation = activeAssessmentSupportRows(activations).find(
    (row) =>
      row.support_id === supportId &&
      row.rule_id === occurrence.rule_id &&
      row.original_date === occurrence.original_date
  );
  if (existingActivation) return Number(existingActivation.charged_cost || 0);

  const override = (overrides || []).find(
    (row) =>
      row.support_id === supportId &&
      row.rule_id === occurrence.rule_id &&
      row.original_date === occurrence.original_date
  );
  if (override) return Number(override.cost || 0);

  const markingPeriodNumber = Number(occurrence.marking_period_number || 1);
  const priorClassUses = activeAssessmentSupportRows(activations).filter(
    (row) =>
      row.support_id === supportId &&
      Number(row.marking_period_number || 1) === markingPeriodNumber
  ).length;
  const startingCost = Number(settings?.starting_cost ?? 5);
  const costIncrement = Number(settings?.cost_increment ?? 5);

  return Math.max(0, startingCost + costIncrement * priorClassUses);
}

export function totalActiveDeduction(usages) {
  return activeAssessmentSupportRows(usages).reduce(
    (sum, row) => sum + Number(row.charged_cost || 0),
    0
  );
}

export function selectUpcomingAssessmentOccurrence(occurrences, todayIso) {
  const active = (occurrences || []).filter((item) => !item.is_skipped);
  return active.find((item) => item.assignment_date >= todayIso) || null;
}
