import { formatLessonLabel } from "../curriculum/lesson-label.js";

export const LESSON_RESOURCE_BUCKET = "lesson-resources";
export const LESSON_RESOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const LESSON_VOCABULARY_CSV_MAX_BYTES = 1024 * 1024;
export const LESSON_VOCABULARY_CSV_MAX_ROWS = 500;

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
export const LESSON_VOCABULARY_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif";
const LESSON_VOCABULARY_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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
  ["ixl.com", "IXL"],
];

const RESOURCE_TITLE_MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

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

export function validateLessonVocabularyImage(file) {
  const validation = validateLessonResourceFile(file);
  if (validation.error) return validation;
  if (!LESSON_VOCABULARY_IMAGE_MIME_TYPES.has(validation.mimeType)) {
    return { error: "Choose a JPG, PNG, WebP, or GIF image." };
  }
  return validation;
}

// Clipboard images often arrive with no filename (or a generic one like
// "image.png"), so a pasted vocabulary image needs a name of its own.
export function buildClipboardImageFileName(mimeType) {
  const extension = String(mimeType || "").split("/")[1] || "png";
  return `pasted-image-${Date.now()}.${extension}`;
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

function titleFromUrlSlug(value) {
  const words = String(value || "")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && index < words.length - 1 && RESOURCE_TITLE_MINOR_WORDS.has(lower)) {
        return lower;
      }
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

export function getLessonResourceTitleSuggestion(value, savedSiteNames = {}) {
  const normalizedUrl = normalizeLessonResourceUrl(value);
  if (!normalizedUrl) return "";

  const parsed = new URL(normalizedUrl);
  const hostname = normalizeLessonResourceHostname(normalizedUrl);
  if (hostname === "ixl.com" || hostname.endsWith(".ixl.com")) {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const skillSlug = pathParts.at(-1) || "";
    let skillTitle = "";
    try {
      skillTitle = titleFromUrlSlug(decodeURIComponent(skillSlug));
    } catch {
      skillTitle = titleFromUrlSlug(skillSlug);
    }
    if (skillTitle) return `IXL | ${skillTitle}`;
  }

  return getLessonResourceSiteSuggestion(normalizedUrl, savedSiteNames).name;
}

export function normalizeLessonResourceTitle(value, fallback = "Resource") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 160) || fallback;
}

export function normalizeLessonVocabularyWord(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizeLessonVocabularyDefinition(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 1000);
}

export function normalizeLessonVocabularyInput({ word, definition, attachmentType, url }) {
  const normalizedWord = normalizeLessonVocabularyWord(word);
  if (!normalizedWord) return { error: "Enter a vocabulary word." };

  const normalizedDefinition = normalizeLessonVocabularyDefinition(definition);
  if (attachmentType === "none") {
    return {
      values: {
        title: normalizedWord,
        definition: normalizedDefinition || null,
        resource_type: "none",
        url: null,
      },
    };
  }
  if (attachmentType === "link") {
    const normalizedUrl = normalizeLessonResourceUrl(url);
    if (!normalizedUrl) return { error: "Enter a valid http or https link." };
    return {
      values: {
        title: normalizedWord,
        definition: normalizedDefinition || null,
        resource_type: "link",
        url: normalizedUrl,
      },
    };
  }
  if (attachmentType === "file") {
    return {
      values: {
        title: normalizedWord,
        definition: normalizedDefinition || null,
        resource_type: "file",
        url: null,
      },
    };
  }
  return { error: "Choose no attachment, a link, or a file." };
}

export function normalizeVocabularyLessonNumber(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^lesson\s*#?\s*/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 160);
}

export function buildVocabularyLessonIdsByNumber(planRows) {
  const idsByNumber = new Map();
  for (const row of planRows || []) {
    const lesson = row?.curriculum_lessons;
    const lessonNumber = normalizeVocabularyLessonNumber(lesson?.source_lesson_code);
    if (!lesson?.id || !lessonNumber) continue;
    const ids = idsByNumber.get(lessonNumber) || new Set();
    ids.add(lesson.id);
    idsByNumber.set(lessonNumber, ids);
  }
  return new Map([...idsByNumber].map(([lessonNumber, ids]) => [lessonNumber, [...ids]]));
}

