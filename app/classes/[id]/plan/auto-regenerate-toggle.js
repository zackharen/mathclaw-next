"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mathclaw:autoRegeneratePlan";

export default function AutoRegenerateToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  }, [enabled]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) return;
      if (target.dataset.calendarUpdateForm !== "1") return;

      let hidden = target.querySelector('input[name="auto_regenerate"]');
      if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "auto_regenerate";
        target.appendChild(hidden);
      }
      hidden.value = enabledRef.current ? "1" : "0";
    };

    document.addEventListener("submit", handler, true);
    return () => document.removeEventListener("submit", handler, true);
  }, []);

  return (
    <label className="autoToggle" title="If on, saving a day will automatically rebuild the plan.">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
      <span>Auto-regenerate</span>
    </label>
  );
}
