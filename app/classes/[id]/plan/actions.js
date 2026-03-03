"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";

const PERF_ENABLED = process.env.MATHCLAW_TIMING !== "0";

function perfLog(action, details) {
  if (!PERF_ENABLED) return;
  const detailText = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`[perf] ${action} ${detailText}`);
}

export async function generatePacingAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await rebuildPlanFromCalendar({ supabase, courseId, userId: user.id });

  perfLog("generatePacingAction", {
    course: courseId,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${courseId}/plan`);
  revalidatePath(`/classes/${courseId}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${courseId}/plan?calendar_updated=1&t=${Date.now()}`);
}

export async function updateABMeetingDaysAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const meetAValue = formData.get("meet_a");
  const meetBValue = formData.get("meet_b");
  const meetsA = meetAValue === "on" || meetAValue === "1" || meetAValue === "true";
  const meetsB = meetBValue === "on" || meetBValue === "1" || meetBValue === "true";

  if (!courseId || typeof courseId !== "string") return;
  if (!meetsA && !meetsB) return;

  let abMeetingDay = null;
  if (meetsA && !meetsB) abMeetingDay = "A";
  if (!meetsA && meetsB) abMeetingDay = "B";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  const { error } = await supabase
    .from("courses")
    .update({ ab_meeting_day: abMeetingDay, updated_at: new Date().toISOString() })
    .eq("id", course.id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);

  await rebuildPlanFromCalendar({ supabase, courseId: course.id, userId: user.id });

  perfLog("updateABMeetingDaysAction", {
    course: course.id,
    abMeetingDay: abMeetingDay || "both",
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&ab_updated=1&t=${Date.now()}#modify-calendar`);
}


export async function markLessonCompleteAction(formData) {
  const actionStart = Date.now();
  const courseId = formData.get("course_id");
  const classDate = formData.get("class_date");

  if (typeof courseId !== "string" || typeof classDate !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .single();

  if (!course) return;

  const { error: markError } = await supabase
    .from("course_lesson_plan")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("course_id", course.id)
    .eq("class_date", classDate);

  if (markError) throw new Error(markError.message);

  await rebuildPlanFromCalendar({ supabase, courseId: course.id, userId: user.id });

  perfLog("markLessonCompleteAction", {
    course: course.id,
    classDate,
    ms: Date.now() - actionStart,
  });

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath(`/classes/${course.id}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?progress_updated=1&t=${Date.now()}`);
}
