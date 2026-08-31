import test from "node:test";
import assert from "node:assert/strict";

import {
  announcementTemplateForCourse,
  shouldIncludeCurriculumDoNow,
} from "../lib/announcements/curriculum-content.js";

const template = `Day #{day_number} | {date} | {ab_day} | {schedule_type}
Lesson: {lesson_title}
Objective: {objective}
Standards: {standards}

{assignments}

{teacher_absences}`;

test("curriculum courses keep their full announcement template", () => {
  assert.equal(announcementTemplateForCourse(template, true), template);
  assert.equal(shouldIncludeCurriculumDoNow(true, true), true);
});

test("no-curriculum courses omit curriculum lines and curriculum-driven Do Nows", () => {
  assert.equal(
    announcementTemplateForCourse(template, false),
    `Day #{day_number} | {date} | {ab_day} | {schedule_type}

{assignments}

{teacher_absences}`
  );
  assert.equal(shouldIncludeCurriculumDoNow(true, false), false);
});

test("no-curriculum filtering recognizes unlabeled curriculum placeholders", () => {
  assert.equal(
    announcementTemplateForCourse("{lesson_title}\n{objective}\n{standards}\n{quote}", false),
    "{quote}"
  );
});
