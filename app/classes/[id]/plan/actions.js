"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { rebuildPlanFromCalendar } from "@/lib/planning/rebuild-plan";

export async function generatePacingAction(formData) {
  const courseId = formData.get("course_id");
  if (!courseId || typeof courseId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await rebuildPlanFromCalendar({ supabase, courseId, userId: user.id });

  revalidatePath(`/classes/${courseId}/plan`);
  revalidatePath(`/classes/${courseId}/calendar`);
  revalidatePath("/classes");
  redirect(`/classes/${courseId}/plan?calendar_updated=1&t=${Date.now()}`);
}

export async function updateABMeetingDaysAction(formData) {
  const courseId = formData.get("course_id");
  const meetsA = formData.get("meet_a") === "on";
  const meetsB = formData.get("meet_b") === "on";

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

  revalidatePath(`/classes/${course.id}/plan`);
  revalidatePath("/classes");
  redirect(`/classes/${course.id}/plan?calendar_updated=1&t=${Date.now()}#modify-calendar`);
}
