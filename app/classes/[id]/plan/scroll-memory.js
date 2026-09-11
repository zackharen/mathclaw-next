"use client";

import { useEffect } from "react";

// Refreshing this page used to land at the top. The plan streams in behind the
// class route's loading skeleton, so the browser's own scroll restoration -- and
// its #next-class-day jump -- runs against a short placeholder and gives up.
// This remembers where the teacher was, per class and per tab, and puts them
// back once the real days are on the page.
//
// It only restores on a reload or back/forward of this page itself. Arriving
// from another page starts at the top as usual, and Mark Complete's client-side
// redirect is left to Next's own #next-class-day scrolling.
let handledInitialLoad = false;

function storageKey() {
  return `mathclaw:plan-scroll:${window.location.pathname}`;
}

export default function PlanScrollMemory() {
  useEffect(() => {
    if (!handledInitialLoad) {
      handledInitialLoad = true;
      const navigation = performance.getEntriesByType("navigation")[0];
      const loadedHere =
        Boolean(navigation) && new URL(navigation.name).pathname === window.location.pathname;
      const returning =
        loadedHere && (navigation.type === "reload" || navigation.type === "back_forward");
      let saved = null;
      try {
        saved = returning ? sessionStorage.getItem(storageKey()) : null;
      } catch {
        saved = null;
      }
      if (saved !== null) {
        window.scrollTo(0, Number(saved));
      } else if (loadedHere && window.location.hash) {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
      }
    }

    const write = () => {
      try {
        sessionStorage.setItem(storageKey(), String(Math.round(window.scrollY)));
      } catch {
        // Storage can be blocked (private browsing); the page still works, it just forgets.
      }
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(write);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", write);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", write);
    };
  }, []);

  return null;
}
