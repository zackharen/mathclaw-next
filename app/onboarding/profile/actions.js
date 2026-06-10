"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDefaultDisplayName } from "@/lib/auth/account-type";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";
import { generateAnnouncementsForCourse } from "../../classes/[id]/announcements/actions";

function parseDateAtUTC(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function nextAB(current) {
  return current === "A" ? "B" : "A";
}

function isMissingSchoolCalendarTableError(error) {
  const message = String(error?.message || "");
  return message.includes("school_calendar_days");
}

function isMissingTeacherAbsencesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_absences");
}

function isMissingTeacherMarkingPeriodRulesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_marking_period_rules");
}

function isMissingTeacherAnnouncementAssignmentRulesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_announcement_assignment_rules");
}

function isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(error) {
  const message = String(error?.message || "");
  return message.includes("teacher_announcement_assignment_rule_overrides");
}

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDateAtUTC(value);
  return toISODate(parsed) === value;
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (isValidISODate(raw)) return raw;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";

  const [, month, day, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidISODate(iso) ? iso : "";
}

async function regenerateAnnouncementsForTeacherCourses(supabase, userId) {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, owner_id, school_year_start, school_year_end, schedule_model, ab_meeting_day")
    .eq("owner_id", userId);

  if (error) throw new Error(error.message);

  for (const course of courses || []) {
    await generateAnnouncementsForCourse({
      supabase,
      writeClient: supabase,
      userId,
      course,
    });
    revalidatePath(`/classes/${course.id}/plan`);
    revalidatePath(`/classes/${course.id}/announcements`);
  }
}

function parseSchoolCalendarRows(formData) {
  const updates = new Map();

  for (const [key, value] of formData.entries()) {
    if (typeof key !== "string") continue;

    if (key.startsWith("day_type__")) {
      const classDate = key.replace("day_type__", "");
      const row = updates.get(classDate) || {};
      row.day_type = String(value || "");
      updates.set(classDate, row);
    }

    if (key.startsWith("reason_id__")) {
      const classDate = key.replace("reason_id__", "");
      const row = updates.get(classDate) || {};
      row.reason_id = String(value || "");
      updates.set(classDate, row);
    }

    if (key.startsWith("note__")) {
      const classDate = key.replace("note__", "");
      const row = updates.get(classDate) || {};
      row.note = String(value || "");
      updates.set(classDate, row);
    }

    if (key.startsWith("teacher_out__")) {
      const classDate = key.replace("teacher_out__", "");
      const row = updates.get(classDate) || {};
      row.teacher_out = true;
      updates.set(classDate, row);
    }
  }

  return updates;
}

function buildCourseCalendarRows({ course, schoolYearStart, schoolYearEnd, overrideMap }) {
  const start = parseDateAtUTC(schoolYearStart);
  const end = parseDateAtUTC(schoolYearEnd);

  const abStart =
    course.schedule_model === "ab" && course.ab_pattern_start_date
      ? parseDateAtUTC(course.ab_pattern_start_date)
      : null;

  let currentAB = "A";
  if (abStart && abStart > start) currentAB = "A";

  const rows = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const isoDate = toISODate(cursor);
    const dayWeekend = isWeekend(cursor);
    let dayType = dayWeekend ? "off" : "instructional";
    let abDay = null;
    const override = overrideMap.get(isoDate);
    if (override) {
      dayType = override.day_type;
    }

    if (course.schedule_model === "ab") {
      if (dayType !== "off" && (!abStart || cursor >= abStart)) {
        abDay = currentAB;
        currentAB = nextAB(currentAB);
      }
    }

    rows.push({
      course_id: course.id,
      class_date: isoDate,
      day_type: dayType,
      ab_day: abDay,
      reason_id: override?.reason_id || null,
      note: override?.note || null,
    });
  }

  return rows;
}

function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampCount(value) {
  return Math.max(1, Math.min(20, parsePositiveInt(value, 1)));
}

function parseNumberList(values, min, max, limit) {
  const numbers = [];
  for (const value of values) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) continue;
    if (!numbers.includes(parsed)) numbers.push(parsed);
    if (numbers.length >= limit) break;
  }
  return numbers;
}

