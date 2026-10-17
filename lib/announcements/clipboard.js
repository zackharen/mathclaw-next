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

// The first line (day number, date, A/B day, schedule) pastes in bold.
export function buildAnnouncementClipboardHtml(text) {
  const [firstLine, ...rest] = escapeHtml(text).split(/\r?\n/);
  const formattedText = [
    firstLine ? `<b style="font-weight: bold;">${firstLine}</b>` : firstLine,
    ...rest,
  ].join("<br>");

  return [
    '<div style="white-space: pre-wrap;">',
    `<span style="font-family: ${ANNOUNCEMENT_FONT_FAMILY};">`,
    formattedText,
    "</span>",
    "</div>",
  ].join("");
}

