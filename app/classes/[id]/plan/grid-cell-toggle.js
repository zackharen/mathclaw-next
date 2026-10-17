"use client";

import { useId, useState } from "react";

// Each grid cell shows its four action buttons as a 2x2 block. A button's panel
// is a sibling grid item spanning both columns, so it opens below the block and
// stays inside the cell instead of squeezing into one quarter of it.
export function useGridCellToggle() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return {
    buttonProps: {
      type: "button",
      "aria-expanded": open,
      "aria-controls": panelId,
      onClick: () => setOpen((value) => !value),
    },
    panelProps: { id: panelId, hidden: !open },
  };
}
