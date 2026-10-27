"use client";

import { Command } from "cmdk";

// The cmdk dialog. Loaded only after a teacher first opens the palette.
export default function CommandPaletteDialog({ open, setOpen, pages, games, classes, go }) {
  return (
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
  );
}
