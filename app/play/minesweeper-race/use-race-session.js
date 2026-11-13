"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 2500;
const CLOCK_TICK_MS = 250;

// Shared by the player screen and the classroom display: polls the race for a
// class, keeps the newest answer, and exposes a clock corrected to server time
// so every screen starts and times the round identically.
export function useRaceSession(courseId, { view = "play", pollOverride = null } = {}) {
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [pollError, setPollError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const clockOffsetRef = useRef(null);
  const requestCounterRef = useRef(0);
  const appliedCounterRef = useRef(0);
  const pollOverrideRef = useRef(pollOverride);

  useEffect(() => {
    pollOverrideRef.current = pollOverride;
  }, [pollOverride]);

  // Responses can arrive out of order. Only one that was requested after the
  // last applied one may replace the session, so a slow poll never rewinds it.
  const applyPayload = useCallback((requestId, payload) => {
    if (requestId < appliedCounterRef.current) return false;
    appliedCounterRef.current = requestId;
    const next = payload?.session || null;
    if (next?.serverNow) {
      // Every answer is a little late, so each sample reads slightly behind the
      // server. The largest sample is the one that travelled fastest.
      const sample = Date.parse(next.serverNow) - Date.now();
      clockOffsetRef.current =
        clockOffsetRef.current === null ? sample : Math.max(clockOffsetRef.current, sample);
      setClockOffsetMs(clockOffsetRef.current);
    }
    setSession(next);
    setLoaded(true);
    setPollError("");
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    const requestId = ++requestCounterRef.current;
    try {
      const response = await fetch(
        `/api/play/minesweeper-race?courseId=${encodeURIComponent(courseId)}&view=${view}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load the race.");
      applyPayload(requestId, payload);
    } catch (error) {
      setLoaded(true);
      setPollError(error.message || "Connection problem. Retrying...");
    }
  }, [applyPayload, courseId, view]);

  const post = useCallback(
    async (body, options = {}) => {
      const requestId = ++requestCounterRef.current;
      const response = await fetch("/api/play/minesweeper-race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: Boolean(options.keepalive),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That did not work. Try again.");
      applyPayload(requestId, payload);
      return payload.session || null;
    },
    [applyPayload]
  );

  useEffect(() => {
    appliedCounterRef.current = ++requestCounterRef.current;
    setSession(null);
    setLoaded(false);
    setPollError("");
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return undefined;
    refresh();
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      // A poll override lets the player screen send its progress report in
      // place of the plain poll, so playing never doubles the request rate.
      if (pollOverrideRef.current?.()) return;
      refresh();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [courseId, refresh]);

  const isRacing = session?.status === "racing";
  useEffect(() => {
    if (!isRacing) return undefined;
    const tick = () => setNowMs(Date.now());
    tick();
    const interval = window.setInterval(tick, CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [isRacing]);

  return {
    session,
    loaded,
    pollError,
    refresh,
    post,
    serverNowMs: nowMs + clockOffsetMs,
    getServerNowMs: useCallback(() => Date.now() + (clockOffsetRef.current || 0), []),
  };
}
