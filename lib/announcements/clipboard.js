const ANNOUNCEMENT_FONT_FAMILY =
  "'Book Antiqua', 'Palatino Linotype', Palatino, Georgia, serif";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAnnouncementClipboardHtml(text) {
  const formattedText = escapeHtml(text).replaceAll(/\r?\n/g, "<br>");

  return [
    '<div style="white-space: pre-wrap;">',
    `<span style="font-family: ${ANNOUNCEMENT_FONT_FAMILY};">`,
    formattedText,
    "</span>",
    "</div>",
  ].join("");
}

