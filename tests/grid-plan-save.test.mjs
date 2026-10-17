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
  const events = [];
  let rebuilds = 0;
  let generations = 0;
  let schedule = [{ class_date: "2026-10-16", lesson_slot: 1, lesson_id: "lesson-1" }];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "teacher" } } }) },
    from(table) {
      let update;
      let columns = "";
      const query = {
        select(value) { columns = value || ""; return query; },
        order() { return query; },
        eq() { return query; },
        update(value) { update = value; writes.push({ table, value }); return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          const data = update ? (options.noRows ? [] : [update])
            : table === "curriculum_lessons" ? { sequence_index: options.lessonSeq ?? 50 }
            : columns.includes("curriculum_lessons(sequence_index)") ? [{ curriculum_lessons: { sequence_index: options.completedSeq ?? 10 } }]
            : columns.includes("lesson_id") ? schedule
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
    rebuildPlanFromCalendar: async () => {
      rebuilds++;
      if (options.rebuildError) throw Error("Rebuild failed");
      if (options.shift) schedule = [{ class_date: "2026-10-19", lesson_slot: 1, lesson_id: "lesson-1" }];
    },
    generateAnnouncementsForCourse: async ({ course }) => {
      generations++;
      if (options.generateError) throw Error("Generator failed");
      return course.id;
    },
    logInternalEvent: async (event) => events.push(event),
    loadSkippedLessonIds: async () => ({
      available: !options.noSkipColumn,
      byCourse: new Map([["class-1", options.skipped || []]]),
    }),
    revalidatePath: (path) => paths.push(path),
    redirect: (path) => { throw Error(`REDIRECT:${path}`); },
    safeClassReturnPath: (path) => path,
    isGraceDay: () => false,
    courseShowsCalendarDay: () => true,
  });
  vm.runInContext(source + "\nglobalThis.actions = { saveGridPlanAction, updateDailyLessonCountAction, markLessonCompleteAction, refreshGridAnnouncementsAction };", context);
  return { ...context.actions, writes, paths, events, rebuilds: () => rebuilds, generations: () => generations };
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

test("count: regenerates the class's announcements after the rebuild", async () => {
  const f = fixture();
  const result = await f.saveGridPlanAction(data());
  assert.equal(result.ok, true);
  assert.equal(result.announcementsFailed, false);
  assert.equal(f.generations(), 1);
});
test("count: a failed announcement refresh keeps the saved change and reports the partial failure", async () => {
  const f = fixture({ generateError: true });
  const result = await f.saveGridPlanAction(data());
  assert.equal(result.ok, true);
  assert.equal(result.announcementsFailed, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.events[0].eventKey, "plan_announcement_refresh_failed");
});
for (const action of ["complete", "planned"]) {
  test(`${action}: regenerates announcements only when the rebuild moved lessons`, async () => {
    const still = fixture();
    assert.equal((await still.saveGridPlanAction(data(action))).announcementsFailed, false);
    assert.equal(still.generations(), 0);
    const shifted = fixture({ shift: true });
    assert.equal((await shifted.saveGridPlanAction(data(action))).ok, true);
    assert.equal(shifted.generations(), 1);
  });
}
test("single-class pages flag a failed announcement refresh in the redirect", async () => {
  await assert.rejects(
    fixture({ generateError: true }).updateDailyLessonCountAction(data()),
    /REDIRECT:\/classes\/current\/plan\?grid_start=2026-10-12&announcements_failed=1#grid-day-2026-10-16/
  );
  const form = data("complete"); form.delete("return_to");
  await assert.rejects(
    fixture({ generateError: true, shift: true }).markLessonCompleteAction(form),
    /REDIRECT:\/classes\/class-1\/plan\?progress_updated=1&t=\d+&announcements_failed=1#next-class-day/
  );
});
test("announcement retry reports success and failure", async () => {
  assert.equal((await fixture().refreshGridAnnouncementsAction("class-1", "/classes/current/plan")).ok, true);
  assert.ok((await fixture({ generateError: true }).refreshGridAnnouncementsAction("class-1")).error);
  assert.ok((await fixture({ signedOut: true }).refreshGridAnnouncementsAction("class-1")).error);
});

function skipData(action = "skip", lessonId = "lesson-9") {
  const form = data(action);
  form.set("lesson_id", lessonId);
  return form;
}
test("skip: adds the lesson to the class's skipped list, rebuilds, and refreshes announcements", async () => {
  const f = fixture({ skipped: ["lesson-1"] });
  const result = await f.saveGridPlanAction(skipData());
  assert.equal(result.ok, true);
  assert.deepEqual([...f.writes[0].value.skipped_lesson_ids], ["lesson-1", "lesson-9"]);
  assert.equal(f.rebuilds(), 1);
  assert.equal(f.generations(), 1);
});
test("skip: completed lessons and missing setup are refused without writing", async () => {
  const done = fixture({ completed: true });
  assert.match((await done.saveGridPlanAction(skipData())).error, /Completed/);
  const missing = fixture({ noSkipColumn: true });
  assert.ok((await missing.saveGridPlanAction(skipData())).error);
  assert.equal(done.writes.length + missing.writes.length, 0);
});
test("restore: removes the lesson and rebuilds", async () => {
  const f = fixture({ skipped: ["lesson-1", "lesson-9"] });
  const result = await f.saveGridPlanAction(skipData("restore"));
  assert.equal(result.ok, true);
  assert.deepEqual([...f.writes[0].value.skipped_lesson_ids], ["lesson-1"]);
  assert.equal(f.rebuilds(), 1);
});
test("restore: refuses a lesson that sits before completed work", async () => {
  const f = fixture({ skipped: ["lesson-9"], lessonSeq: 5, completedSeq: 10 });
  assert.match((await f.saveGridPlanAction(skipData("restore"))).error, /before lessons already marked complete/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.rebuilds(), 0);
});
