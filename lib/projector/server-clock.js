"use client";

// One server-time offset per page, shared by every carousel on it, so a screen
// whose computer clock is off still flips words at the same moment as the
// dashboard and every other screen.
let offsetMs = 0;
let lastSyncAt = 0;
let inFlight = null;
const RESYNC_MS = 10 * 60 * 1000;

export function serverNow() {
  return Date.now() + offsetMs;
}

// Returns the clock payload ({ now, build }) or null when offline.
export async function syncServerClock({ force = false } = {}) {
  if (inFlight) return inFlight;
  if (!force && lastSyncAt && Date.now() - lastSyncAt < RESYNC_MS) return null;
  inFlight = (async () => {
    try {
      const sentAt = Date.now();
      const response = await fetch("/api/projector/clock", { cache: "no-store" });
      const receivedAt = Date.now();
      if (!response.ok) return null;
      const payload = await response.json();
      if (Number.isFinite(payload?.now)) {
        // Assume the server stamped the time halfway through the round trip.
        offsetMs = payload.now - (sentAt + receivedAt) / 2;
        lastSyncAt = receivedAt;
      }
      return payload;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
