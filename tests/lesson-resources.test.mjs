import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSON_RESOURCE_MAX_BYTES,
  buildCourseLessonOptions,
  buildGridLessonCourseOptions,
  getLessonResourceSiteSuggestion,
  getLessonResourceTitleSuggestion,
  lessonResourceMimeType,
  normalizeLessonResourceEdit,
  normalizeLessonResourceUrl,
  normalizeLessonResourceHostname,
  normalizeLessonResourceSiteName,
  normalizeLessonVocabularyInput,
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

test("IXL links suggest a readable site and skill title", () => {
  const url = "https://www.ixl.com/math/algebra-1/write-variable-equations";
  assert.deepEqual(getLessonResourceSiteSuggestion(url), {
    hostname: "ixl.com",
    name: "IXL",
    source: "known",
  });
  assert.equal(getLessonResourceTitleSuggestion(url), "IXL | Write Variable Equations");
  assert.equal(
    getLessonResourceTitleSuggestion("https://www.ixl.com/math/algebra-1/solve-for-a-variable"),
    "IXL | Solve for a Variable"
  );
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

test("link edits normalize display names and require safe URLs", () => {
  assert.deepEqual(
    normalizeLessonResourceEdit({
      resourceType: "link",
      title: "  Updated   practice  ",
      url: "https://example.com/new lesson",
    }),
    { values: { title: "Updated practice", url: "https://example.com/new%20lesson" } }
  );
  assert.match(
    normalizeLessonResourceEdit({ resourceType: "link", title: "Practice", url: "javascript:alert(1)" }).error,
    /valid http or https/
  );
});

test("file edits change only the display name", () => {
  assert.deepEqual(
    normalizeLessonResourceEdit({ resourceType: "file", title: "  Unit 1 Notes  ", url: "https://ignored.test" }),
    { values: { title: "Unit 1 Notes" } }
  );
});

test("lesson vocabulary accepts a word with no attachment", () => {
  assert.deepEqual(
    normalizeLessonVocabularyInput({
      word: "  slope   intercept  ",
      definition: "  Where a line crosses the y-axis.  ",
      attachmentType: "none",
      url: "",
    }),
    {
      values: {
        title: "slope intercept",
        definition: "Where a line crosses the y-axis.",
        resource_type: "none",
        url: null,
      },
    }
  );
});

test("lesson vocabulary validates optional links and files", () => {
  assert.deepEqual(
    normalizeLessonVocabularyInput({
      word: "Quadratic",
      definition: "",
      attachmentType: "link",
      url: "https://example.com/vocabulary card",
    }),
    {
      values: {
        title: "Quadratic",
        definition: null,
        resource_type: "link",
        url: "https://example.com/vocabulary%20card",
      },
    }
  );
  assert.deepEqual(
    normalizeLessonVocabularyInput({
      word: "Coefficient",
      definition: "A number multiplying a variable.",
      attachmentType: "file",
      url: "",
    }).values,
    {
      title: "Coefficient",
      definition: "A number multiplying a variable.",
      resource_type: "file",
      url: null,
    }
  );
  assert.match(
    normalizeLessonVocabularyInput({
      word: "Function",
      definition: "",
      attachmentType: "link",
      url: "javascript:alert(1)",
    }).error,
    /valid http or https/
  );
});

test("course lesson options list each scheduled lesson once, in teaching order", () => {
  const rows = [
    { curriculum_lessons: { id: "b", source_lesson_code: "1.02", title: "Defining Limits" } },
    { curriculum_lessons: { id: "a", source_lesson_code: "1.01", title: "1.01: Change at an Instant" } },
    { curriculum_lessons: { id: "b", source_lesson_code: "1.02", title: "Defining Limits" } },
    { curriculum_lessons: null },
    {},
  ];
  assert.deepEqual(buildCourseLessonOptions(rows), [
    { id: "b", label: "1.02: Defining Limits" },
    { id: "a", label: "1.01: Change at an Instant" },
  ]);
  assert.deepEqual(buildCourseLessonOptions(null), []);
});

test("grid bulk resource options stay scoped to visible classes and lessons", () => {
  const courses = [
    { id: "course-b", title: "Class B" },
    { id: "course-a", title: "Class A" },
    { id: "course-empty", title: "Empty" },
  ];
  const planRows = [
    {
      course_id: "course-a",
      class_date: "2026-09-14",
      curriculum_lessons: { id: "lesson-1", source_lesson_code: "1.01", title: "First" },
    },
    {
      course_id: "course-b",
      class_date: "2026-09-15",
      curriculum_lessons: { id: "lesson-2", source_lesson_code: "2.01", title: "Second" },
    },
    {
      course_id: "course-b",
      class_date: "2026-09-16",
      curriculum_lessons: { id: "lesson-2", source_lesson_code: "2.01", title: "Second" },
    },
  ];

  assert.deepEqual(buildGridLessonCourseOptions(courses, planRows), [
    {
      id: "course-b",
      title: "Class B",
      lessons: [{ id: "lesson-2", classDate: "2026-09-15", label: "2.01: Second" }],
    },
    {
      id: "course-a",
      title: "Class A",
      lessons: [{ id: "lesson-1", classDate: "2026-09-14", label: "1.01: First" }],
    },
  ]);
});
