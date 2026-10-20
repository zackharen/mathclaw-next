// ECC Statistics & Probability (half-year, asynchronous), transcribed from the
// live syllabus Google Doc (1pp9SJSMjAbv-aOUev2MI_OgKaha4zvmtxIJFygqXMjI) on
// 2026-10-20. Its "Posted" and "Due" columns are Google date chips; these are
// the calendar dates they display. Nothing here is a release *time*.
//
// Course facts from the syllabus: Tue/Thu office hours 6–7 p.m. (subject to
// change; not release times). Weights: Assessments 35%, Participation 20%,
// Performance Tasks 35%, Portfolio 10%. Snorkl is due the following Thursday,
// or the next open Tue/Thu when school is closed, and is not posted during
// final-exam review.

export const ECC_STATISTICS_LIBRARY = {
  providerCode: "teacher_syllabus",
  providerName: "Teacher Syllabus",
  classCode: "ECC-STATS",
  className: "ECC Statistics & Probability",
};

export const ECC_STATISTICS_COURSE = {
  title: "ECC | Statistics & Probability",
  start: "2026-09-29",
  end: "2027-01-26",
  timezone: "America/New_York",
};

// Release 3 p.m. / due 11:59 p.m. are the conventions reported for Zack's
// existing ECC courses. Not confirmed against the shared school brain (it could
// not be read on 2026-10-20), so every row keeps them editable.
export const DEFAULT_RELEASE_TIME = "15:00";
export const DEFAULT_DUE_TIME = "23:59";

// kind: lesson | review | exam. snorkl: weekly Snorkl number on that row.
export const ECC_STATISTICS_SCHEDULE = [
  { release: "2026-09-29", code: "1.01", title: "Frequency Distributions & Their Graphs", kind: "lesson", due: "2026-10-06" },
  { release: "2026-10-01", code: "1.02", title: "Data Classification", kind: "lesson", snorkl: 1, due: "2026-10-08" },
  { release: "2026-10-06", code: "1.03", title: "Measures of Central Tendency", kind: "lesson", due: "2026-10-13" },
  { release: "2026-10-08", code: "1.04", title: "Z-Scores", kind: "lesson", snorkl: 2, due: "2026-10-15" },
  { release: "2026-10-13", code: "1.05", title: "Measures of Position", kind: "lesson", due: "2026-10-20" },
  { release: "2026-10-15", code: "Exam 1 Review", title: "Exam 1 Review", kind: "review", snorkl: 3, due: "2026-10-22" },
  { release: "2026-10-20", code: "Exam 1", title: "Exam 1", kind: "exam", due: "2026-10-27" },
  { release: "2026-10-22", code: "2.01", title: "Basic Concepts of Probability & Counting", kind: "lesson", snorkl: 4, due: "2026-10-29" },
  { release: "2026-10-27", code: "2.02", title: "Probability Distributions & Expected Value", kind: "lesson", due: "2026-11-03" },
  { release: "2026-10-29", code: "2.03", title: "Additional Topics in Probability & Counting", kind: "lesson", snorkl: 5, due: "2026-11-10" },
  { release: "2026-11-03", code: "2.04", title: "Binomial Distributions", kind: "lesson", due: "2026-11-10" },
  { release: "2026-11-10", code: "2.05", title: "Conditional Probability & the Multiplication Rule", kind: "lesson", due: "2026-11-17" },
  { release: "2026-11-12", code: "Exam 2 Review", title: "Exam 2 Review", kind: "review", snorkl: 6, due: "2026-11-19" },
  { release: "2026-11-17", code: "Exam 2", title: "Exam 2", kind: "exam", due: "2026-11-24" },
  { release: "2026-11-19", code: "3.01", title: "Introduction to Normal Distributions and the Standard Normal Distribution", kind: "lesson", snorkl: 7, due: "2026-12-01" },
  { release: "2026-11-24", code: "3.02", title: "Central Limit Theorem", kind: "lesson", due: "2026-12-01" },
  { release: "2026-12-01", code: "3.03", title: "Normal Approximations to Binomial Distributions", kind: "lesson", due: "2026-12-08" },
  { release: "2026-12-03", code: "Exam 3 Review", title: "Exam 3 Review", kind: "review", snorkl: 8, due: "2026-12-10" },
  { release: "2026-12-08", code: "Exam 3", title: "Exam 3", kind: "exam", due: "2026-12-15" },
  { release: "2026-12-10", code: "4.01", title: "Confidence Intervals for the Mean (Large Samples)", kind: "lesson", snorkl: 9, due: "2026-12-17" },
  { release: "2026-12-15", code: "4.02", title: "Confidence Intervals for the Mean (Large Samples), Part 2", kind: "lesson", due: "2026-12-22" },
  { release: "2026-12-17", code: "4.03", title: "Confidence Intervals for Population Proportions", kind: "lesson", snorkl: 10, due: "2027-01-05" },
  { release: "2027-01-05", code: "Exam 4 Review", title: "Exam 4 Review", kind: "review", due: "2027-01-12" },
  { release: "2027-01-07", code: "Exam 4", title: "Exam 4", kind: "exam", due: "2027-01-14" },
  { release: "2027-01-12", code: "Final Exam Reviews 1 & 2", title: "Final Exam Reviews 1 & 2", kind: "review", reviews: [1, 2], due: "2027-01-19" },
  { release: "2027-01-14", code: "Final Exam Reviews 3 & 4", title: "Final Exam Reviews 3 & 4", kind: "review", reviews: [3, 4], due: "2027-01-21" },
  { release: "2027-01-19", code: "Final Exam", title: "Final Exam", kind: "exam", final: true, due: "2027-01-26" },
];

