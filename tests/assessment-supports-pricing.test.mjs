import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssessmentSupportCost,
  totalActiveDeduction,
} from "../lib/assessment-supports/pricing.js";

const settings = { starting_cost: 5, cost_increment: 5 };
const quarterOneAssessment = {
  rule_id: "assessment-rule",
  original_date: "2026-09-10",
  marking_period_number: 1,
};

test("each support escalates independently for the whole class", () => {
  const activations = [{
    support_id: "notes",
    rule_id: "assessment-rule",
    original_date: "2026-09-03",
    marking_period_number: 1,
    charged_cost: 5,
    voided_at: null,
  }];

  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "notes",
    occurrence: quarterOneAssessment,
    activations,
  }), 10);
  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "teacher-hint",
    occurrence: quarterOneAssessment,
    activations,
  }), 5);
});

test("support escalation resets in a new marking period", () => {
  const activations = [{
    support_id: "notes",
    rule_id: "assessment-rule",
    original_date: "2026-09-03",
    marking_period_number: 1,
    charged_cost: 15,
    voided_at: null,
  }];
  const quarterTwoAssessment = { ...quarterOneAssessment, marking_period_number: 2 };

  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "notes",
    occurrence: quarterTwoAssessment,
    activations,
  }), 5);
});

test("an assessment override wins until a charged cost is snapshotted", () => {
  const overrides = [{
    support_id: "notes",
    rule_id: "assessment-rule",
    original_date: "2026-09-10",
    cost: 2,
  }];
  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "notes",
    occurrence: quarterOneAssessment,
    overrides,
  }), 2);

  const activations = [{
    support_id: "notes",
    rule_id: "assessment-rule",
    original_date: "2026-09-10",
    marking_period_number: 1,
    charged_cost: 10,
    voided_at: null,
  }];
  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "notes",
    occurrence: quarterOneAssessment,
    activations,
    overrides,
  }), 10);
});

test("voided class activations do not raise the next price", () => {
  const activations = [{
    support_id: "notes",
    rule_id: "assessment-rule",
    original_date: "2026-09-03",
    marking_period_number: 1,
    charged_cost: 5,
    voided_at: "2026-09-04T12:00:00Z",
  }];
  assert.equal(getAssessmentSupportCost({
    settings,
    supportId: "notes",
    occurrence: quarterOneAssessment,
    activations,
  }), 5);
});

test("totals ignore voided records and required accommodations cost zero", () => {
  assert.equal(totalActiveDeduction([
    { charged_cost: 10, voided_at: null },
    { charged_cost: 0, usage_type: "required_accommodation", voided_at: null },
    { charged_cost: 5, voided_at: "2026-09-10T12:00:00Z" },
  ]), 10);
});
