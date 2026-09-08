"use client";

import { useState } from "react";
import { buildAnnouncementClipboardHtml } from "@/lib/announcements/clipboard";

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        try {
          const html = buildAnnouncementClipboardHtml(text);
          const clipboardItem = new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          });

          await navigator.clipboard.write([clipboardItem]);
        } catch {
          await navigator.clipboard.writeText(text);
        }
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="btn" type="button" onClick={onCopy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
