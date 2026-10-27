"use client";

import DOMPurify from "dompurify";
import { useSyncExternalStore } from "react";

// Question visuals are SVG diagrams and small tables. Teachers can edit
// draft documents, so clean the markup before it reaches a student's screen:
// scripts, event handlers, links, and embedded documents are removed.
export function sanitizeVisual(html) {
  return DOMPurify.sanitize(String(html || ""), {
    USE_PROFILES: { svg: true, svgFilters: false, html: true },
    FORBID_TAGS: ["a", "foreignObject", "iframe", "form", "input", "button", "style", "use", "image", "img"],
    FORBID_ATTR: ["href", "xlink:href", "src", "style"],
  });
}

const subscribe = () => () => {};

export default function SafeVisual({ html, className }) {
  // DOMPurify needs a browser DOM, so render nothing on the server.
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!isClient || !html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeVisual(html) }} />;
}
