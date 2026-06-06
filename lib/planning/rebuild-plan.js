import { getCourseAccessForUser } from "@/lib/courses/access";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";

function modifierForWeekday(modifiers, classDate) {
  const weekday = new Date(`${classDate}T00:00:00Z`).getUTCDay();
  return modifiers?.[weekday] || null;
}

function normalizeWeekdayModifiers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized = {};
  for (const [weekday, modifier] of Object.entries(raw)) {
    if (!["1", "2", "3", "4", "5"].includes(String(weekday))) continue;
    if (modifier === "no_lesson" || modifier === "one_less") {
      normalized[String(weekday)] = modifier;
    }
  }
  return normalized;
}

function filterSchedulableDays(calendarDays, scheduleModel, abMeetingDay) {
  return (calendarDays || []).filter((day) => {
    if (day.day_type === "off") return false;
    if (scheduleModel !== "ab") return true;
    if (!abMeetingDay) return true;
    return day.ab_day === abMeetingDay;
  });
}

function lessonsForDay(day, pacingMode, weekdayModifiers) {
  if (pacingMode === "manual_complete") return day.day_type === "instructional" ? 1 : 0;

  let lessonCount = 0;
  if (pacingMode === "two_lessons_per_day") {
    lessonCount = day.day_type === "half" ? 1 : 2;
  } else if (pacingMode === "one_lesson_no_half_days") {
    lessonCount = day.day_type === "half" ? 0 : 1;
  } else {
    lessonCount = 1;
  }

  const modifier = modifierForWeekday(weekdayModifiers, day.class_date);
  if (modifier === "no_lesson") return 0;
  if (modifier === "one_less") return Math.max(0, lessonCount - 1);
  return lessonCount;
}

function countLeadingCompleted(planRows) {
  let count = 0;
  for (const row of planRows || []) {
    if (row.status !== "completed") break;
    count += 1;
  }
  return count;
}

