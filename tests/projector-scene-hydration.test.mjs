import test from "node:test";
import assert from "node:assert/strict";

// The Projector page ships saved scenes without their screen_states, so two pieces of
// logic have to hold: the summary it sends must describe the same filled screens the
// states did, and the full-library modal must actually fetch the states when it opens.
// Both are exercised here because neither can be reached from a signed-out browser.

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));

// Mirrors toSceneSummary in app/projector/page.js.
function toSceneSummary(scene) {
  const states = scene?.screen_states && typeof scene.screen_states === "object" ? scene.screen_states : {};
  return {
    id: scene.id,
    title: scene.title,
    folder_id: scene.folder_id ?? null,
    created_at: scene.created_at,
    updated_at: scene.updated_at,
    filled_screen_ids: SCREEN_IDS.filter((screenId) => states[screenId]),
    saved_screen_ids: SCREEN_IDS.filter((screenId) =>
      Object.prototype.hasOwnProperty.call(states, screenId)
    ),
  };
}

// Mirrors sceneFilledCount in app/projector/projector-client.js.
function sceneFilledCount(scene, screenIds) {
  if (scene?.screen_states && typeof scene.screen_states === "object") {
    return screenIds.filter((screenId) => scene.screen_states[screenId]).length;
  }
  const filled = new Set((scene?.filled_screen_ids || []).map(String));
  return screenIds.filter((screenId) => filled.has(screenId)).length;
}

// Mirrors sceneSavedScreenIds in app/projector/projector-client.js.
function sceneSavedScreenIds(scene) {
  if (Array.isArray(scene?.saved_screen_ids)) {
    return scene.saved_screen_ids
      .map(String)
      .filter((screenId) => SCREEN_IDS.includes(screenId))
      .sort((left, right) => Number(left) - Number(right));
  }
  const source = scene?.screen_states && typeof scene.screen_states === "object" ? scene.screen_states : {};
  return Object.keys(source)
    .filter((screenId) => SCREEN_IDS.includes(screenId))
    .sort((left, right) => Number(left) - Number(right));
}

const sceneWithStates = {
  id: "scene-1",
  title: "Do Now 6",
  folder_id: "folder-1",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
  screen_states: {
    1: { type: "image", content: "data:image/png;base64,AAAA" },
    2: { type: "text", content: "Warm up" },
    3: null,
    4: { type: "latex", content: "x^2" },
  },
};

test("a scene summary carries no screen contents", () => {
  const summary = toSceneSummary(sceneWithStates);

  assert.equal(summary.screen_states, undefined);
  assert.equal(JSON.stringify(summary).includes("base64"), false);
  assert.equal(summary.title, "Do Now 6");
  assert.equal(summary.folder_id, "folder-1");
});

test("a scene summary reports the same filled screens the states did", () => {
  const summary = toSceneSummary(sceneWithStates);
  const roomScreens = ["1", "2", "3", "4"];

  // Screen 3 was saved as null, so it is a saved slot but not a filled screen.
  assert.deepEqual(summary.filled_screen_ids, ["1", "2", "4"]);
  assert.equal(sceneFilledCount(summary, roomScreens), sceneFilledCount(sceneWithStates, roomScreens));
});

test("a scene summary keeps counting saved slots the way load-scene does", () => {
  const summary = toSceneSummary(sceneWithStates);

  // The assignment prompt fires on saved slots, so a null screen still counts here.
  assert.deepEqual(summary.saved_screen_ids, ["1", "2", "3", "4"]);
  assert.deepEqual(sceneSavedScreenIds(summary), sceneSavedScreenIds(sceneWithStates));
});

test("scenes with no saved screens summarize to an empty filled list", () => {
  assert.deepEqual(toSceneSummary({ id: "s", title: "Empty" }).filled_screen_ids, []);
  assert.deepEqual(toSceneSummary({ id: "s", title: "Empty", screen_states: {} }).filled_screen_ids, []);
});

test("a fallback-shaped scene row without folder_id summarizes to null", () => {
  const summary = toSceneSummary({ id: "s", title: "No folder column", screen_states: { 1: { type: "text" } } });
  assert.equal(summary.folder_id, null);
});

// The modal's fetch-on-open effect, reduced to its scheduling. `run` is called once
// per React effect pass; deps decide when a pass happens, and a pass runs the previous
// pass's cleanup first. The bug this guards against: including the in-flight flag in
// the deps makes setting it re-run the effect, whose cleanup cancels the very fetch it
// just started, so the result is dropped and the modal never fills in.
function simulateFetchEffect({ trackLoadingInDeps }) {
  const state = { open: true, scenesHydrated: false, loadingScenes: false };
  const ref = { inFlight: false, failed: false };
  let fetches = 0;
  let cleanup = null;
  let pending = null;
  let lastDeps = null;
  let renderQueued = false;

  function pass() {
    if (cleanup) cleanup();
    cleanup = null;

    if (!state.open) {
      ref.failed = false;
      return;
    }
    const busy = trackLoadingInDeps ? state.loadingScenes : ref.inFlight;
    if (state.scenesHydrated || busy || ref.failed) return;

    let cancelled = false;
    ref.inFlight = true;
    fetches += 1;
    // The effect body runs to completion and returns its cleanup; the state update it
    // makes only triggers another render afterwards.
    setLoading(true);
    pending = () => {
      if (trackLoadingInDeps && cancelled) return;
      state.scenesHydrated = true;
      ref.inFlight = false;
      setLoading(false);
      flush();
    };
    if (trackLoadingInDeps) cleanup = () => { cancelled = true; };
  }

  function setLoading(next) {
    if (state.loadingScenes === next) return;
    state.loadingScenes = next;
    renderQueued = true;
  }

  function flush() {
    while (renderQueued) {
      renderQueued = false;
      const deps = trackLoadingInDeps
        ? [state.open, state.scenesHydrated, state.loadingScenes]
        : [state.open, state.scenesHydrated];
      if (lastDeps && deps.every((value, index) => value === lastDeps[index])) return;
      lastDeps = deps;
      pass();
    }
  }

  renderQueued = true;
  flush();
  pending?.();

  return { fetches, hydrated: state.scenesHydrated, stuckLoading: state.loadingScenes };
}

test("tracking the in-flight flag in the deps strands the scene fetch", () => {
  const result = simulateFetchEffect({ trackLoadingInDeps: true });

  assert.equal(result.fetches, 1);
  assert.equal(result.hydrated, false, "the fetched scenes are discarded by the cleanup");
  assert.equal(result.stuckLoading, true, "the modal is left loading forever");
});

test("tracking it on a ref lets the scene fetch complete exactly once", () => {
  const result = simulateFetchEffect({ trackLoadingInDeps: false });

  assert.equal(result.fetches, 1);
  assert.equal(result.hydrated, true);
  assert.equal(result.stuckLoading, false);
});
