export const LESSON_RESOURCE_BUCKET = "lesson-resources";
export const LESSON_RESOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const LESSON_RESOURCE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIME_BY_EXTENSION = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const LESSON_RESOURCE_FILE_ACCEPT = Object.keys(MIME_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

const KNOWN_LESSON_RESOURCE_SITES = [
  ["openmiddle.com", "Open Middle"],
  ["desmos.com", "Desmos"],
  ["geogebra.org", "GeoGebra"],
  ["docs.google.com", "Google Docs"],
  ["drive.google.com", "Google Drive"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["deltamath.com", "DeltaMath"],
  ["edpuzzle.com", "Edpuzzle"],
  ["kahoot.com", "Kahoot"],
  ["quizizz.com", "Quizizz"],
];

export function lessonResourceMimeType(fileName, reportedType = "") {
  const normalizedType = String(reportedType || "").toLowerCase();
  if (LESSON_RESOURCE_MIME_TYPES.has(normalizedType)) return normalizedType;
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] || "";
}

export function validateLessonResourceFile({ name, size, type }) {
  const mimeType = lessonResourceMimeType(name, type);
  if (!mimeType) return { error: "Choose a supported document, spreadsheet, presentation, PDF, text file, or image." };
  if (!Number.isFinite(Number(size)) || Number(size) <= 0) return { error: "Choose a non-empty file." };
  if (Number(size) > LESSON_RESOURCE_MAX_BYTES) return { error: "Files must be 25 MB or smaller." };
  return { mimeType };
}

export function sanitizeLessonResourceFileName(value) {
  const safe = String(value || "file")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return safe || "file";
}

export function normalizeLessonResourceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeLessonResourceHostname(value) {
  const normalizedUrl = normalizeLessonResourceUrl(value);
  if (!normalizedUrl) return "";
  return new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "").slice(0, 253);
}

export function normalizeLessonResourceSiteName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function getLessonResourceSiteSuggestion(value, savedSiteNames = {}) {
  const hostname = normalizeLessonResourceHostname(value);
  if (!hostname) return { hostname: "", name: "", source: "invalid" };

  const savedName = normalizeLessonResourceSiteName(savedSiteNames?.[hostname]);
  if (savedName) return { hostname, name: savedName, source: "saved" };

  const knownSite = KNOWN_LESSON_RESOURCE_SITES.find(
    ([domain]) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
  if (knownSite) return { hostname, name: knownSite[1], source: "known" };

  return { hostname, name: "", source: "unknown" };
}

export function normalizeLessonResourceTitle(value, fallback = "Resource") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 160) || fallback;
}

export function formatLessonResourceSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
