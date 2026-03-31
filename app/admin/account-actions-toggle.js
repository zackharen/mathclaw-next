"use client";

import { useState } from "react";

export default function AccountActionsToggle({ children }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="adminActionsToggle">
      <button
        className="btn ghost"
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : "Edit"}
      </button>
      {expanded ? <div className="ctaRow adminActionRow">{children}</div> : null}
    </div>
  );
}
