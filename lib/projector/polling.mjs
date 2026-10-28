// Realtime is the primary transport. HTTP repairs missed broadcasts, only while
// this page is visible/online, with one request at a time and bounded retries.
export function startProjectorPolling(load, intervalMs, { page = document, browser = window } = {}) {
  let stopped = false;
  let timer;
  let request;
  let queued = false;
  let failures = 0;
  let lastStarted = -Infinity;
  const available = () => !stopped && page.visibilityState !== "hidden" && browser.navigator.onLine !== false;
  const clear = () => browser.clearTimeout(timer);

  async function refresh() {
    if (!available()) return;
    if (request) {
      queued = true;
      return;
    }
    clear();
    const controller = new AbortController();
    request = controller;
    lastStarted = Date.now();
    const timeout = browser.setTimeout(() => controller.abort(), 15000);
    try {
      const ok = await load(controller.signal);
      failures = ok === false || controller.signal.aborted ? failures + 1 : 0;
    } catch {
      failures += 1;
    } finally {
      browser.clearTimeout(timeout);
      request = null;
      if (available()) {
        const delay = queued ? 250 : Math.min(Math.max(60000, intervalMs), intervalMs * 2 ** Math.min(failures, 4));
        queued = false;
        timer = browser.setTimeout(refresh, delay);
      }
    }
  }

  function onWake() {
    if (!available()) {
      clear();
      queued = false;
      request?.abort();
      return;
    }
    // focus/visibilitychange/online often arrive together.
    if (Date.now() - lastStarted >= 1000) refresh();
    else if (!request) {
      clear();
      timer = browser.setTimeout(refresh, intervalMs);
    }
  }

  page.addEventListener("visibilitychange", onWake);
  browser.addEventListener("online", onWake);
  browser.addEventListener("offline", onWake);
  browser.addEventListener("focus", onWake);
  refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      clear();
      request?.abort();
      page.removeEventListener("visibilitychange", onWake);
      browser.removeEventListener("online", onWake);
      browser.removeEventListener("offline", onWake);
      browser.removeEventListener("focus", onWake);
    },
  };
}
