import { Fragment } from "react";
import { eligibleCourse } from "@/lib/assessments/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { getCourseAccessForUser, getCourseWriteClient } from "@/lib/courses/access";
import { listGamesWithCourseSettings } from "@/lib/student-games/game-controls";
import {
  markLessonCompleteAction,
  markLessonPlannedAction,
  updateABMeetingDaysAction,
  updateCourseDateRangeAction,
} from "./actions";
import {
  generateCalendarAction,
  updateScheduleAction,
  updateCalendarDayAction,
} from "../calendar/actions";
import CopyButton from "../announcements/copy-button";
import { generateAnnouncementsAction } from "../announcements/actions";
import ABScheduleForm from "./ab-schedule-form";
import ApplyCalendarSubmit from "./apply-calendar-submit";
import LessonResourceLibrarySharing from "./lesson-resource-library-sharing";
import LessonResourcesPanel from "./lesson-resources-panel";
import LessonVocabularyPanel from "./lesson-vocabulary-panel";
import VocabularyCsvImport from "./vocabulary-csv-import";
import ManageClassVocabulary from "./manage-class-vocabulary";
import AssessmentFolder, { AssessmentResourceList } from "./assessment-folder";
import AssessmentSupportsPanel from "./assessment-supports-panel";
import PlanScrollMemory from "./scroll-memory";
import AllClassesGrid from "./all-classes-grid";
import LessonCountToggle from "./lesson-count-toggle";
import { isCalendarWeekStart, isGraceDay, normalizeCalendarDayType } from "@/lib/school-calendar";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";
import { loadLessonResourcePlanningData } from "@/lib/lesson-resources/server";
import { buildCourseLessonOptions } from "@/lib/lesson-resources/constants";
import { splitLessonDaysForFold } from "@/lib/planning/completed-days";
import { courseShowsCalendarDay } from "@/lib/planning/meeting-days";
import { loadAssessmentFolderData, occurrenceKey } from "@/lib/assessment-resources/server";
import { buildAssessmentCoverage, coverageByWeek } from "@/lib/announcements/assessment-coverage";
import { formatAnnouncementAssignmentDate, isWeeklyAssessmentRule, weekStartIso } from "@/lib/announcements/assignment-rules";
import { loadTeacherAssessmentSupportsData } from "@/lib/assessment-supports/server";
import { loadSkippedLessonIds } from "@/lib/planning/skipped-lessons";
import { loadCustomLessons, loadLessonSwaps } from "@/lib/planning/lesson-swaps";
import LessonSwapBar from "./lesson-swap-bar";
import CustomLessonForm, { RemoveCustomLessonButton } from "./custom-lesson-form";
import { isFixedDatesCourse } from "@/lib/planning/fixed-dates";
import { loadDatedAssignments } from "@/lib/planning/dated-assignments";
import SyllabusSchedulePanel from "./syllabus-schedule-panel";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";
const LESSON_WINDOW_PAST_DAYS = 5;
const LESSON_WINDOW_FUTURE_DAYS = 45;
const LESSON_SKILL_RULES = [
  {
    slug: "integer_practice",
    match: ["integer", "negative", "positive", "add integers", "subtract integers", "absolute value"],
    why: "Build fluency with signed-number operations and number-line thinking.",
  },
  {
    slug: "number_compare",
    match: ["compare", "greater than", "less than", "order numbers", "decimal", "fraction", "place value"],
    why: "Give students quick comparison reps across tricky number forms.",
  },
  {
    slug: "money_counting",
    match: ["money", "coin", "bill", "dollar", "cent", "value of coins", "making change"],
    why: "Reinforce coin and bill value with fast amount-building practice.",
  },
  {
    slug: "telling_time",
    match: ["time", "clock", "hour", "minute", "elapsed time", "analog"],
    why: "Support clock reading and time-setting with visual repetition.",
  },
  {
    slug: "slope_intercept",
    match: ["slope", "y-intercept", "linear", "graph", "coordinate plane", "rate of change"],
    why: "Give students graph-reading reps with lines and intercepts.",
  },
  {
    slug: "spiral_review",
    match: ["review", "mixed practice", "spiral", "warm-up", "do now", "check for understanding"],
    why: "Mix prior skills together when the lesson needs cumulative review.",
  },
  {
    slug: "question_kind_review",
    match: ["question type", "word problem", "problem type", "recognize", "classify", "identify the kind"],
    why: "Help students notice what a problem is asking before they solve it.",
  },
  {
    slug: "sudoku",
    match: ["logic", "patterns", "perseverance", "reasoning", "grid"],
    why: "Add a structured logic challenge when the lesson leans on reasoning habits.",
  },
  {
    slug: "comet_typing",
    match: ["typing", "keyboard", "fluency", "speed", "accuracy"],
    why: "Build keyboard fluency and accuracy during tech-heavy routines.",
  },
];

const GAME_LABELS = {
  "2048": "2048",
  connect4: "Connect4",
  integer_practice: "Adding & Subtracting Integers",
  money_counting: "Money Counting",
  minesweeper: "Minesweeper",
  number_compare: "Which Number Is Bigger?",
  spiral_review: "Spiral Review",
  question_kind_review: "What Kind Of Question Is This?",
  telling_time: "Telling Time",
  slope_intercept: "Slope & Y-Intercept",
  sudoku: "Sudoku",
  comet_typing: "Comet Typing",
};
const WEEKDAY_MODIFIER_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

function hasCurriculum(course) {
  return Boolean(course?.selected_library_id);
}

function normalizePacingMode(value) {
  if (value === "two_lessons_unless_modified") return "two_lessons_per_day";
  return value || "one_lesson_per_day";
}

function normalizeWeekdayModifiers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const modifiers = {};
  for (const [weekday, modifier] of Object.entries(raw)) {
    if (!["1", "2", "3", "4", "5"].includes(String(weekday))) continue;
    if (modifier === "no_lesson" || modifier === "one_less") {
      modifiers[String(weekday)] = modifier;
    }
  }
  return modifiers;
}

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function prettyDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseUTCDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoFromUTCDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(iso, days) {
  const date = parseUTCDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromUTCDate(date);
}

function clampIsoDate(value, min, max) {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}


function gameHref(slug, courseId) {
  const query = courseId ? `?course=${encodeURIComponent(courseId)}` : "";
  if (slug === "integer_practice") return `/play/integer-practice${query}`;
  if (slug === "money_counting") return `/play/money-counting${query}`;
  if (slug === "number_compare") return `/play/number-compare${query}`;
  if (slug === "spiral_review") return `/play/spiral-review${query}`;
  if (slug === "question_kind_review") return `/play/question-kind-review${query}`;
  if (slug === "telling_time") return `/play/telling-time${query}`;
  if (slug === "slope_intercept") return `/play/slope-intercept${query}`;
  if (slug === "comet_typing") return `/play/comet-typing${query}`;
  return `/play/${slug}${query}`;
}

