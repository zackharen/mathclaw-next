"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import "./command-palette.css";

// Teacher quick-jump (Cmd/Ctrl+K): pages, classes and games.
export default function CommandPalette({ pages = [], games = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState(null);

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
        aria-label="Search pages, classes and games"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span aria-hidden="true">⌕</span> Search <kbd>⌘K</kbd>
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search MathClaw"
        overlayClassName="commandPaletteOverlay"
        contentClassName="commandPaletteContent"
      >
        <Command.Input className="commandPaletteInput" placeholder="Jump to a page, class or game…" />
        <Command.List className="commandPaletteList">
          <Command.Empty className="commandPaletteEmpty">No matches.</Command.Empty>
          <Command.Group heading="Pages">
            {pages.map((item) => (
              <Command.Item key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)}>
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Classes">
            {classes === null ? (
              <Command.Loading>Loading classes…</Command.Loading>
            ) : (
              classes.map((course) => (
                <Command.Item
                  key={course.id}
                  value={`class ${course.title} ${course.subtitle} ${course.id}`}
                  onSelect={() => go(`/classes/${course.id}/plan`)}
                >
                  {course.title}
                  {course.subtitle ? <small>{course.subtitle}</small> : null}
                </Command.Item>
              ))
            )}
          </Command.Group>
          <Command.Group heading="Games">
            {games.map((game) => (
              <Command.Item key={game.href} value={`game ${game.label}`} onSelect={() => go(game.href)}>
                {game.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