function isVocabularyCsvHeader(fields) {
  const first = String(fields[0] || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const third = String(fields[2] || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return ["word", "term", "vocabularyword"].includes(first) &&
    ["lesson", "lessonnumber", "lessoncode"].includes(third);
}

// Small RFC 4180-style parser so definitions may safely contain commas,
// quotation marks, or line breaks without adding a browser-only dependency.
export function parseLessonVocabularyCsv(value) {
  const text = String(value || "").replace(/^\uFEFF/, "");
  const records = [];
  let fields = [];
  let field = "";
  let quoted = false;
  let rowNumber = 1;
  let recordStartRow = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
        if (character === "\n") rowNumber += 1;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      fields.push(field);
      records.push({ fields, rowNumber: recordStartRow });
      fields = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      rowNumber += 1;
      recordStartRow = rowNumber;
    } else {
      field += character;
    }
  }

  if (quoted) return { rows: [], errors: ["The CSV has an unclosed quotation mark."] };
  if (field || fields.length > 0) {
    fields.push(field);
    records.push({ fields, rowNumber: recordStartRow });
  }

  const nonBlank = records.filter((record) => record.fields.some((item) => String(item).trim()));
  const dataRecords = nonBlank.length > 0 && isVocabularyCsvHeader(nonBlank[0].fields)
    ? nonBlank.slice(1)
    : nonBlank;
  const rows = [];
  const errors = [];

  for (const record of dataRecords) {
    if (record.fields.length !== 3) {
      errors.push(`Row ${record.rowNumber} must have exactly 3 columns.`);
      continue;
    }
    const word = String(record.fields[0] || "").trim();
    const definition = String(record.fields[1] || "").trim();
    const lessonNumber = String(record.fields[2] || "").trim();
    if (!word) errors.push(`Row ${record.rowNumber} is missing a vocabulary word.`);
    if (!lessonNumber) errors.push(`Row ${record.rowNumber} is missing a lesson number.`);
    if (word && lessonNumber) rows.push({ word, definition, lessonNumber, rowNumber: record.rowNumber });
  }

  if (dataRecords.length === 0) errors.push("The CSV does not contain any vocabulary rows.");
  if (dataRecords.length > LESSON_VOCABULARY_CSV_MAX_ROWS) {
    errors.push(`A CSV can contain at most ${LESSON_VOCABULARY_CSV_MAX_ROWS} vocabulary rows.`);
  }
  return { rows, errors };
}

export function normalizeLessonResourceEdit({ resourceType, title, url }) {
  const normalizedTitle = normalizeLessonResourceTitle(title, "");
  if (!normalizedTitle) return { error: "Enter a display name." };

  if (resourceType === "link") {
    const normalizedUrl = normalizeLessonResourceUrl(url);
    if (!normalizedUrl) return { error: "Enter a valid http or https link." };
    return { values: { title: normalizedTitle, url: normalizedUrl } };
  }

  if (resourceType === "file") {
    return { values: { title: normalizedTitle } };
  }

  return { error: "Resource type is not editable." };
}

// Every lesson scheduled in a class, once each, in the order the class first
// teaches it (rows arrive ordered by class_date, lesson_slot). Feeds the resource
// editor's Lesson picker, which must reach lessons that are not on the day being
// edited -- the day's own lesson list cannot move a resource anywhere else.
export function buildCourseLessonOptions(planRows) {
  const seen = new Set();
  const options = [];
  for (const row of planRows || []) {
    const lesson = row?.curriculum_lessons;
    if (!lesson?.id || seen.has(lesson.id)) continue;
    seen.add(lesson.id);
    options.push({ id: lesson.id, label: formatLessonLabel(lesson.source_lesson_code, lesson.title) });
  }
  return options;
}

// Builds the class-dependent lesson menus for the All Classes bulk resource
// editor. Courses keep the grid's display order, while each lesson appears once
// at the first date where it occurs in the visible two-week window.
export function buildGridLessonCourseOptions(courses, planRows) {
  const rowsByCourse = new Map();
  for (const row of planRows || []) {
    const rows = rowsByCourse.get(row.course_id) || [];
    rows.push(row);
    rowsByCourse.set(row.course_id, rows);
  }

  return (courses || [])
    .map((course) => {
      const seen = new Set();
      const lessons = [];
      for (const row of rowsByCourse.get(course.id) || []) {
        const lesson = row?.curriculum_lessons;
        if (!lesson?.id || seen.has(lesson.id)) continue;
        seen.add(lesson.id);
        lessons.push({
          id: lesson.id,
          classDate: row.class_date,
          label: formatLessonLabel(lesson.source_lesson_code, lesson.title),
        });
      }
      return { id: course.id, title: course.title, lessons };
    })
    .filter((course) => course.lessons.length > 0);
}

export function formatLessonResourceSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