function findSuggestedSkills({ lesson, enabledGames }) {
  if (!lesson) return [];

  const haystack = `${lesson.source_lesson_code || ""} ${lesson.title || ""} ${lesson.objective || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  return LESSON_SKILL_RULES.filter((rule) => enabledGames.has(rule.slug)).filter((rule) =>
    rule.match.some((needle) => haystack.includes(needle))
  ).slice(0, 3);
}

export default async function ClassPlanPage({ params, searchParams }) {
  const pageStart = process.hrtime.bigint();
  const { id } = await params;
  const qs = (await searchParams) || {};
  const calendarUpdated = qs.calendar_updated === "1";
  const calendarCopied = qs.calendar_copied === "1";
  const abUpdated = qs.ab_updated === "1";
  const progressUpdated = qs.progress_updated === "1";
  const announcementsUpdated = qs.announcements_updated === "1";
  const announcementsFailed = qs.announcements_failed === "1";
  const pacingUpdated = qs.pacing_updated === "1";
  const dateRangeUpdated = qs.date_range_updated === "1";
  const imported = qs.imported === "1";
  const scheduleUpdated = qs.schedule_updated === "1";
  const SYLLABUS_ERRORS = {
    label: "Give the assignment a name.",
    "release-date": "Choose a release date inside this class's dates.",
    "due-date": "Choose a due date inside this class's dates, on or after the release date.",
    category: "Choose one of the listed categories.",
    url: "Links must start with http:// or https://.",
    lesson: "That lesson isn't on this class's schedule.",
    duplicate: "This class already has an assignment with that name on that release date.",
    "move-past-due": "One of that lesson's assignments is due before the new release date. Change its due date first, or move the lesson without its assignments.",
    missing: "That item no longer exists. Refresh and try again.",
    "not-syllabus": "Only syllabus-date classes have a Syllabus Schedule.",
  };
  const syllabusMessage = qs.syllabus_error
    ? { kind: "error", text: SYLLABUS_ERRORS[qs.syllabus_error] || "That change couldn't be saved." }
    : qs.syllabus_updated === "1"
      ? {
          kind: "ok",
          text: announcementsFailed
            ? "Saved, but announcements didn't update. Use Refresh Announcements."
            : "Saved. Announcements updated.",
        }
      : null;
  const SWAP_ERRORS = {
    "pick-two": "Check exactly two lessons to switch.",
    syllabus: "This class follows syllabus release dates, so lessons can't be switched here.",
    "not-ready": "Switching lessons isn't set up yet.",
    missing: "One of those lessons moved. Refresh and pick again.",
    completed: "Completed lessons can't be switched.",
    same: "Those are the same lesson. Pick two different lessons.",
    "not-saved": "That switch wasn't saved. Refresh and try again.",
  };
  const CUSTOM_LESSON_ERRORS = {
    missing: "That lesson or day changed. Refresh and try again.",
    title: "Give the custom lesson a title (120 characters or fewer).",
    objective: "Keep the objective to 500 characters or fewer.",
    syllabus: "This class follows syllabus release dates, so custom lessons can't be added here.",
    "not-ready": "Custom lessons aren't set up yet.",
    "no-planned": "That day has no planned lesson to add in front of.",
    completed: "Completed lessons can't be removed.",
    "not-saved": "That change wasn't saved. Refresh and try again.",
  };
  const doneText = (what) =>
    announcementsFailed
      ? `${what}, but announcements didn't update. Use Refresh Announcements.`
      : `${what}. Announcements updated.`;
  const swapMessage = qs.swap_error
    ? { kind: "error", text: SWAP_ERRORS[qs.swap_error] || "Those lessons couldn't be switched." }
    : qs.custom_lesson_error
      ? { kind: "error", text: CUSTOM_LESSON_ERRORS[qs.custom_lesson_error] || "That custom lesson change couldn't be saved." }
      : qs.lessons_swapped === "1"
        ? { kind: "ok", text: doneText("Lessons switched") }
        : qs.custom_lesson_added === "1"
          ? { kind: "ok", text: doneText("Custom lesson added") }
          : qs.custom_lesson_removed === "1"
            ? { kind: "ok", text: doneText("Custom lesson removed") }
            : null;
  const completedActionMessages = scheduleUpdated
    ? [
        "Schedule Updated!",
        calendarCopied ? "Calendar copied to other classes." : null,
      ].filter(Boolean)
    : [
        dateRangeUpdated ? "Class Dates Updated!" : null,
        pacingUpdated ? "Pacing Mode Updated!" : null,
        calendarUpdated ? "Calendar Updated!" : null,
        abUpdated ? "AB Schedule Updated!" : null,
        progressUpdated ? "Progress Updated!" : null,
        imported ? "Calendar Imported!" : null,
        calendarCopied ? "Calendar copied to other classes." : null,
        announcementsUpdated ? "Announcements Updated!" : null,
        announcementsFailed ? "Lessons saved, but announcements didn't update. Use Refresh Announcements." : null,
      ].filter(Boolean);

  const cookieStore = await cookies();
  const hideSuggestions = cookieStore.get("hide_arcade_suggestions")?.value === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/plan`);
  }
  const [accountType, access] = await Promise.all([
    getAccountTypeForUser(supabase, user),
    getCourseAccessForUser(
      supabase,
      user.id,
      id,
      "id, title, class_name, selected_library_id, schedule_model, ab_meeting_day, school_year_start, school_year_end, pacing_mode, pacing_weekday_modifiers, owner_id"
    ),
  ]);
  const course = access?.course;

  if (!course) {
    redirect("/classes");
  }
  // All Classes view (toggle in the pinned title bar): skip this class's heavy
  // plan loading entirely and render the cross-class grid instead.
  if (cookieStore.get("class_plan_view")?.value === "grid") {
    return <AllClassesGrid currentCourseId={course.id} userId={user.id} gridStartParam={qs.grid_start} />;
  }
  const courseDataClient = getCourseWriteClient(access, supabase);
  const curriculumEnabled = hasCurriculum(course);

  const dataFetchStart = process.hrtime.bigint();
  const todayIso = new Date().toISOString().slice(0, 10);
  const lessonWindowFocusDate = clampIsoDate(
    todayIso,
    course.school_year_start,
    course.school_year_end
  );
  const showFullLessonYear = qs.show_all_lessons === "1";
  const lessonWindowStart = showFullLessonYear
    ? course.school_year_start
    : clampIsoDate(addDays(lessonWindowFocusDate, -LESSON_WINDOW_PAST_DAYS), course.school_year_start, course.school_year_end);
  const lessonWindowEnd = showFullLessonYear
    ? course.school_year_end
    : clampIsoDate(addDays(lessonWindowFocusDate, LESSON_WINDOW_FUTURE_DAYS), course.school_year_start, course.school_year_end);
  const [
    lessonsCountRes,
    calendarDaysRes,
    reasonsRes,
    planSummaryRes,
    planDetailsRes,
    announcementsCountRes,
    announcementDetailsRes,
    gamesRes,
    schoolDaysRes,
    markingPeriodRulesRes,
    skippedLessons,
    lessonSwaps,
    customLessons,
    assessmentFolderData,
    assessmentSupportsData,
    courseLessonsRes,
    profileRes,
    datedAssignmentRows,
  ] = await Promise.all([
    curriculumEnabled
      ? supabase
          .from("curriculum_lessons")
          .select("id", { count: "exact", head: true })
          .eq("library_id", course.selected_library_id)
      : Promise.resolve({ count: 0 }),
    courseDataClient
      .from("course_calendar_days")
      .select("class_date, day_type, is_grace_day, ab_day, reason_id, note, lesson_count_override")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true }),
    supabase
      .from("day_off_reasons")
      .select("id, label")
      .or(`owner_id.is.null,owner_id.eq.${user.id}`)
      .order("label", { ascending: true }),
    courseDataClient
      .from("course_lesson_plan")
      .select("class_date, lesson_slot, status")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true })
      .order("lesson_slot", { ascending: true }),
    courseDataClient
      .from("course_lesson_plan")
      .select(
        "class_date, lesson_slot, status, curriculum_lessons(id, sequence_index, source_lesson_code, title, objective, course_id)"
      )
      .eq("course_id", course.id)
      .gte("class_date", lessonWindowStart)
      .lte("class_date", lessonWindowEnd)
      .order("class_date", { ascending: true })
      .order("lesson_slot", { ascending: true }),
    courseDataClient
      .from("course_announcements")
      .select("class_date", { count: "exact", head: true })
      .eq("course_id", course.id),
    courseDataClient
      .from("course_announcements")
      .select("class_date, content")
      .eq("course_id", course.id)
      .gte("class_date", lessonWindowStart)
      .lte("class_date", lessonWindowEnd)
      .order("class_date", { ascending: true }),
    listGamesWithCourseSettings(supabase, course.id, { viewerAccountType: accountType || "teacher" }),
    // No lower bound: day numbers count from the teacher's school year, which
    // can start before a half-year class does.
    supabase
      .from("school_calendar_days")
      .select("class_date, day_type")
      .eq("owner_id", user.id)
      .lte("class_date", course.school_year_end)
      .order("class_date", { ascending: true }),
    supabase
      .from("teacher_marking_period_rules")
      .select("id, name, start_day_number, end_day_number")
      .eq("owner_id", user.id)
      .order("start_day_number", { ascending: true }),
    curriculumEnabled ? loadSkippedLessonIds(courseDataClient, [course.id]).catch(() => null) : Promise.resolve(null),
    curriculumEnabled && !isFixedDatesCourse(course)
      ? loadLessonSwaps(courseDataClient, [course.id]).catch(() => null)
      : Promise.resolve(null),
    curriculumEnabled && !isFixedDatesCourse(course)
      ? loadCustomLessons(courseDataClient, [course.id]).catch(() => null)
      : Promise.resolve(null),
    curriculumEnabled
      ? loadAssessmentFolderData({ userId: user.id, course })
      : Promise.resolve(null),
    loadTeacherAssessmentSupportsData({ supabase, course }),
    // Full school year, not the visible lesson window: the resource editor's
    // Lesson picker has to reach lessons outside the days on screen.
    courseDataClient
      .from("course_lesson_plan")
      .select("class_date, lesson_slot, curriculum_lessons(id, source_lesson_code, title)")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true })
      .order("lesson_slot", { ascending: true }),
    supabase.from("profiles").select("school_year_start, school_year_end").eq("id", user.id).maybeSingle(),
    isFixedDatesCourse(course) ? loadDatedAssignments(courseDataClient, course.id) : Promise.resolve([]),
  ]);
  const fixedDates = isFixedDatesCourse(course);
  const canSwapLessons = Boolean(lessonSwaps?.available);
  const canAddCustomLessons = canSwapLessons && Boolean(customLessons?.available);

  // Skipped lessons are not taught, so they don't count toward this class's
  // total; custom lessons are added to it.
  const totalLessonsCount = Math.max(
    (lessonsCountRes.count || 0) +
      (customLessons?.byCourse.get(course.id)?.length || 0) -
      (skippedLessons?.byCourse.get(course.id)?.length || 0),
    0
  );
  const calendarDays = calendarDaysRes.data || [];
  const reasons = reasonsRes.data || [];
  const planSummaryRows = planSummaryRes.data || [];
  const planRows = planDetailsRes.data || [];
  const planError = planSummaryRes.error || planDetailsRes.error;
  const announcements = announcementDetailsRes.data || [];
  const announcementCount = announcementsCountRes.count || 0;
  const enabledGames = new Set((gamesRes || []).filter((game) => game.enabled).map((game) => game.slug));
  const schoolDays = schoolDaysRes.data || [];
  const markingPeriodRules = markingPeriodRulesRes.data || [];
  // The only load that needs the first wave: resources for the lessons on screen.
  const lessonResourceData = await loadLessonResourcePlanningData({
    userId: user.id,
    lessonIds: planRows.map((row) => row.curriculum_lessons?.id).filter(Boolean),
  });
  const courseLessonOptions = buildCourseLessonOptions(courseLessonsRes.data || []);

  // Build school-day# map by walking all weekdays in the school year,
  // using school_calendar_days only to identify off days (same logic as profile page).
  const schoolDayByDate = new Map(schoolDays.map((d) => [d.class_date, d]));
  const schoolDayNumberByDate = new Map();
  if (course.school_year_start && course.school_year_end) {
    const dayNumberStart = [profileRes?.data?.school_year_start, course.school_year_start].filter(Boolean).sort()[0];
    const [sy, sm, sd] = dayNumberStart.split("-").map(Number);
    const [ey, em, ed] = course.school_year_end.split("-").map(Number);
    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const endDate = new Date(Date.UTC(ey, em - 1, ed));
    let dayNum = 0;
    while (cursor <= endDate) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const iso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
        const row = schoolDayByDate.get(iso);
        if (row?.day_type !== "off") {
          dayNum += 1;
          schoolDayNumberByDate.set(iso, dayNum);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Map each date to its marking period name
  function getMarkingPeriodName(classDate) {
    const dayNum = schoolDayNumberByDate.get(classDate);
    if (!dayNum) return null;
    for (const rule of markingPeriodRules) {
      if (dayNum >= rule.start_day_number && dayNum <= rule.end_day_number) {
        return rule.name;
      }
    }
    return null;
  }

  if (PERF_ENABLED) {
    console.info(
      `[perf] ClassPlanPage course=${course.id} fetchMs=${Number((process.hrtime.bigint() - dataFetchStart) / 1000000n)} totalMs=${Number((process.hrtime.bigint() - pageStart) / 1000000n)} calendarDays=${calendarDays.length} planSummaryRows=${planSummaryRows.length} planDetailRows=${planRows.length} announcements=${announcements.length} window=${lessonWindowStart}:${lessonWindowEnd} full=${showFullLessonYear}`
    );
  }

  const announcementByDate = new Map(
    announcements.map((a) => [a.class_date, a.content])
  );
  const calendarByDate = new Map(calendarDays.map((d) => [d.class_date, d]));
  const planRowsByDate = new Map();
  for (const row of planRows) {
    const rows = planRowsByDate.get(row.class_date) || [];
    rows.push(row);
    planRowsByDate.set(row.class_date, rows);
  }
  const reasonById = new Map(reasons.map((reason) => [reason.id, reason.label]));
  const pacingMode = normalizePacingMode(course.pacing_mode);
  const weekdayModifiers = normalizeWeekdayModifiers(course.pacing_weekday_modifiers);
  const assessmentOccurrenceByKey = new Map(
    (assessmentFolderData?.occurrences || []).map((item) => [occurrenceKey(item.rule_id, item.original_date), item])
  );
  const assessmentResourcesByDate = new Map();
  for (const resource of assessmentFolderData?.resources || []) {
    const occurrence = assessmentOccurrenceByKey.get(occurrenceKey(resource.rule_id, resource.original_date));
    if (!occurrence || occurrence.is_skipped) continue;
    const items = assessmentResourcesByDate.get(occurrence.assignment_date) || [];
    items.push({ ...resource, assignment_date: occurrence.assignment_date });
    assessmentResourcesByDate.set(occurrence.assignment_date, items);
  }
  const assessmentLessonLabelById = new Map(
    (assessmentFolderData?.lessons || []).map((lesson) => [
      lesson.id,
      formatLessonLabel(lesson.source_lesson_code, lesson.title),
    ])
  );

  // What each week's assessment covers, shown after the week's last class day.
  const hasWeeklyAssessment = (assessmentFolderData?.rules || []).some(isWeeklyAssessmentRule);
  const assessmentCoverageByWeek = hasWeeklyAssessment
    ? coverageByWeek(
        buildAssessmentCoverage({
          rules: assessmentFolderData.rules,
          occurrences: assessmentFolderData.occurrences,
          planRows: (courseLessonsRes.data || []).map((row) => ({
            class_date: row.class_date,
            lesson_slot: row.lesson_slot,
            code: row.curriculum_lessons?.source_lesson_code || "",
          })),
        })
      )
    : null;
  const lastVisibleDayByWeek = new Map();

  const meetsA = course.ab_meeting_day !== "B";
  const meetsB = course.ab_meeting_day !== "A";

  // A syllabus class lists only days with a release or a due date; the other
  // weekdays have nothing to teach or announce.
  const syllabusDates = new Set([
    ...(courseLessonsRes.data || []).map((row) => row.class_date),
    ...datedAssignmentRows.flatMap((row) => [row.assignment_date, row.due_date]).filter(Boolean),
  ]);
  const visibleCalendarDays = calendarDays.filter((day) =>
    fixedDates ? syllabusDates.has(day.class_date) : courseShowsCalendarDay(course, day)
  );
  const visibleLessonDays = visibleCalendarDays.filter(
    (day) => day.class_date >= lessonWindowStart && day.class_date <= lessonWindowEnd
  );
  for (const day of visibleLessonDays) lastVisibleDayByWeek.set(weekStartIso(day.class_date), day.class_date);
  const hiddenLessonDayCount = Math.max(visibleCalendarDays.length - visibleLessonDays.length, 0);

  const instructionalDaysCount = visibleCalendarDays.filter(
    (d) => d.day_type === "instructional"
  ).length;
  const plannedCount = planSummaryRows?.length || 0;
  const lastPlanRow = planSummaryRows[planSummaryRows.length - 1] || null;
  const projectedEnd = curriculumEnabled
    ? (lastPlanRow?.class_date || course.school_year_end)
    : null;

  return (
    <div className="stack">
      <section className="card">
        <div className="kv">
          <div>
            <strong>Class Days</strong>
            <span>{visibleCalendarDays.length || 0}</span>
          </div>
          <div>
            <strong>Full Days</strong>
            <span>{instructionalDaysCount || 0}</span>
          </div>
          <div>
            <strong>Library Lessons</strong>
            <span>{totalLessonsCount || 0}</span>
          </div>
          <div>
            <strong>Planned Lessons</strong>
            <span>{plannedCount}</span>
          </div>
          <div>
            <strong>Generated Announcements</strong>
            <span>{announcementCount}</span>
          </div>
          {projectedEnd ? (
            <div>
              <strong>Projected Final Lesson Date</strong>
              <span>{shortDate(projectedEnd)}</span>
            </div>
          ) : null}
        </div>
      </section>

      {!curriculumEnabled ? (
        <section className="card">
          <h2>No-Curriculum Class</h2>
          <p>
            This class is using calendar and arcade tools without a curriculum lesson track. You can still manage the
            calendar, join students, use awards, and run games, but lesson-by-day pacing is intentionally turned off.
          </p>
        </section>
      ) : null}

      <section className="card" id="modify-calendar">
        <h2>Modify Calendar</h2>

        <div className="classPlanControlStack">
          <form action={updateCourseDateRangeAction} className="inlineControlForm classPlanDateForm">
            <input type="hidden" name="course_id" value={course.id} />
            <input
              className="input"
              type="text"
              name="school_year_start"
              defaultValue={shortDate(course.school_year_start)}
              placeholder="M/D/YYYY"
              aria-label="Class start date"
              style={{ width: 110 }}
            />
            <input
              className="input"
              type="text"
              name="school_year_end"
              defaultValue={shortDate(course.school_year_end)}
              placeholder="M/D/YYYY"
              aria-label="Class end date"
              style={{ width: 110 }}
            />
            <button className="btn" type="submit">Update Dates</button>
          </form>

          <div className="classPlanControlRow classPlanControlRowSchedule">
            <form id="class-plan-schedule-form" action={updateScheduleAction} className="inlineControlForm classPlanPacingForm">
              <input type="hidden" name="course_id" value={course.id} />
              {fixedDates ? (
                <>
                  <input type="hidden" name="pacing_mode" value="fixed_dates" />
                  <span className="classPlanFixedPacing">Pacing: Syllabus release dates (calendar changes never move them)</span>
                </>
              ) : (
              <>
              <select
                className="input"
                name="pacing_mode"
                defaultValue={pacingMode}
                style={{ minWidth: 240 }}
              >
                <option value="one_lesson_per_day">Pacing: 1 Lesson Per Day</option>
                <option value="one_lesson_no_half_days">Pacing: 1 Lesson Per Day (No Half Days)</option>
                <option value="two_lessons_per_day">Pacing: 2 Lessons Per Day</option>
                <option value="manual_complete">Pacing: Manual (Move On When Complete)</option>
              </select>
              <details className="inlineDetails pacingModifierDetails">
                <summary className="btn">Modified Day Rules</summary>
                <div className="controlExpandedPanel pacingModifierPanel">
                  <div className="pacingModifierHeader">
                    <span>Day</span>
                    <span>No Lesson</span>
                    <span>One Less Lesson</span>
                  </div>
                  {WEEKDAY_MODIFIER_OPTIONS.map((day) => (
                    <div className="pacingModifierRow" key={day.value}>
                      <strong>{day.label}</strong>
                      <label className="calendarSelectCell">
                        <input
                          type="checkbox"
                          name={`pacing_weekday_no_lesson__${day.value}`}
                          defaultChecked={weekdayModifiers[day.value] === "no_lesson"}
                        />
                        <span>No Lesson</span>
                      </label>
                      <label className="calendarSelectCell">
                        <input
                          type="checkbox"
                          name={`pacing_weekday_one_less__${day.value}`}
                          defaultChecked={weekdayModifiers[day.value] === "one_less"}
                        />
                        <span>One Less</span>
                      </label>
                    </div>
                  ))}
                </div>
              </details>
              </>
              )}
            </form>

            {calendarDays.length > 0 && course.schedule_model === "ab" ? (
              <details className="inlineDetails">
                <summary className="btn">AB Schedule?</summary>
                <div className="controlExpandedPanel">
                  <ABScheduleForm
                    courseId={course.id}
                    initialA={meetsA}
                    initialB={meetsB}
                    action={updateABMeetingDaysAction}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </div>

        {calendarDays.length === 0 ? (
          <div className="classPlanControlRow classPlanControlRowApply">
            <ApplyCalendarSubmit formId="class-plan-schedule-form" />
            <form action={generateCalendarAction}>
              <input type="hidden" name="course_id" value={course.id} />
              <button className="btn primary" type="submit">
                Generate Calendar
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="classPlanControlRow classPlanControlRowApply">
              <div className="inlineControlForm classPlanCalendarApplyForm">
                <label className="calendarSelectCell">
                  <input type="checkbox" name="copy_to_all" value="1" form="class-plan-schedule-form" />
                  <span>Apply to all my classes</span>
                </label>
                <ApplyCalendarSubmit formId="class-plan-schedule-form" />
              </div>
            </div>

            <div className="classPlanControlRow classPlanControlRowTools">
              <details className="inlineDetails">
                <summary className="btn editorSummary">
                  <span className="showLabel">Show Full Calendar Editor</span>
                  <span className="hideLabel">Hide Full Calendar Editor</span>
                </summary>
                <div className="controlExpandedPanel controlExpandedPanelWide">
                    <div className="calendarBulkTools">
                      <strong>Selected Days</strong>
                      <select className="input" name="selected_bulk_scope" defaultValue="checked" form="class-plan-schedule-form">
                        <option value="checked">Apply To: Checked Days</option>
                        <option value="all_visible">Apply To: All Visible Days</option>
                      </select>
                      <select className="input" name="selected_day_type" defaultValue="" form="class-plan-schedule-form">
                        <option value="">Choose Day Type</option>
                        <option value="instructional">Full</option>
                        <option value="off">Off</option>
                        <option value="half">Half Day</option>
                        <option value="modified">Activity Day</option>
                      </select>
                      <select className="input" name="selected_reason_id" defaultValue="" form="class-plan-schedule-form">
                        <option value="">Keep Row Reason</option>
                        <option value="__clear__">Clear Reason</option>
                        {reasons.map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="calendarGridHeaderNoAction">
                      <span>Select</span>
                      <span>Date</span>
                      <span>MP</span>
                      <span>AB</span>
                      <span>Grace Day</span>
                      <span>Day Type</span>
                      <span>Reason</span>
                      <span>Note</span>
                    </div>
                    <div className="calendarGridBody">
                      {visibleCalendarDays.map((day) => (
                        <div
                          className={`calendarRowNoAction${isCalendarWeekStart(day.class_date) ? " calendarWeekStart" : ""}`}
                          key={day.class_date}
                        >
                          <label className="calendarSelectCell">
                            <input type="checkbox" name="selected_class_date" value={day.class_date} form="class-plan-schedule-form" />
                            <span>Select</span>
                          </label>
                          <span>{prettyDate(day.class_date)}</span>
                          <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{getMarkingPeriodName(day.class_date) || "—"}</span>
                          <span>{day.ab_day || "-"}</span>
                          <label className="calendarSelectCell">
                            <input
                              type="checkbox"
                              name={`grace_day__${day.class_date}`}
                              defaultChecked={isGraceDay(day)}
                              aria-label={`Grace Day for ${prettyDate(day.class_date)}`}
                              form="class-plan-schedule-form"
                            />
                            <span>Grace</span>
                          </label>
                          <select
                            className="input"
                            name={`day_type__${day.class_date}`}
                            defaultValue={normalizeCalendarDayType(day.day_type)}
                            form="class-plan-schedule-form"
                          >
                            <option value="instructional">Full</option>
                            <option value="off">Off</option>
                            <option value="half">Half Day</option>
                            <option value="modified">Activity Day</option>
                          </select>
                          <select
                            className="input"
                            name={`reason_id__${day.class_date}`}
                            defaultValue={day.reason_id || ""}
                            form="class-plan-schedule-form"
                          >
                            <option value="">None</option>
                            {reasons.map((reason) => (
                              <option key={reason.id} value={reason.id}>
                                {reason.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input"
                            name={`note__${day.class_date}`}
                            defaultValue={day.note || ""}
                            placeholder="Optional"
                            form="class-plan-schedule-form"
                          />
                        </div>
                      ))}
                    </div>
                </div>
              </details>
            </div>

          </>
        )}
        {calendarDays.length > 0 || completedActionMessages.length > 0 ? (
          <div className="classPlanCompletedActionSpace" aria-live="polite">
            {calendarDays.length > 0 && !fixedDates ? (
              <span>
                AB Days: {meetsA ? "A" : ""}
                {meetsA && meetsB ? " + " : ""}
                {meetsB ? "B" : ""}
              </span>
            ) : null}
            {completedActionMessages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        ) : null}
      </section>

      {fixedDates ? (
        <SyllabusSchedulePanel
          courseId={course.id}
          courseStart={course.school_year_start}
          courseEnd={course.school_year_end}
          planRows={courseLessonsRes.data || []}
          assignments={datedAssignmentRows}
          message={syllabusMessage}
        />
      ) : null}

      {eligibleCourse(course) && user.id === course.owner_id ? <section className="card"><h2>Online assessment &amp; Desmos</h2><div className="ctaRow"><Link className="btn" href={`/assessment?course=${course.id}`}>Manage assessments</Link><Link className="btn" href={`/desmos?course=${course.id}`}>Desmos assignments &amp; mastery</Link></div></section> : null}

      {assessmentFolderData?.available && !fixedDates ? (
        <AssessmentFolder
          courseId={course.id}
          ownerId={user.id}
          occurrences={assessmentFolderData.occurrences}
          lessons={assessmentFolderData.lessons}
          initialResources={assessmentFolderData.resources}
          initialDefaultLessonIds={assessmentFolderData.defaultLessonIds}
          defaultLessonCount={assessmentFolderData.defaultLessonCount}
          initialSiteNames={lessonResourceData.siteNames}
        />
      ) : null}

      {assessmentSupportsData?.available ? (
        <AssessmentSupportsPanel courseId={course.id} initialData={assessmentSupportsData} />
      ) : null}

      <section className="card" id="lesson-by-day">
        <div className="classPlanWorkspaceHeader">
          <div>
            <h2>Daily Plan &amp; Announcements</h2>
            <p>Review the lesson, mark it complete, and copy the day&apos;s announcement in one place.</p>
          </div>
          <div className="classPlanWorkspaceActions">
            {lessonResourceData.available ? (
              <LessonResourceLibrarySharing
                connectedTeachers={lessonResourceData.connectedTeachers}
                initialTeacherIds={lessonResourceData.librarySharedWith}
              />
            ) : null}
            {calendarDays.length > 0 ? (
              <form action={generateAnnouncementsAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <button className="btn" type="submit">
                  {announcementCount > 0 ? "Refresh Announcements" : "Generate Announcements"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {lessonResourceData.vocabularyAvailable && curriculumEnabled ? (
          <>
            <ManageClassVocabulary
              ownerId={user.id}
              courses={[{ id: course.id, title: course.title }]}
            />
            <VocabularyCsvImport courses={[{ id: course.id, title: course.title }]} />
          </>
        ) : null}
        {canSwapLessons ? (
          <LessonSwapBar key={`${qs.t || ""}-${qs.swap_error || ""}-${qs.custom_lesson_error || ""}`} courseId={course.id} message={swapMessage} />
        ) : null}
        {!curriculumEnabled ? (
          <p>This class does not have a curriculum track attached, so there are no lesson assignments to pace here.</p>
        ) : null}
        {planError ? <p>Could not load pacing plan: {planError.message}</p> : null}

        {!planError && curriculumEnabled && visibleCalendarDays.length === 0 ? (
          <p>No class days in calendar yet.</p>
        ) : null}

        {!planError && curriculumEnabled && visibleCalendarDays.length > 0 ? (
          <>
            {!showFullLessonYear && hiddenLessonDayCount > 0 ? (
              <div className="classPlanWindowNotice" style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                margin: "0 0 0.9rem",
                padding: "0.75rem 0.9rem",
                border: "2px solid #d7e6f2",
                borderRadius: "8px",
                background: "#f8fbfd",
                color: "var(--navy)",
                fontWeight: 700,
              }}>
                <span>
                  Showing {visibleLessonDays.length} nearby class day{visibleLessonDays.length === 1 ? "" : "s"}.
                </span>
                <Link className="btn" href={`/classes/${course.id}/plan?show_all_lessons=1#lesson-by-day`}>
                  Show Full Year
                </Link>
              </div>
            ) : showFullLessonYear ? (
              <div className="classPlanWindowNotice" style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                margin: "0 0 0.9rem",
                padding: "0.75rem 0.9rem",
                border: "2px solid #d7e6f2",
                borderRadius: "8px",
                background: "#f8fbfd",
                color: "var(--navy)",
                fontWeight: 700,
              }}>
                <span>Showing the full lesson year.</span>
                <Link className="btn" href={`/classes/${course.id}/plan#lesson-by-day`}>
                  Show Nearby Days
                </Link>
              </div>
            ) : null}
            <div className="list">
            {(() => {
              const { foldedDays, openDays, nextClassDate } = splitLessonDaysForFold({
                days: visibleLessonDays,
                rowsByDate: planRowsByDate,
                todayIso,
              });
              const renderLessonDay = (day) => {
              const dayPlanRows = planRowsByDate.get(day.class_date) || [];
              const firstLesson = dayPlanRows[0]?.curriculum_lessons;
              const lessonOptions = dayPlanRows.reduce((options, row) => {
                const lesson = row.curriculum_lessons;
                if (!lesson?.id || options.some((option) => option.id === lesson.id)) return options;
                options.push({
                  id: lesson.id,
                  label: formatLessonLabel(lesson.source_lesson_code, lesson.title),
                });
                return options;
              }, []);
              const lessonIdsForDay = new Set(lessonOptions.map((lesson) => lesson.id));
              const ownResourcesForDay = lessonResourceData.ownResources.filter((resource) =>
                resource.item_kind !== "vocabulary" &&
                resource.lessonIds.some((lessonId) => lessonIdsForDay.has(lessonId))
              );
              const sharedResourcesForDay = lessonResourceData.sharedResources.filter((resource) =>
                resource.item_kind !== "vocabulary" &&
                resource.lessonIds.some((lessonId) => lessonIdsForDay.has(lessonId))
              );
              const vocabularyForDay = lessonResourceData.ownResources.filter((resource) =>
                resource.item_kind === "vocabulary" &&
                resource.lessonIds.some((lessonId) => lessonIdsForDay.has(lessonId))
              );
              const suggestedSkills = findSuggestedSkills({ lesson: firstLesson, enabledGames });
              const announcementText = announcementByDate.get(day.class_date) || "";
              const reasonLabel = day.reason_id ? reasonById.get(day.reason_id) : null;
              const dayStatus =
                dayPlanRows.length === 0
                  ? "No lesson scheduled"
                  : dayPlanRows.every((row) => row.status === "completed")
                    ? "completed"
                    : dayPlanRows.some((row) => row.status === "completed")
                      ? "partly completed"
                      : "planned";
              const noLessonLabel =
                fixedDates
                  ? `No new release${day.day_type === "off" ? " | No School" : ""}`
                  : day.day_type === "off"
                  ? "No School"
                  : isGraceDay(day)
                    ? "Grace Day"
                    : "No lesson scheduled";
              const mpName = getMarkingPeriodName(day.class_date);
              const schoolDayNum = schoolDayNumberByDate.get(day.class_date);
              const assessmentResourcesForDay = assessmentResourcesByDate.get(day.class_date) || [];
              const hasCompletedLesson = dayPlanRows.some((row) => row.status === "completed");
              const lessonCountReturnTo = `/classes/${course.id}/plan#plan-day-${day.class_date}`;

              if (dayPlanRows.length === 0) {
                return (
                  <article
                    key={day.class_date}
                    className={`card${isCalendarWeekStart(day.class_date) ? " calendarWeekStart" : ""}`}
                    style={{ background: "#fff" }}
                  >
                    <h3 id={`plan-day-${day.class_date}`}>{prettyDate(day.class_date)}{mpName ? <span style={{ fontSize: "0.75rem", fontWeight: "normal", opacity: 0.6, marginLeft: "0.5rem" }}>{mpName}{schoolDayNum ? ` · Day #${schoolDayNum}` : ""}</span> : schoolDayNum ? <span style={{ fontSize: "0.75rem", fontWeight: "normal", opacity: 0.6, marginLeft: "0.5rem" }}>Day #{schoolDayNum}</span> : null}</h3>
                    <p>
                      {noLessonLabel}{reasonLabel ? ` | ${reasonLabel}` : ""}
                    </p>
                    {day.note ? <p>{day.note}</p> : null}
                    <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
                      Day Type: {day.day_type === "modified" ? "activity" : normalizeCalendarDayType(day.day_type)}{isGraceDay(day) ? " · Grace Day" : ""}
                    </p>

                    {day.day_type !== "off" && !isGraceDay(day) && !fixedDates ? (
                      <LessonCountToggle
                        courseId={course.id}
                        classDate={day.class_date}
                        currentCount={day.lesson_count_override ?? 0}
                        returnTo={lessonCountReturnTo}
                      />
                    ) : null}

                    {announcementText ? (
                      <pre className="announcementText">{announcementText}</pre>
                    ) : null}

                    {assessmentResourcesForDay.length ? (
                      <div className="assessmentDayResources">
                        <strong>Assessment Resources</strong>
                        <AssessmentResourceList
                          resources={assessmentResourcesForDay}
                          lessonLabelById={assessmentLessonLabelById}
                          compact
                        />
                      </div>
                    ) : null}

                    <div className="ctaRow compactDayActions">
                      {announcementText ? <CopyButton text={announcementText} /> : null}
                      <details className="dayModifyDetails">
                        <summary className="btn">Modify This Day</summary>
                        <form
                          className="calendarRow calendarRowWithGrace"
                          action={updateCalendarDayAction}
                          style={{ marginTop: "0.6rem" }}
                          data-auto-regenerate-target="1"
                        >
                          <input type="hidden" name="course_id" value={course.id} />
                          <input type="hidden" name="class_date" value={day.class_date} />
                          <span>{prettyDate(day.class_date)}</span>
                          <span>{day.ab_day || "-"}</span>
                          <select className="input" name="day_type" defaultValue={normalizeCalendarDayType(day.day_type)}>
                            <option value="instructional">Full</option>
                            <option value="off">Off</option>
                            <option value="half">Half Day</option>
                            <option value="modified">Activity Day</option>
                          </select>
                          <label className="calendarSelectCell">
                            <input type="checkbox" name="is_grace_day" defaultChecked={isGraceDay(day)} />
                            <span>Grace Day</span>
                          </label>
                          <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                            <option value="">None</option>
                            {reasons.map((reason) => (
                              <option key={reason.id} value={reason.id}>
                                {reason.label}
                              </option>
                            ))}
                          </select>
                          <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                          <button className="btn" type="submit">Save</button>
                        </form>
                      </details>
                    </div>
                  </article>
                );
              }

              return (
                <article
                  key={day.class_date}
                  id={day.class_date === nextClassDate ? "next-class-day" : undefined}
                  className={`card${isCalendarWeekStart(day.class_date) ? " calendarWeekStart" : ""}`}
                  style={{ background: "#fff" }}
                >
                  <h3 id={`plan-day-${day.class_date}`}>{prettyDate(day.class_date)}{mpName ? <span style={{ fontSize: "0.75rem", fontWeight: "normal", opacity: 0.6, marginLeft: "0.5rem" }}>{mpName}{schoolDayNum ? ` · Day #${schoolDayNum}` : ""}</span> : schoolDayNum ? <span style={{ fontSize: "0.75rem", fontWeight: "normal", opacity: 0.6, marginLeft: "0.5rem" }}>Day #{schoolDayNum}</span> : null}</h3>
                  <div className="classPlanDayWorkspace">
                    <section className="classPlanDayPane classPlanLessonPane">
                      <div className="classPlanDayPaneHeader">
                        <strong>Lesson Plan</strong>
                        <div className="classPlanLessonHeaderControls">
                          {fixedDates ? null : (
                            <LessonCountToggle
                              courseId={course.id}
                              classDate={day.class_date}
                              currentCount={day.lesson_count_override ?? dayPlanRows.length}
                              returnTo={lessonCountReturnTo}
                              disabled={hasCompletedLesson}
                            />
                          )}
                          <span className={`classPlanStatus classPlanStatus-${dayStatus.replaceAll(" ", "-")}`}>
                            {dayStatus}
                          </span>
                        </div>
                      </div>
                      <div className="lessonPlanList">
                        {dayPlanRows.map((row, index) => {
                          const lesson = row.curriculum_lessons;
                          const lessonLabel = lesson
                            ? formatLessonLabel(lesson?.source_lesson_code, lesson?.title)
                            : "No lesson assigned yet.";
                          const objectiveText = lesson?.objective
                            ? lesson.objective
                            : lesson
                              ? "No objective provided."
                              : "Add full days and click Update Schedule.";

                          return (
                            <div className="lessonPlanItem" key={`${day.class_date}-${row.lesson_slot || index + 1}`}>
                              <div className="lessonPlanItemTitle">
                                <p>
                                  <strong>Lesson {index + 1}:</strong> {lessonLabel}
                                  {lesson?.course_id ? <span className="customLessonBadge">Custom</span> : null}
                                </p>
                                {canSwapLessons && lesson && row.status !== "completed" ? (
                                  <label className="lessonSwapPick" title="Check two lessons to switch them">
                                    <input
                                      type="checkbox"
                                      name="swap_lesson"
                                      form="lesson-swap-form"
                                      value={`${day.class_date}|${row.lesson_slot}`}
                                      aria-label={`Switch ${lessonLabel}`}
                                    />
                                    <span>Switch</span>
                                  </label>
                                ) : null}
                              </div>
                              <p>{objectiveText}</p>
                              {canAddCustomLessons && lesson?.course_id === course.id && row.status !== "completed" ? (
                                <div className="customLessonItemActions">
                                  <RemoveCustomLessonButton
                                    courseId={course.id}
                                    classDate={day.class_date}
                                    lessonId={lesson.id}
                                    lessonLabel={lessonLabel}
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {!hideSuggestions && suggestedSkills.length > 0 ? (
                        <div className="lessonSkillBlock">
                          <strong>Suggested MathClaw Skills</strong>
                          <div className="lessonSkillGrid">
                            {suggestedSkills.map((skill) => (
                              <div key={`${day.class_date}-${skill.slug}`} className="lessonSkillCard">
                                <div>
                                  <p className="lessonSkillTitle">{GAME_LABELS[skill.slug] || skill.slug}</p>
                                  <p className="lessonSkillWhy">{skill.why}</p>
                                </div>
                                <Link className="btn" href={gameHref(skill.slug, course.id)}>
                                  Open Skill
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {pacingMode === "manual_complete" ? (
                        <p className="classPlanManualPacingNote">
                          Manual pacing mode: this lesson repeats until you click Mark Complete.
                        </p>
                      ) : null}
                      <div className="ctaRow classPlanPaneActions">
                        {dayPlanRows.every((row) => row.status === "completed") ? (
                          <form action={markLessonPlannedAction}>
                            <input type="hidden" name="course_id" value={course.id} />
                            <input type="hidden" name="class_date" value={day.class_date} />
                            <button className="btn primary" type="submit">Completed</button>
                          </form>
                        ) : (
                          <form action={markLessonCompleteAction}>
                            <input type="hidden" name="course_id" value={course.id} />
                            <input type="hidden" name="class_date" value={day.class_date} />
                            <button className="btn" type="submit">Mark Complete</button>
                          </form>
                        )}
                        {canAddCustomLessons && dayPlanRows.some((row) => row.status !== "completed" && row.curriculum_lessons) ? (
                          <CustomLessonForm courseId={course.id} classDate={day.class_date} />
                        ) : null}
                      </div>
                    </section>

                    <section className="classPlanDayPane classPlanAnnouncementPane">
                      <div className="classPlanDayPaneHeader">
                        <strong>Announcement</strong>
                      </div>
                      {announcementText ? (
                        <pre className="announcementText">{announcementText}</pre>
                      ) : (
                        <p className="classPlanEmptyAnnouncement">
                          No announcement generated for this day yet.
                        </p>
                      )}
                      {announcementText ? (
                        <div className="ctaRow classPlanPaneActions">
                          <CopyButton text={announcementText} />
                        </div>
                      ) : null}
                    </section>
                  </div>

                  {lessonResourceData.available && lessonOptions.length > 0 ? (
                    <LessonResourcesPanel
                      courseId={course.id}
                      classDate={day.class_date}
                      ownerId={user.id}
                      lessonOptions={lessonOptions}
                      courseLessonOptions={courseLessonOptions}
                      initialOwnResources={ownResourcesForDay}
                      sharedResources={sharedResourcesForDay}
                      connectedTeachers={lessonResourceData.connectedTeachers}
                      initialSiteNames={lessonResourceData.siteNames}
                    />
                  ) : null}

                  {lessonResourceData.vocabularyAvailable && lessonOptions.length > 0 ? (
                    <LessonVocabularyPanel
                      courseId={course.id}
                      classDate={day.class_date}
                      ownerId={user.id}
                      lessonOptions={lessonOptions}
                      initialVocabulary={vocabularyForDay}
                    />
                  ) : null}

                  {assessmentResourcesForDay.length ? (
                    <div className="assessmentDayResources">
                      <strong>Assessment Resources</strong>
                      <AssessmentResourceList
                        resources={assessmentResourcesForDay}
                        lessonLabelById={assessmentLessonLabelById}
                        compact
                      />
                    </div>
                  ) : null}

                  <div className="ctaRow compactDayActions classPlanDayControls">
                    <details className="dayModifyDetails">
                      <summary className="btn">Modify This Day</summary>
                      <form
                        className="calendarRow calendarRowWithGrace"
                        action={updateCalendarDayAction}
                        style={{ marginTop: "0.6rem" }}
                        data-auto-regenerate-target="1"
                      >
                        <input type="hidden" name="course_id" value={course.id} />
                        <input type="hidden" name="class_date" value={day.class_date} />
                        <span>{prettyDate(day.class_date)}</span>
                        <span>{day.ab_day || "-"}</span>
                        <select className="input" name="day_type" defaultValue={normalizeCalendarDayType(day.day_type)}>
                          <option value="instructional">Full</option>
                          <option value="off">Off</option>
                          <option value="half">Half Day</option>
                          <option value="modified">Activity Day</option>
                        </select>
                        <label className="calendarSelectCell">
                          <input type="checkbox" name="is_grace_day" defaultChecked={isGraceDay(day)} />
                          <span>Grace Day</span>
                        </label>
                        <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                          <option value="">None</option>
                          {reasons.map((reason) => (
                            <option key={reason.id} value={reason.id}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                        <button className="btn" type="submit">Save</button>
                      </form>
                    </details>
                  </div>
                </article>
              );
              };
              const renderDayWithAssessment = (day) => {
                const week = weekStartIso(day.class_date);
                if (!assessmentCoverageByWeek || lastVisibleDayByWeek.get(week) !== day.class_date) {
                  return renderLessonDay(day);
                }
                const entries = assessmentCoverageByWeek.get(week) || [];
                return (
                  <Fragment key={day.class_date}>
                    {renderLessonDay(day)}
                    <aside className="classPlanAssessmentCoverage" aria-label="This week's assessment">
                      {entries.length ? (
                        entries.map((entry) => (
                          <span key={`${entry.rule_id}-${entry.date}`}>
                            <strong>
                              {entry.label} · {formatAnnouncementAssignmentDate(entry.date)}
                            </strong>
                            {" — "}
                            {entry.codes.length ? `Covers ${entry.codes.join(", ")}` : "No new lessons"}
                          </span>
                        ))
                      ) : (
                        <span>No assessment this week. These lessons roll into next week&apos;s assessment.</span>
                      )}
                    </aside>
                  </Fragment>
                );
              };

              return (
                <>
                  {foldedDays.length > 0 ? (
                    <details className="card classPlanAssignmentsDetails classPlanCompletedDays">
                      <summary className="classPlanAssignmentsSummary">
                        <h2>
                          Completed Lessons · {foldedDays.length} day{foldedDays.length === 1 ? "" : "s"}
                        </h2>
                        <span className="classPlanAssignmentsToggle" aria-hidden="true">
                          <span className="showLabel">Show</span>
                          <span className="hideLabel">Hide</span>
                        </span>
                      </summary>
                      <div className="list classPlanAssignmentsBody">{foldedDays.map(renderDayWithAssessment)}</div>
                    </details>
                  ) : null}
                  {openDays.map(renderDayWithAssessment)}
                </>
              );
            })()}
            </div>
          </>
        ) : null}
      </section>
      <PlanScrollMemory />
    </div>
  );
}
