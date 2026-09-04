import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSON_RESOURCE_MAX_BYTES,
  getLessonResourceSiteSuggestion,
  lessonResourceMimeType,
  normalizeLessonResourceUrl,
  normalizeLessonResourceHostname,
  normalizeLessonResourceSiteName,
  sanitizeLessonResourceFileName,
  validateLessonResourceFile,
} from "../lib/lesson-resources/constants.js";

test("lesson resource links accept only http and https URLs", () => {
  assert.equal(normalizeLessonResourceUrl("https://example.com/lesson"), "https://example.com/lesson");
  assert.equal(normalizeLessonResourceUrl("javascript:alert(1)"), "");
  assert.equal(normalizeLessonResourceUrl("not a link"), "");
});

test("lesson resource links normalize hostnames and recognize known sites", () => {
  assert.equal(normalizeLessonResourceHostname("https://www.openmiddle.com/tasks/12"), "openmiddle.com");
  assert.deepEqual(getLessonResourceSiteSuggestion("https://teacher.desmos.com/activitybuilder"), {
    hostname: "teacher.desmos.com",
    name: "Desmos",
    source: "known",
  });
  assert.deepEqual(getLessonResourceSiteSuggestion("https://openmiddle.com/problem/1"), {
    hostname: "openmiddle.com",
    name: "Open Middle",
    source: "known",
  });
});

test("lesson resource links prefer a teacher's saved site name and flag new sites", () => {
  assert.deepEqual(
    getLessonResourceSiteSuggestion("https://activities.example.org/task", {
      "activities.example.org": "My Activity Bank",
    }),
    { hostname: "activities.example.org", name: "My Activity Bank", source: "saved" }
  );
  assert.deepEqual(getLessonResourceSiteSuggestion("https://new.example.org/task"), {
    hostname: "new.example.org",
    name: "",
    source: "unknown",
  });
  assert.equal(normalizeLessonResourceSiteName("  My   Resource Site  "), "My Resource Site");
});

test("lesson resource uploads infer common Office MIME types from file names", () => {
  assert.equal(
    lessonResourceMimeType("activity.docx", ""),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(lessonResourceMimeType("data.xlsx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("lesson resource uploads enforce supported types and the 25 MB limit", () => {
  assert.deepEqual(validateLessonResourceFile({ name: "notes.pdf", size: 2000, type: "application/pdf" }), {
    mimeType: "application/pdf",
  });
  assert.match(
    validateLessonResourceFile({ name: "archive.zip", size: 2000, type: "application/zip" }).error,
    /supported/
  );
  assert.match(
    validateLessonResourceFile({ name: "large.pdf", size: LESSON_RESOURCE_MAX_BYTES + 1, type: "application/pdf" }).error,
    /25 MB/
  );
});

test("storage file names cannot inject folders or unsafe punctuation", () => {
  assert.equal(sanitizeLessonResourceFileName("Unit 1 / Answer Key?.pdf"), "Unit-1-Answer-Key-.pdf");
});
