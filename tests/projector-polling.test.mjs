import test from "node:test";
import assert from "node:assert/strict";
import { startProjectorPolling } from "../lib/projector/polling.mjs";

function environment(t, { hidden = false, online = true } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const page = new EventTarget();
  page.visibilityState = hidden ? "hidden" : "visible";
  const browser = new EventTarget();
  browser.navigator = { onLine: online };
  browser.setTimeout = (...args) => setTimeout(...args);
  browser.clearTimeout = (id) => clearTimeout(id);
  return { page, browser };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
async function tick(t, ms) { t.mock.timers.tick(ms); await settle(); }
function run(t, load, ms, env) {
  const poller = startProjectorPolling(load, ms, env);
  t.after(() => poller.stop());
  return poller;
}

test("idle connected receiver makes 60 fallback requests/hour instead of 1800", async (t) => {
  const env = environment(t);
  let calls = 0;
  run(t, async () => { calls++; }, 60000, env);
  await settle();
  for (let i = 0; i < 60; i++) await tick(t, 60000);
  assert.equal(calls, 61); // initial load plus 60 repairs
});

test("hidden and offline tabs make no requests; returning catches up immediately", async (t) => {
  const env = environment(t, { hidden: true });
  let calls = 0;
  run(t, async () => { calls++; }, 5000, env);
  await tick(t, 60000);
  assert.equal(calls, 0);
  env.page.visibilityState = "visible";
  env.page.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(calls, 1);
  env.browser.navigator.onLine = false;
  env.browser.dispatchEvent(new Event("offline"));
  await tick(t, 60000);
  assert.equal(calls, 1);
  env.browser.navigator.onLine = true;
  env.browser.dispatchEvent(new Event("online"));
  env.browser.dispatchEvent(new Event("focus"));
  env.page.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(calls, 2);
});

test("broadcast bursts coalesce without overlapping a slow request", async (t) => {
  const env = environment(t);
  let calls = 0;
  let finish;
  const poller = run(t, () => { calls++; return new Promise((resolve) => { finish = resolve; }); }, 5000, env);
  for (let i = 0; i < 20; i++) poller.refresh();
  await tick(t, 10000);
  assert.equal(calls, 1);
  finish();
  await settle();
  await tick(t, 250);
  assert.equal(calls, 2);
  finish();
  await settle();
});

test("an idle broadcast refreshes immediately, without waiting for the fallback", async (t) => {
  const env = environment(t);
  let calls = 0;
  const poller = run(t, async () => { calls++; }, 60000, env);
  await settle();
  await tick(t, 2000);
  await poller.refresh();
  assert.equal(calls, 2);
});

test("hide/unmount aborts in-flight requests and removes timers/listeners", async (t) => {
  const env = environment(t);
  let calls = 0;
  let signal;
  const poller = run(t, (nextSignal) => {
    calls++;
    signal = nextSignal;
    return new Promise((resolve) => nextSignal.addEventListener("abort", resolve));
  }, 5000, env);
  env.page.visibilityState = "hidden";
  env.page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(signal.aborted, true);
  await settle();
  await tick(t, 60000);
  assert.equal(calls, 1);
  poller.stop();
  env.page.visibilityState = "visible";
  env.page.dispatchEvent(new Event("visibilitychange"));
  env.browser.dispatchEvent(new Event("online"));
  await tick(t, 60000);
  assert.equal(calls, 1);
});

test("HTTP failures back off to a bounded retry rate and recover", async (t) => {
  const env = environment(t);
  let calls = 0;
  let healthy = false;
  run(t, async () => { calls++; return healthy; }, 5000, env);
  await settle();
  for (const delay of [10000, 20000, 40000, 60000, 60000]) await tick(t, delay);
  assert.equal(calls, 6);
  healthy = true;
  await tick(t, 60000);
  await tick(t, 5000);
  assert.equal(calls, 8);
});

test("hung fetches abort after 15 seconds and retry without overlap", async (t) => {
  const env = environment(t);
  let calls = 0;
  let signal;
  run(t, (nextSignal) => {
    calls++;
    signal = nextSignal;
    return new Promise((resolve) => nextSignal.addEventListener("abort", () => resolve(false)));
  }, 5000, env);
  await tick(t, 15000);
  assert.equal(signal.aborted, true);
  await tick(t, 10000);
  assert.equal(calls, 2);
});

test("five-minute build checks retain their original interval", async (t) => {
  const env = environment(t);
  let calls = 0;
  run(t, async () => { calls++; }, 300000, env);
  await settle();
  await tick(t, 60000);
  assert.equal(calls, 1);
  await tick(t, 240000);
  assert.equal(calls, 2);
});
