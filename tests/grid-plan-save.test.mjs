import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(new URL("../app/classes/[id]/plan/actions.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replaceAll("export async function", "async function");

function fixture(options = {}) {
  const writes = [];
  const paths = [];
  let rebuilds = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "teacher" } } }) },
    from(table) {
      let update;
      const query = {
        select() { return query; },
        eq() { return query; },
        update(value) { update = value; writes.push({ table, value }); return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          const data = update ? (options.noRows ? [] : [update])
            : table === "course_calendar_days"
              ? (options.missingDay ? null : { class_date: "2026-10-16", day_type: "instructional" })
              : [{ status: options.completed ? "completed" : "planned" }];
          return Promise.resolve({ data, error: options.writeError && update ? { message: "Database unavailable" } : null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = vm.createContext({
    console: { info() {} }, process: { env: {} },
    createClient: async () => client,
    getCourseAccessForUser: async () => options.denied ? null : { course: { id: "class-1" } },
    getCourseWriteClient: () => client,
    rebuildPlanFromCalendar: async () => { rebuilds++; if (options.rebuildError) throw Error("Rebuild failed"); },
    revalidatePath: (path) => paths.push(path),
    redirect: (path) => { throw Error(`REDIRECT:${path}`); },
    safeClassReturnPath: (path) => path,
    isGraceDay: () => false,
    courseShowsCalendarDay: () => true,
  });
  vm.runInContext(source + "\nglobalThis.actions = { saveGridPlanAction, updateDailyLessonCountAction };", context);
  return { ...context.actions, writes, paths, rebuilds: () => rebuilds };
}
function data(action = "count") {
  const form = new FormData();
  Object.entries({ grid_action: action, course_id: "class-1", class_date: "2026-10-16", lesson_count: "0", return_to: "/classes/current/plan?grid_start=2026-10-12#grid-day-2026-10-16" })
    .forEach(([key, value]) => form.set(key, value));
  return form;
}

for (const action of ["count", "complete", "planned"]) {
  test(`${action}: returns success only after writing and rebuilding, and revalidates the displayed grid without redirect`, async () => {
    const f = fixture();
    assert.equal((await f.saveGridPlanAction(data(action))).ok, true);
    assert.equal(f.writes.length, 1);
    assert.equal(f.rebuilds(), 1);
    assert.ok(f.paths.includes("/classes/current/plan"));
    assert.equal(action === "count" ? f.writes[0].value.lesson_count_override : f.writes[0].value.status,
      action === "count" ? 0 : action === "complete" ? "completed" : "planned");
  });
  test(`${action}: zero updated rows produce a retryable error`, async () => {
    const f = fixture({ noRows: true });
    assert.ok((await f.saveGridPlanAction(data(action))).error);
    assert.equal(f.rebuilds(), 0);
  });
}
for (const options of [{ signedOut: true }, { denied: true }, { completed: true }, { missingDay: true }, { writeError: true }, { rebuildError: true }]) {
  test(`count: does not report success for ${JSON.stringify(options)}`, async () => {
    const result = await fixture(options).saveGridPlanAction(data());
    assert.ok(result.error);
    assert.equal(result.ok, undefined);
  });
}
test("single-class lesson count still redirects to its return path", async () => {
  await assert.rejects(fixture().updateDailyLessonCountAction(data()), /REDIRECT:\/classes\/current\/plan/);
});
test("unknown action and invalid dates do not write", async () => {
  const f = fixture();
  assert.ok((await f.saveGridPlanAction(data("unknown"))).error);
  assert.ok((await f.saveGridPlanAction(data("constructor"))).error);
  const invalid = data("complete"); invalid.set("class_date", "2026-02-30");
  assert.ok((await f.saveGridPlanAction(invalid)).error);
  assert.equal(f.writes.length, 0);
});
