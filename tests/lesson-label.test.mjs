import test from "node:test";
import assert from "node:assert/strict";

import { formatLessonLabel } from "../lib/curriculum/lesson-label.js";

test("identical review codes and titles display once", () => {
  assert.equal(
    formatLessonLabel("Review 2.03-2.04", "Review 2.03-2.04"),
    "Review 2.03-2.04"
  );
});

test("ordinary lesson codes remain paired with their titles", () => {
  assert.equal(
    formatLessonLabel("2.04", "Derivative Patterns"),
    "2.04: Derivative Patterns"
  );
});

test("titles that already contain their code are not prefixed again", () => {
  assert.equal(
    formatLessonLabel("2.04", "2.04: Derivative Patterns"),
    "2.04: Derivative Patterns"
  );
});