export async function rebuildPlanFromCalendar({
  supabase,
  courseId,
  userId,
  startDate = null,
}) {
  const t0 = Date.now();
  const mode = startDate ? "incremental" : "full";

  const [access, calendarRes] = await Promise.all([
    getCourseAccessForUser(
      supabase,
      userId,
      courseId,
      "id, owner_id, selected_library_id, schedule_model, ab_meeting_day, pacing_mode, pacing_weekday_modifiers"
    ),
    supabase
      .from("course_calendar_days")
      .select("class_date, ab_day, day_type")
      .eq("course_id", courseId)
      .order("class_date", { ascending: true }),
  ]);

  if (calendarRes.error) throw new Error(calendarRes.error.message);

  const course = access?.course;
  if (!course || !course.selected_library_id) {
    if (PERF_ENABLED) {
      console.info(
        `[perf] rebuildPlanFromCalendar mode=${mode} course=${courseId} start=${startDate || "n/a"} skipped=no-library ms=${Date.now() - t0}`
      );
    }
    return;
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("id, sequence_index")
    .eq("library_id", course.selected_library_id)
    .order("sequence_index", { ascending: true });

  if (lessonsError) throw new Error(lessonsError.message);

  const pacingMode =
    course.pacing_mode === "two_lessons_unless_modified"
      ? "two_lessons_per_day"
      : course.pacing_mode || "one_lesson_per_day";
  const weekdayModifiers = normalizeWeekdayModifiers(course.pacing_weekday_modifiers);
  const filteredDays = filterSchedulableDays(calendarRes.data, course.schedule_model, course.ab_meeting_day);

  const lessonCount = lessons?.length || 0;

  // Manual mode always performs a full rebuild to keep lesson repetition consistent
  // with the current completion boundary. Multi-lesson modes also force full rebuild
  // because lesson pointer advancement depends on day_type sequence.
  const forceFullRebuild =
    pacingMode === "manual_complete" ||
    pacingMode === "one_lesson_no_half_days" ||
    pacingMode === "two_lessons_per_day" ||
    Object.keys(weekdayModifiers).length > 0;
  const effectiveStartDate = forceFullRebuild ? null : startDate;

  if (!effectiveStartDate) {
    const { data: existingPlanRows, error: existingPlanError } = await supabase
      .from("course_lesson_plan")
      .select("class_date, status")
      .eq("course_id", course.id)
      .order("class_date", { ascending: true });

    if (existingPlanError) throw new Error(existingPlanError.message);

    const completedCount = Math.min(
      countLeadingCompleted(existingPlanRows || []),
      lessonCount
    );

    const { error: deleteError } = await supabase
      .from("course_lesson_plan")
      .delete()
      .eq("course_id", course.id);

    if (deleteError) throw new Error(deleteError.message);

    if (filteredDays.length <= 0 || lessonCount <= 0) {
      if (PERF_ENABLED) {
        console.info(
          `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} completedCarry=0 ms=${Date.now() - t0}`
        );
      }
      return;
    }

    const rowsToInsert = [];
    if (pacingMode === "manual_complete") {
      const count = Math.min(filteredDays.length, lessonCount);
      const cappedCompleted = Math.min(completedCount, count);
      for (let i = 0; i < count; i++) {
        const isCompleted = i < cappedCompleted;
        const lessonIndex = isCompleted
          ? i
          : Math.min(cappedCompleted, lessonCount - 1);
        rowsToInsert.push({
          course_id: course.id,
          class_date: filteredDays[i].class_date,
          lesson_slot: 1,
          lesson_id: lessons[lessonIndex].id,
          status: isCompleted ? "completed" : "planned",
          is_added_buffer_day: false,
        });
      }
    } else {
      let lessonPointer = 0;
      let statusPointer = 0;
      for (const day of filteredDays) {
        const dailyLessonCount = lessonsForDay(day, pacingMode, weekdayModifiers);
        for (let slot = 1; slot <= dailyLessonCount; slot += 1) {
          if (lessonPointer >= lessonCount) break;
          rowsToInsert.push({
            course_id: course.id,
            class_date: day.class_date,
            lesson_slot: slot,
            lesson_id: lessons[lessonPointer].id,
            status: statusPointer < completedCount ? "completed" : "planned",
            is_added_buffer_day: false,
          });
          lessonPointer += 1;
          statusPointer += 1;
        }
        if (lessonPointer >= lessonCount) break;
      }
    }

    if (rowsToInsert.length === 0) {
      if (PERF_ENABLED) {
        console.info(
          `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} completedCarry=${completedCount} rows=0 ms=${Date.now() - t0}`
        );
      }
      return;
    }

    const { error: insertError } = await supabase
      .from("course_lesson_plan")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);

    if (PERF_ENABLED) {
      console.info(
        `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} completedCarry=${completedCount} ms=${Date.now() - t0}`
      );
    }
    return;
  }

  const { error: deleteTailError } = await supabase
    .from("course_lesson_plan")
    .delete()
    .eq("course_id", course.id)
    .gte("class_date", effectiveStartDate)
    .neq("status", "completed");

  if (deleteTailError) throw new Error(deleteTailError.message);

  const startIndex = filteredDays.findIndex((d) => d.class_date >= effectiveStartDate);
  if (startIndex < 0 || startIndex >= lessonCount) {
    if (PERF_ENABLED) {
      console.info(
        `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} ms=${Date.now() - t0}`
      );
    }
    return;
  }

  const count = Math.min(filteredDays.length, lessonCount);
  if (startIndex >= count) {
    if (PERF_ENABLED) {
      console.info(
        `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} ms=${Date.now() - t0}`
      );
    }
    return;
  }

  const rowsToInsert = [];
  let lessonPointer = startIndex;
  for (let i = startIndex; i < count; i++) {
    const dailyLessonCount = lessonsForDay(filteredDays[i], pacingMode, weekdayModifiers);
    for (let slot = 1; slot <= dailyLessonCount; slot += 1) {
      if (lessonPointer >= lessonCount) break;
      rowsToInsert.push({
        course_id: course.id,
        class_date: filteredDays[i].class_date,
        lesson_slot: slot,
        lesson_id: lessons[lessonPointer].id,
        status: "planned",
        is_added_buffer_day: false,
      });
      lessonPointer += 1;
    }
    if (lessonPointer >= lessonCount) break;
  }

  if (rowsToInsert.length === 0) {
    if (PERF_ENABLED) {
      console.info(
        `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} ms=${Date.now() - t0}`
      );
    }
    return;
  }

  const { error: insertTailError } = await supabase
    .from("course_lesson_plan")
    .upsert(rowsToInsert, { onConflict: "course_id,class_date,lesson_slot" });

  if (insertTailError) throw new Error(insertTailError.message);

  if (PERF_ENABLED) {
    console.info(
      `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} ms=${Date.now() - t0}`
    );
  }
}
