const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";

function filterSchedulableDays(
  calendarDays,
  scheduleModel,
  abMeetingDay,
  pacingMode
) {
  const allowModified =
    pacingMode === "two_lessons_per_day" ||
    pacingMode === "two_lessons_unless_modified";

  return (calendarDays || []).filter((day) => {
    const isSchedulableType =
      day.day_type === "instructional" ||
      (allowModified && day.day_type === "modified");
    if (!isSchedulableType) return false;
    if (scheduleModel !== "ab") return true;
    if (!abMeetingDay) return true;
    return day.ab_day === abMeetingDay;
  });
}

function lessonsToAdvanceForDay(day, pacingMode) {
  if (pacingMode === "two_lessons_per_day") return 2;
  if (pacingMode === "two_lessons_unless_modified") {
    return day.day_type === "modified" ? 1 : 2;
  }
  return 1;
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

  const [ownedRes, sharedMembershipRes, calendarRes] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, owner_id, selected_library_id, schedule_model, ab_meeting_day, pacing_mode"
      )
      .eq("id", courseId)
      .eq("owner_id", userId)
      .maybeSingle(),
    supabase
      .from("course_members")
      .select(
        "role, courses!inner(id, owner_id, selected_library_id, schedule_model, ab_meeting_day, pacing_mode)"
      )
      .eq("course_id", courseId)
      .eq("profile_id", userId)
      .in("role", ["owner", "editor"])
      .maybeSingle(),
    supabase
      .from("course_calendar_days")
      .select("class_date, ab_day, day_type")
      .eq("course_id", courseId)
      .order("class_date", { ascending: true }),
  ]);

  if (ownedRes.error) throw new Error(ownedRes.error.message);
  if (sharedMembershipRes.error) throw new Error(sharedMembershipRes.error.message);
  if (calendarRes.error) throw new Error(calendarRes.error.message);

  const course = ownedRes.data || sharedMembershipRes.data?.courses;
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

  const pacingMode = course.pacing_mode || "one_lesson_per_day";
  const filteredDays = filterSchedulableDays(
    calendarRes.data,
    course.schedule_model,
    course.ab_meeting_day,
    pacingMode
  );

  const lessonCount = lessons?.length || 0;

  // Manual mode always performs a full rebuild to keep lesson repetition consistent
  // with the current completion boundary. Multi-lesson modes also force full rebuild
  // because lesson pointer advancement depends on day_type sequence.
  const forceFullRebuild =
    pacingMode === "manual_complete" ||
    pacingMode === "two_lessons_per_day" ||
    pacingMode === "two_lessons_unless_modified";
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

    const count = Math.min(filteredDays.length, lessonCount);
    if (count <= 0) {
      if (PERF_ENABLED) {
        console.info(
          `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} completedCarry=0 ms=${Date.now() - t0}`
        );
      }
      return;
    }

    const rowsToInsert = [];
    if (pacingMode === "manual_complete") {
      const cappedCompleted = Math.min(completedCount, count);
      for (let i = 0; i < count; i++) {
        const isCompleted = i < cappedCompleted;
        const lessonIndex = isCompleted
          ? i
          : Math.min(cappedCompleted, lessonCount - 1);
        rowsToInsert.push({
          course_id: course.id,
          class_date: filteredDays[i].class_date,
          lesson_id: lessons[lessonIndex].id,
          status: isCompleted ? "completed" : "planned",
          is_added_buffer_day: false,
        });
      }
    } else {
      let lessonPointer = 0;
      for (let i = 0; i < count; i++) {
        if (lessonPointer >= lessonCount) break;
        rowsToInsert.push({
          course_id: course.id,
          class_date: filteredDays[i].class_date,
          lesson_id: lessons[lessonPointer].id,
          status: i < completedCount ? "completed" : "planned",
          is_added_buffer_day: false,
        });
        lessonPointer += lessonsToAdvanceForDay(filteredDays[i], pacingMode);
      }
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
  for (let i = startIndex; i < count; i++) {
    rowsToInsert.push({
      course_id: course.id,
      class_date: filteredDays[i].class_date,
      lesson_id: lessons[i].id,
      status: "planned",
      is_added_buffer_day: false,
    });
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
    .upsert(rowsToInsert, { onConflict: "course_id,class_date" });

  if (insertTailError) throw new Error(insertTailError.message);

  if (PERF_ENABLED) {
    console.info(
      `[perf] rebuildPlanFromCalendar mode=${mode} course=${course.id} start=${startDate || "n/a"} days=${filteredDays.length} lessons=${lessonCount} ms=${Date.now() - t0}`
    );
  }
}
