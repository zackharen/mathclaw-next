// Prints idempotent SQL that loads the ECC Statistics & Probability syllabus.
//
//   node scripts/ecc-statistics-setup-sql.mjs                # library + lessons only
//   node scripts/ecc-statistics-setup-sql.mjs <course-uuid>  # also that class's releases + assignments
//
// Create the class first through MathClaw (/classes/new: library "ECC Statistics
// & Probability", pacing "Syllabus Dates"), then run the course step with its id.
// Safe to rerun: rows are matched by library sequence, lesson, and source_key, and
// existing rows (including manual edits and completion) are never updated.
import { buildEccStatisticsSetup, ECC_STATISTICS_LIBRARY } from "../lib/planning/syllabi/ecc-statistics.js";
import { buildSetupSql } from "../lib/planning/syllabi/setup-sql.js";

const courseId = process.argv[2] || null;
if (courseId && !/^[0-9a-f-]{36}$/i.test(courseId)) {
  console.error("Course id must be a UUID.");
  process.exit(1);
}

process.stdout.write(buildSetupSql({ library: ECC_STATISTICS_LIBRARY, setup: buildEccStatisticsSetup(), courseId }));
