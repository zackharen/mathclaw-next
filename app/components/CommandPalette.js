"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import "./command-palette.css";

const CommandPaletteDialog = dynamic(() => import("./CommandPaletteDialog"), { ssr: false });

// Teacher quick-jump (Cmd/Ctrl+K): pages, classes and games.
export default function CommandPalette({ pages = [], games = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState(null);
  // Download the dialog code on first open (or on hover/focus of the trigger).
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) setLoaded(true);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || classes) return;
    let cancelled = false;
    fetch("/api/command-palette")
      .then((response) => (response.ok ? response.json() : { classes: [] }))
      .then((data) => {
        if (!cancelled) setClasses(Array.isArray(data.classes) ? data.classes : []);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, classes]);

  const go = useCallback(
    (href) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <>
      <button
        className="commandPaletteTrigger"
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => setLoaded(true)}
        onFocus={() => setLoaded(true)}
        aria-label="Search pages, classes and games"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span aria-hidden="true">⌕</span> Search <kbd>⌘K</kbd>
      </button>
      {loaded ? (
        <CommandPaletteDialog
          open={open}
          setOpen={setOpen}
          pages={pages}
          games={games}
          classes={classes}
          go={go}
        />
      ) : null}
    </>
  );
}
