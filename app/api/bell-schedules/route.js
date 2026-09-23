import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import {
  blocksOverlap,
  normalizeBellScheduleBlockInput,
  normalizeBellScheduleTypeName,
} from "@/lib/bell-schedules/constants";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const errorResponse = (message, status = 400) => NextResponse.json({ error: message }, { status });

// The migration is new; a checkout that hasn't applied it yet should degrade
// to an empty manager instead of a crashed page -- same tolerance pattern
// used for projector_room_profiles in the vocabulary-carousel route.
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
function isMissingSchema(error) {
  return Boolean(error) && MISSING_SCHEMA_CODES.has(error.code);
}

async function teacherContext(admin) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Sign in as a teacher to manage bell schedules.", 401) };
  if (!isTeacherAccountType(await getAccountTypeForUser(supabase, user))) {
    return { error: errorResponse("Only teachers can manage bell schedules.", 403) };
  }
  return { supabase, user, admin };
}

async function assertCourse(context, courseId) {
  if (!isUuid(courseId)) return null;
  const access = await getCourseAccessForUser(context.supabase, context.user.id, courseId, "id, owner_id");
  return access?.course || null;
}

async function assertScheduleType(admin, userId, scheduleTypeId) {
  if (!isUuid(scheduleTypeId)) return null;
  const { data, error } = await admin
    .from("teacher_bell_schedule_types")
    .select("id, name")
    .eq("id", scheduleTypeId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error && !isMissingSchema(error)) throw error;
  return data || null;
}

export async function GET() {
  const admin = createAdminClient();
  const context = await teacherContext(admin);
  if (context.error) return context.error;
  try {
    const { data: scheduleTypes, error: typesError } = await admin
      .from("teacher_bell_schedule_types")
      .select("id, name")
      .eq("owner_id", context.user.id)
      .order("name", { ascending: true });
    if (typesError && !isMissingSchema(typesError)) throw typesError;

    const { data: blocks, error: blocksError } = await admin
      .from("teacher_bell_schedule_blocks")
      .select("id, schedule_type_id, course_id, start_time, end_time, label")
      .eq("owner_id", context.user.id)
      .order("start_time", { ascending: true });
    if (blocksError && !isMissingSchema(blocksError)) throw blocksError;

    return NextResponse.json({
      scheduleTypes: typesError ? [] : scheduleTypes || [],
      blocks: blocksError ? [] : blocks || [],
      migrationApplied: !typesError && !blocksError,
    });
  } catch (error) {
    return errorResponse(error.message || "Bell schedules could not be loaded.", 500);
  }
}

export async function POST(request) {
  const admin = createAdminClient();
  const context = await teacherContext(admin);
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "create-type") {
      const name = normalizeBellScheduleTypeName(body.name);
      if (!name) return errorResponse("Enter a schedule name.");
      const { data, error } = await admin
        .from("teacher_bell_schedule_types")
        .insert({ owner_id: context.user.id, name })
        .select("id, name")
        .single();
      if (error) {
        if (error.code === "23505") return errorResponse("You already have a schedule with that name.");
        throw error;
      }
      return NextResponse.json({ scheduleType: data });
    }

    if (body.action === "rename-type") {
      const scheduleType = await assertScheduleType(admin, context.user.id, body.id);
      if (!scheduleType) return errorResponse("Schedule not found.", 404);
      const name = normalizeBellScheduleTypeName(body.name);
      if (!name) return errorResponse("Enter a schedule name.");
      const { data, error } = await admin
        .from("teacher_bell_schedule_types")
        .update({ name })
        .eq("id", scheduleType.id)
        .eq("owner_id", context.user.id)
        .select("id, name")
        .single();
      if (error) {
        if (error.code === "23505") return errorResponse("You already have a schedule with that name.");
        throw error;
      }
      return NextResponse.json({ scheduleType: data });
    }

    if (body.action === "delete-type") {
      const scheduleType = await assertScheduleType(admin, context.user.id, body.id);
      if (!scheduleType) return errorResponse("Schedule not found.", 404);
      const { error } = await admin
        .from("teacher_bell_schedule_types")
        .delete()
        .eq("id", scheduleType.id)
        .eq("owner_id", context.user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create-block" || body.action === "update-block") {
      const scheduleType = await assertScheduleType(admin, context.user.id, body.scheduleTypeId);
      if (!scheduleType) return errorResponse("Schedule not found.", 404);
      const course = await assertCourse(context, body.courseId);
      if (!course) return errorResponse("Choose one of your classes.");
      const normalized = normalizeBellScheduleBlockInput({
        courseId: body.courseId,
        startTime: body.startTime,
        endTime: body.endTime,
        label: body.label,
      });
      if (normalized.error) return errorResponse(normalized.error);

      const { data: siblingBlocks, error: siblingError } = await admin
        .from("teacher_bell_schedule_blocks")
        .select("id, start_time, end_time")
        .eq("owner_id", context.user.id)
        .eq("schedule_type_id", scheduleType.id);
      if (siblingError && !isMissingSchema(siblingError)) throw siblingError;
      if (blocksOverlap(siblingBlocks || [], {
        id: body.action === "update-block" ? body.id : undefined,
        startTime: body.startTime,
        endTime: body.endTime,
      })) {
        return errorResponse("That time overlaps another period in this schedule.");
      }

      if (body.action === "create-block") {
        const { data, error } = await admin
          .from("teacher_bell_schedule_blocks")
          .insert({ owner_id: context.user.id, schedule_type_id: scheduleType.id, ...normalized.values })
          .select("id, schedule_type_id, course_id, start_time, end_time, label")
          .single();
        if (error) {
          if (error.code === "23505") return errorResponse("This class already has a period in this schedule.");
          throw error;
        }
        return NextResponse.json({ block: data });
      }

      if (!isUuid(body.id)) return errorResponse("Period not found.");
      const { data, error } = await admin
        .from("teacher_bell_schedule_blocks")
        .update(normalized.values)
        .eq("id", body.id)
        .eq("owner_id", context.user.id)
        .eq("schedule_type_id", scheduleType.id)
        .select("id, schedule_type_id, course_id, start_time, end_time, label")
        .single();
      if (error) {
        if (error.code === "23505") return errorResponse("This class already has a period in this schedule.");
        throw error;
      }
      if (!data) return errorResponse("Period not found.", 404);
      return NextResponse.json({ block: data });
    }

    if (body.action === "delete-block") {
      if (!isUuid(body.id)) return errorResponse("Period not found.");
      const { error } = await admin
        .from("teacher_bell_schedule_blocks")
        .delete()
        .eq("id", body.id)
        .eq("owner_id", context.user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return errorResponse("Unknown bell schedule action.");
  } catch (error) {
    return errorResponse(error.message || "Bell schedules could not be updated.", 500);
  }
}