const SNORKL_NOTE =
  "Syllabus rubric: 4 points (accuracy and explanation); resubmission allowed. Existing Schoology items reportedly use 100 points; the gradebook scale is unchanged here. Snorkl assignment link not yet verified.";

// Every distinct assignment a syllabus row creates. Each has a stable key so a
// rerun finds it instead of adding a copy. Links are never invented: anything
// missing one stays a draft.
export function assignmentsForRow(row, rowIndex) {
  const base = { assignment_date: row.release, due_date: row.due, lessonCode: row.code };
  const items = [];
  const add = (key, fields) => items.push({ ...base, source_key: `ecc-stats:${row.code}:${key}`, sort_order: rowIndex * 10 + items.length, is_draft: true, ...fields });

  if (row.kind === "lesson") {
    add("video", { label: `${row.code} Lesson Video`, category: "participation", provider: "Edpuzzle", notes: "Edpuzzle link not yet verified." });
    add("practice", {
      label: `${row.code} Practice`,
      category: "participation",
      provider: null,
      notes: "Syllabus: DeltaMath, or Wayground for some lessons. Confirm the platform and link.",
    });
    add("notes", {
      label: `${row.code} Notes`,
      category: "portfolio",
      provider: "Schoology",
      notes: "Copy the lesson notes in your notebook, take a picture, and submit it on Schoology. Notes file/link not yet verified.",
    });
  } else if (row.kind === "review" && row.reviews) {
    for (const number of row.reviews) {
      add(`review-${number}`, {
        label: `Final Exam Review ${number}`,
        category: null,
        provider: null,
        notes: "Review contents and grade category are not listed in the syllabus. Confirm in Schoology.",
      });
    }
  } else if (row.kind === "review") {
    add("review", {
      label: row.title,
      category: null,
      provider: null,
      notes: "Review contents and grade category are not listed in the syllabus. Confirm in Schoology.",
    });
  } else if (row.kind === "exam") {
    add("exam", {
      label: row.title,
      category: "assessments",
      provider: row.final ? null : "Wayground",
      notes: row.final
        ? "Syllabus does not name the final exam's platform. Confirm it and the link."
        : "Unit assessment on Wayground (formerly Quizizz). Link not yet verified.",
    });
  }

  if (row.snorkl) {
    add(`snorkl-${row.snorkl}`, {
      label: `Weekly Snorkl ${row.snorkl}`,
      category: "performance_tasks",
      provider: "Snorkl",
      notes: SNORKL_NOTE,
    });
  }
  return items;
}

function mondayOf(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

// One weekly check-in for each week with a release. The syllabus gives no due
// date, so none is set.
export function weeklyCheckIns(schedule = ECC_STATISTICS_SCHEDULE) {
  const firstReleaseByWeek = new Map();
  for (const row of schedule) {
    const week = mondayOf(row.release);
    if (!firstReleaseByWeek.has(week)) firstReleaseByWeek.set(week, row.release);
  }
  return [...firstReleaseByWeek.entries()].map(([week, release], index) => {
    const [, month, day] = week.split("-").map(Number);
    return {
      assignment_date: release,
      due_date: null,
      lessonCode: null,
      source_key: `ecc-stats:check-in:${week}`,
      sort_order: 900 + index,
      label: `Weekly Check-in (week of ${month}/${day})`,
      category: "portfolio",
      provider: null,
      is_draft: true,
      notes: "Check in on Zoom or in person this week. The syllabus sets no due date.",
    };
  });
}

export function buildEccStatisticsSetup(schedule = ECC_STATISTICS_SCHEDULE) {
  const lessons = schedule.map((row, index) => ({
    sequence_index: index + 1,
    source_lesson_code: row.code,
    title: row.title,
    release: row.release,
  }));
  const assignments = [
    ...schedule.flatMap((row, index) => assignmentsForRow(row, index)),
    ...weeklyCheckIns(schedule),
  ].map((item) => ({ ...item, release_time: DEFAULT_RELEASE_TIME, due_time: item.due_date ? DEFAULT_DUE_TIME : null }));
  return { lessons, assignments };
}
