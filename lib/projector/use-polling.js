"use client";

import { useCallback, useEffect, useRef } from "react";
import { startProjectorPolling } from "./polling.mjs";

export function useProjectorPolling(load, intervalMs, enabled = true) {
  const loadRef = useRef(load);
  const pollerRef = useRef(null);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!enabled) return;
    const poller = startProjectorPolling((signal) => loadRef.current(signal), intervalMs);
    pollerRef.current = poller;
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [enabled, intervalMs]);
  return useCallback(() => pollerRef.current?.refresh(), []);
}
