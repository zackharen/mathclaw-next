import test from "node:test";
import assert from "node:assert/strict";

import { buildABMap } from "../lib/school-calendar.js";

test("off days have no A/B label and do not advance the rotation", () => {
  const dates = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const schoolDayByDate = new Map([
    ["2026-09-07", { day_type: "off" }],
  ]);

  assert.deepEqual(
    Array.from(buildABMap(dates, "2026-09-04", schoolDayByDate)),
    [
      ["2026-09-04", "A"],
      ["2026-09-07", "-"],
      ["2026-09-08", "B"],
      ["2026-09-09", "A"],
    ]
  );
});

test("dates before the configured A/B start remain unlabeled", () => {
  const dates = ["2026-09-02", "2026-09-03", "2026-09-04"];

  assert.deepEqual(
    Array.from(buildABMap(dates, "2026-09-03", new Map())),
    [
      ["2026-09-02", "-"],
      ["2026-09-03", "A"],
      ["2026-09-04", "B"],
    ]
  );
});
