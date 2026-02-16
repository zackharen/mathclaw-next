"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function generatePacingAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id, owner_id, selected_library_id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course || !course.selected_library_id) return;

  const { data: calendarDays, error: calendarError } = await supabase
    .from("course_calendar_days")
    .select("class_date")
    .eq("course_id", course.id)
    .eq("day_type", "instructional")
    .order("class_date", { ascending: true });

  if (calendarError) throw new Error(calendarError.message);

  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("id, sequence_index")
    .eq("library_id", course.selected_library_id)
    .order("sequence_index", { ascending: true });

  if (lessonsError) throw new Error(lessonsError.message);

  const { error: deleteError } = await supabase
    .from("course_lesson_plan")
    .delete()
    .eq("course_id", course.id);

  if (deleteError) throw new Error(deleteError.message);

  const rowsToInsert = [];
  const dayCount = calendarDays?.length || 0;
  const lessonCount = lessons?.length || 0;
  const count = Math.min(dayCount, lessonCount);

  for (let i = 0; i < count; i++) {
    rowsToInsert.push({
      course_id: course.id,
      class_date: calendarDays[i].class_date,
      lesson_id: lessons[i].id,
      status: "planned",
      is_added_buffer_day: false,
    });
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("course_lesson_plan")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
}