export async function saveAnnouncementTemplateAction(formData) {
  const bodyTemplate = formData.get("body_template");
  const includeDoNow =
    formData.get("include_do_now") === "on" ||
    formData.get("include_do_now") === "1";
  const includeQuote =
    formData.get("include_quote") === "on" ||
    formData.get("include_quote") === "1";
  const includeDayNumber =
    formData.get("include_day_number") === "on" ||
    formData.get("include_day_number") === "1";
  const includeDayOfWeek =
    formData.get("include_day_of_week") === "on" ||
    formData.get("include_day_of_week") === "1";
  const includeRegularAssignments =
    formData.get("include_regular_assignments") === "on" ||
    formData.get("include_regular_assignments") === "1";
  const regularAssignments = String(formData.get("regular_assignments") || "").trim();
  if (typeof bodyTemplate !== "string") {
    redirect("/onboarding/profile?template_error=1");
  }

  const normalized = bodyTemplate.trim();
  if (!normalized) {
    redirect("/onboarding/profile?template_error=1");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error: clearError } = await supabase
    .from("announcement_templates")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("owner_id", user.id);

  if (clearError) throw new Error(clearError.message);

  const payload = {
    owner_id: user.id,
    name: "Default",
    body_template: normalized,
    include_do_now: includeDoNow,
    include_quote: includeQuote,
    include_day_number: includeDayNumber,
    include_day_of_week: includeDayOfWeek,
    include_regular_assignments: includeRegularAssignments,
    regular_assignments: regularAssignments || null,
    is_default: true,
    is_shared: false,
    updated_at: new Date().toISOString(),
  };

  let { error: upsertError } = await supabase
    .from("announcement_templates")
    .upsert(payload, { onConflict: "owner_id,name" });

  // Backward compatibility if AI block migration was not run.
  if (
    upsertError &&
    typeof upsertError.message === "string" &&
    (upsertError.message.includes("include_do_now") ||
      upsertError.message.includes("include_quote") ||
      upsertError.message.includes("include_day_number") ||
      upsertError.message.includes("include_day_of_week") ||
      upsertError.message.includes("include_regular_assignments") ||
      upsertError.message.includes("regular_assignments"))
  ) {
    const fallbackPayload = {
      owner_id: user.id,
      name: "Default",
      body_template: normalized,
      is_default: true,
      is_shared: false,
      updated_at: new Date().toISOString(),
    };
    const retry = await supabase
      .from("announcement_templates")
      .upsert(fallbackPayload, { onConflict: "owner_id,name" });
    upsertError = retry.error;
  }

  if (upsertError) throw new Error(upsertError.message);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?template_updated=1&t=${Date.now()}`);
}

export async function saveSchoolCalendarAction(formData) {
  const schoolYearStart = normalizeDateInput(formData.get("school_year_start"));
  const schoolYearEnd = normalizeDateInput(formData.get("school_year_end"));

  if (!schoolYearStart || !schoolYearEnd) {
    redirect(`/onboarding/profile?school_calendar_error=date&t=${Date.now()}#school-calendar`);
  }

  if (parseDateAtUTC(schoolYearStart) >= parseDateAtUTC(schoolYearEnd)) {
    redirect(`/onboarding/profile?school_calendar_error=range&t=${Date.now()}#school-calendar`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const admin = createAdminClient();
  let { data: savedProfile, error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      school_year_start: schoolYearStart,
      school_year_end: schoolYearEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id, school_year_start, school_year_end")
    .maybeSingle();

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message);
  }

  if (!savedProfile) {
    const retry = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: buildDefaultDisplayName(user),
          school_year_start: schoolYearStart,
          school_year_end: schoolYearEnd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, school_year_start, school_year_end")
      .maybeSingle();
    savedProfile = retry.data;
    profileUpdateError = retry.error;
  }

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message);
  }

  if (
    !savedProfile ||
    savedProfile.school_year_start !== schoolYearStart ||
    savedProfile.school_year_end !== schoolYearEnd
  ) {
    redirect(`/onboarding/profile?school_calendar_error=profile&t=${Date.now()}#school-calendar`);
  }

  const rawUpdates = parseSchoolCalendarRows(formData);
  const allowed = new Set(["instructional", "off", "half", "modified", "grace_day"]);

  const overrides = [];
  for (const [classDate, row] of rawUpdates.entries()) {
    const dayType = row.teacher_out ? "grace_day" : row.day_type;
    if (!allowed.has(dayType)) continue;

    if (dayType === "instructional") continue;

    overrides.push({
      owner_id: user.id,
      class_date: classDate,
      day_type: dayType,
      reason_id: row.reason_id ? row.reason_id : null,
      note: row.note && row.note.trim() ? row.note.trim() : null,
    });
  }

  const { error: clearOverridesError } = await admin
    .from("school_calendar_days")
    .delete()
    .eq("owner_id", user.id);

  const hasSchoolCalendarTable = !isMissingSchoolCalendarTableError(clearOverridesError);

  if (clearOverridesError && hasSchoolCalendarTable) {
    throw new Error(clearOverridesError.message);
  }

  if (hasSchoolCalendarTable && overrides.length > 0) {
    const { error: insertOverridesError } = await admin
      .from("school_calendar_days")
      .insert(overrides);

    if (insertOverridesError) {
      throw new Error(insertOverridesError.message);
    }
  }

  const overrideMap = new Map(overrides.map((row) => [row.class_date, row]));

  let { data: courses, error: coursesError } = await admin
    .from("courses")
    .select(
      "id, owner_id, schedule_model, ab_meeting_day, ab_pattern_start_date"
    )
    .eq("owner_id", user.id);

  if (
    coursesError &&
    typeof coursesError.message === "string" &&
    coursesError.message.includes("ab_meeting_day")
  ) {
    const retry = await admin
      .from("courses")
      .select("id, owner_id, schedule_model, ab_pattern_start_date")
      .eq("owner_id", user.id);

    courses = (retry.data || []).map((course) => ({ ...course, ab_meeting_day: null }));
    coursesError = retry.error;
  }

  if (coursesError) {
    throw new Error(coursesError.message);
  }

  for (const course of courses || []) {
    const { error: courseUpdateError } = await admin
      .from("courses")
      .update({
        school_year_start: schoolYearStart,
        school_year_end: schoolYearEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", course.id)
      .eq("owner_id", user.id);

    if (courseUpdateError) {
      throw new Error(courseUpdateError.message);
    }

    const { error: clearCourseCalendarError } = await admin
      .from("course_calendar_days")
      .delete()
      .eq("course_id", course.id);

    if (clearCourseCalendarError) {
      throw new Error(clearCourseCalendarError.message);
    }

    const rows = buildCourseCalendarRows({
      course,
      schoolYearStart,
      schoolYearEnd,
      overrideMap,
    });

    if (rows.length > 0) {
      const { error: insertCourseCalendarError } = await admin
        .from("course_calendar_days")
        .insert(rows);

      if (insertCourseCalendarError) {
        throw new Error(insertCourseCalendarError.message);
      }
    }

    await rebuildPlanFromCalendar({
      supabase: admin,
      courseId: course.id,
      userId: user.id,
    });

    revalidatePath(`/classes/${course.id}/plan`);
  }

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  revalidatePath("/");

  redirect(`/onboarding/profile?school_calendar_updated=1&t=${Date.now()}#school-calendar`);
}

export async function addTeacherAbsenceAction(formData) {
  const absenceDate = String(formData.get("absence_date") || "");
  const courseScope = String(formData.get("course_scope") || "all");
  const note = String(formData.get("note") || "").trim();

  if (!isValidISODate(absenceDate)) {
    redirect("/onboarding/profile?absence_error=1");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  let courseId = null;
  if (courseScope !== "all") {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseScope)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (courseError) throw new Error(courseError.message);
    if (!course?.id) redirect("/onboarding/profile?absence_error=1");
    courseId = course.id;
  }

  let deleteQuery = supabase
    .from("teacher_absences")
    .delete()
    .eq("owner_id", user.id)
    .eq("absence_date", absenceDate);
  deleteQuery = courseId ? deleteQuery.eq("course_id", courseId) : deleteQuery.is("course_id", null);
  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    if (isMissingTeacherAbsencesTableError(deleteError)) {
      redirect("/onboarding/profile?absence_error=missing-table");
    }
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await supabase
    .from("teacher_absences")
    .insert({
      owner_id: user.id,
      course_id: courseId,
      absence_date: absenceDate,
      note: note || null,
    });

  if (insertError) {
    if (isMissingTeacherAbsencesTableError(insertError)) {
      redirect("/onboarding/profile?absence_error=missing-table");
    }
    throw new Error(insertError.message);
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?absence_updated=1&t=${Date.now()}`);
}

export async function deleteTeacherAbsenceAction(formData) {
  const absenceId = String(formData.get("absence_id") || "");
  if (!absenceId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error } = await supabase
    .from("teacher_absences")
    .delete()
    .eq("id", absenceId)
    .eq("owner_id", user.id);

  if (error) {
    if (isMissingTeacherAbsencesTableError(error)) {
      redirect("/onboarding/profile?absence_error=missing-table");
    }
    throw new Error(error.message);
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?absence_updated=1&t=${Date.now()}`);
}

export async function saveTeacherMarkingPeriodAction(formData) {
  const name = String(formData.get("name") || "").trim();
  const startDayNumber = Number.parseInt(String(formData.get("start_day_number") || ""), 10);
  const endDayNumber = Number.parseInt(String(formData.get("end_day_number") || ""), 10);

  if (
    !name ||
    !Number.isInteger(startDayNumber) ||
    !Number.isInteger(endDayNumber) ||
    startDayNumber < 1 ||
    endDayNumber < startDayNumber
  ) {
    redirect("/onboarding/profile?marking_period_error=1#school-calendar");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error } = await supabase
    .from("teacher_marking_period_rules")
    .upsert(
      {
        owner_id: user.id,
        name,
        start_day_number: startDayNumber,
        end_day_number: endDayNumber,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,name" }
    );

  if (error) {
    if (isMissingTeacherMarkingPeriodRulesTableError(error)) {
      redirect("/onboarding/profile?marking_period_error=missing-table#school-calendar");
    }
    throw new Error(error.message);
  }

  revalidatePath("/onboarding/profile");
  redirect(`/onboarding/profile?marking_period_updated=1&t=${Date.now()}#school-calendar`);
}

export async function saveStandardMarkingPeriodRulesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const now = new Date().toISOString();
  const rows = [
    { owner_id: user.id, name: "Quarter 1", start_day_number: 1, end_day_number: 45, updated_at: now },
    { owner_id: user.id, name: "Quarter 2", start_day_number: 46, end_day_number: 90, updated_at: now },
    { owner_id: user.id, name: "Quarter 3", start_day_number: 91, end_day_number: 135, updated_at: now },
    { owner_id: user.id, name: "Quarter 4", start_day_number: 136, end_day_number: 180, updated_at: now },
  ];

  const { error } = await supabase
    .from("teacher_marking_period_rules")
    .upsert(rows, { onConflict: "owner_id,name" });

  if (error) {
    if (isMissingTeacherMarkingPeriodRulesTableError(error)) {
      redirect("/onboarding/profile?marking_period_error=missing-table#school-calendar");
    }
    throw new Error(error.message);
  }

  revalidatePath("/onboarding/profile");
  redirect(`/onboarding/profile?marking_period_updated=1&t=${Date.now()}#school-calendar`);
}

export async function deleteTeacherMarkingPeriodAction(formData) {
  const periodId = String(formData.get("period_id") || "");
  if (!periodId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error } = await supabase
    .from("teacher_marking_period_rules")
    .delete()
    .eq("id", periodId)
    .eq("owner_id", user.id);

  if (error) {
    if (isMissingTeacherMarkingPeriodRulesTableError(error)) {
      redirect("/onboarding/profile?marking_period_error=missing-table#school-calendar");
    }
    throw new Error(error.message);
  }

  revalidatePath("/onboarding/profile");
  redirect(`/onboarding/profile?marking_period_updated=1&t=${Date.now()}#school-calendar`);
}

export async function saveTeacherAnnouncementAssignmentRuleAction(formData) {
  const ruleId = String(formData.get("rule_id") || "").trim();
  const label = String(formData.get("label") || "").trim();
  const courseScope = String(formData.get("course_scope") || "all");
  const cadenceRaw = String(formData.get("cadence") || "weekly");
  const cadence = ["weekly", "monthly", "marking_period"].includes(cadenceRaw)
    ? cadenceRaw
    : "weekly";
  const weekdays = parseNumberList(formData.getAll("weekday"), 1, 5, 5);
  const countPerPeriod = cadence === "marking_period"
    ? clampCount(formData.get("count_per_period"))
    : Math.max(1, weekdays.length || 1);

  if (!label) {
    redirect("/onboarding/profile?assignment_error=1#announcement-assignments");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  let courseId = null;
  if (courseScope !== "all") {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseScope)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (courseError) throw new Error(courseError.message);
    if (!course?.id) {
      redirect("/onboarding/profile?assignment_error=1#announcement-assignments");
    }
    courseId = course.id;
  }

  const noMeetingShiftRaw = String(formData.get("no_meeting_shift") || "before");
  const noMeetingShift = ["before", "after", "same_day", "skip"].includes(noMeetingShiftRaw) ? noMeetingShiftRaw : "before";

  const startDateRaw = String(formData.get("start_date") || "").trim();
  const ruleStartDate = startDateRaw ? normalizeDateInput(startDateRaw) : "";

  const settings = {
    weekdays,
    week_interval: Math.max(1, Math.min(52, parsePositiveInt(formData.get("week_interval"), 1))),
    month_days: parseNumberList(formData.getAll("month_day"), 1, 31, 1),
    monthly_shift: String(formData.get("monthly_shift") || "after") === "before" ? "before" : "after",
    no_meeting_shift: noMeetingShift,
    start_date: ruleStartDate || null,
  };

  if ((cadence === "weekly" || cadence === "marking_period") && settings.weekdays.length === 0) {
    settings.weekdays = [5];
  }
  if (cadence === "monthly" && settings.month_days.length === 0) {
    settings.month_days = [1];
  }

  const payload = {
    owner_id: user.id,
    course_id: courseId,
    label,
    cadence,
    count_per_period: countPerPeriod,
    settings,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const query = ruleId
    ? supabase
        .from("teacher_announcement_assignment_rules")
        .update(payload)
        .eq("id", ruleId)
        .eq("owner_id", user.id)
    : supabase.from("teacher_announcement_assignment_rules").insert(payload);

  const { error } = await query;

  if (error) {
    if (isMissingTeacherAnnouncementAssignmentRulesTableError(error)) {
      redirect("/onboarding/profile?assignment_error=missing-table#announcement-assignments");
    }
    throw new Error(error.message);
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?assignments_updated=1&t=${Date.now()}#announcement-assignments`);
}

export async function deleteTeacherAnnouncementAssignmentRuleAction(formData) {
  const ruleId = String(formData.get("rule_id") || "").trim();
  if (!ruleId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { error } = await supabase
    .from("teacher_announcement_assignment_rules")
    .delete()
    .eq("id", ruleId)
    .eq("owner_id", user.id);

  if (error) {
    if (isMissingTeacherAnnouncementAssignmentRulesTableError(error)) {
      redirect("/onboarding/profile?assignment_error=missing-table#announcement-assignments");
    }
    throw new Error(error.message);
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?assignments_updated=1&t=${Date.now()}#announcement-assignments`);
}

export async function saveTeacherAnnouncementAssignmentRuleOverrideAction(formData) {
  const ruleId = String(formData.get("rule_id") || "").trim();
  const courseId = String(formData.get("course_id") || "").trim();
  const originalDate = normalizeDateInput(formData.get("original_date"));
  const assignmentDate = normalizeDateInput(formData.get("assignment_date"));

  if (!ruleId || !courseId || !originalDate || !assignmentDate) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (courseError) throw new Error(courseError.message);
  if (!course?.id) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const { data: rule, error: ruleError } = await supabase
    .from("teacher_announcement_assignment_rules")
    .select("id, course_id")
    .eq("id", ruleId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (ruleError) {
    if (isMissingTeacherAnnouncementAssignmentRulesTableError(ruleError)) {
      redirect("/onboarding/profile?assignment_error=missing-table#announcement-assignments");
    }
    throw new Error(ruleError.message);
  }

  if (!rule?.id || (rule.course_id && rule.course_id !== courseId)) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  if (assignmentDate === originalDate) {
    const { error: deleteError } = await supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .delete()
      .eq("owner_id", user.id)
      .eq("rule_id", ruleId)
      .eq("course_id", courseId)
      .eq("original_date", originalDate);

    if (deleteError) {
      if (isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(deleteError)) {
        redirect("/onboarding/profile?assignment_error=missing-overrides#announcement-assignments");
      }
      throw new Error(deleteError.message);
    }
  } else {
    const payload = {
      owner_id: user.id,
      rule_id: ruleId,
      course_id: courseId,
      original_date: originalDate,
      assignment_date: assignmentDate,
      is_skipped: false,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .upsert(payload, { onConflict: "owner_id,rule_id,course_id,original_date" });

    if (upsertError) {
      if (isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(upsertError)) {
        redirect("/onboarding/profile?assignment_error=missing-overrides#announcement-assignments");
      }
      throw new Error(upsertError.message);
    }
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?assignments_updated=1&t=${Date.now()}#announcement-assignments`);
}

export async function saveTeacherAnnouncementAssignmentRuleOccurrenceClassesAction(formData) {
  const ruleId = String(formData.get("rule_id") || "").trim();
  const originalDate = normalizeDateInput(formData.get("original_date"));
  const assignmentDate = normalizeDateInput(formData.get("assignment_date"));
  const occurrenceCourseIds = formData
    .getAll("occurrence_course_id")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const activeCourseIds = new Set(
    formData
      .getAll("active_course_id")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  if (!ruleId || !originalDate || !assignmentDate || occurrenceCourseIds.length === 0) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { data: rule, error: ruleError } = await supabase
    .from("teacher_announcement_assignment_rules")
    .select("id, course_id")
    .eq("id", ruleId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (ruleError) {
    if (isMissingTeacherAnnouncementAssignmentRulesTableError(ruleError)) {
      redirect("/onboarding/profile?assignment_error=missing-table#announcement-assignments");
    }
    throw new Error(ruleError.message);
  }

  if (!rule?.id) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const uniqueCourseIds = [...new Set(occurrenceCourseIds)];
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id")
    .eq("owner_id", user.id)
    .in("id", uniqueCourseIds);

  if (coursesError) throw new Error(coursesError.message);

  const ownedCourseIds = new Set((courses || []).map((course) => course.id));
  if (ownedCourseIds.size !== uniqueCourseIds.length) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }
  if (rule.course_id && (uniqueCourseIds.length !== 1 || uniqueCourseIds[0] !== rule.course_id)) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const rowsToUpsert = [];
  const activeOriginalCourseIds = [];

  for (const courseId of uniqueCourseIds) {
    if (activeCourseIds.has(courseId)) {
      if (assignmentDate === originalDate) {
        activeOriginalCourseIds.push(courseId);
      } else {
        rowsToUpsert.push({
          owner_id: user.id,
          rule_id: ruleId,
          course_id: courseId,
          original_date: originalDate,
          assignment_date: assignmentDate,
          is_skipped: false,
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      rowsToUpsert.push({
        owner_id: user.id,
        rule_id: ruleId,
        course_id: courseId,
        original_date: originalDate,
        assignment_date: assignmentDate,
        is_skipped: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (activeOriginalCourseIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .delete()
      .eq("owner_id", user.id)
      .eq("rule_id", ruleId)
      .eq("original_date", originalDate)
      .in("course_id", activeOriginalCourseIds);

    if (deleteError) {
      if (isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(deleteError)) {
        redirect("/onboarding/profile?assignment_error=missing-overrides#announcement-assignments");
      }
      throw new Error(deleteError.message);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("teacher_announcement_assignment_rule_overrides")
      .upsert(rowsToUpsert, { onConflict: "owner_id,rule_id,course_id,original_date" });

    if (upsertError) {
      if (isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(upsertError)) {
        redirect("/onboarding/profile?assignment_error=missing-overrides#announcement-assignments");
      }
      throw new Error(upsertError.message);
    }
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?assignments_updated=1&t=${Date.now()}#announcement-assignments`);
}

export async function deleteTeacherAnnouncementAssignmentRuleOccurrenceAction(formData) {
  const ruleId = String(formData.get("rule_id") || "").trim();
  const courseId = String(formData.get("course_id") || "").trim();
  const originalDate = normalizeDateInput(formData.get("original_date"));
  const assignmentDate = normalizeDateInput(formData.get("assignment_date")) || originalDate;

  if (!ruleId || !courseId || !originalDate) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (courseError) throw new Error(courseError.message);
  if (!course?.id) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const { data: rule, error: ruleError } = await supabase
    .from("teacher_announcement_assignment_rules")
    .select("id, course_id")
    .eq("id", ruleId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (ruleError) {
    if (isMissingTeacherAnnouncementAssignmentRulesTableError(ruleError)) {
      redirect("/onboarding/profile?assignment_error=missing-table#announcement-assignments");
    }
    throw new Error(ruleError.message);
  }

  if (!rule?.id || (rule.course_id && rule.course_id !== courseId)) {
    redirect("/onboarding/profile?assignment_error=override#announcement-assignments");
  }

  const { error: upsertError } = await supabase
    .from("teacher_announcement_assignment_rule_overrides")
    .upsert(
      {
        owner_id: user.id,
        rule_id: ruleId,
        course_id: courseId,
        original_date: originalDate,
        assignment_date: assignmentDate,
        is_skipped: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,rule_id,course_id,original_date" }
    );

  if (upsertError) {
    if (isMissingTeacherAnnouncementAssignmentRuleOverridesTableError(upsertError)) {
      redirect("/onboarding/profile?assignment_error=missing-overrides#announcement-assignments");
    }
    throw new Error(upsertError.message);
  }

  await regenerateAnnouncementsForTeacherCourses(supabase, user.id);

  revalidatePath("/onboarding/profile");
  revalidatePath("/classes");
  redirect(`/onboarding/profile?assignments_updated=1&t=${Date.now()}#announcement-assignments`);
}
