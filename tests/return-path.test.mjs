import assert from "node:assert/strict";
import test from "node:test";
import { safeClassReturnPath } from "../lib/planning/return-path.js";

test("class pages are allowed back, including the grid week and row anchor", () => {
  const path = "/classes/41dd5d5e-c73d-49a8-90d2-a48bfa026bfd/plan?grid_start=2026-09-07#grid-day-2026-09-10";
  assert.equal(safeClassReturnPath(path, "/fallback"), path);
});

test("anything that could leave MathClaw falls back", () => {
  for (const bad of ["https://evil.example/classes/x", "//evil.example/x", "/classes//evil.example", "/classes/\\evil", "/auth/sign-in", "", null, 42]) {
    assert.equal(safeClassReturnPath(bad, "/fallback"), "/fallback", String(bad));
  }
  assert.equal(safeClassReturnPath("javascript:alert(1)"), null);
});
