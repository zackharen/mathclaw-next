import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const DAY_NUMBERS = new Set([0, 1, 2, 3, 4, 5, 6]);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LABEL_LIMIT = 80;

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function isMissingScheduleTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normalizeDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && DAY_NUMBERS.has(day) ? day : null;
}

function normalizeTime(value) {
  const time = String(value || "").trim();
  return TIME_PATTERN.test(time) ? time : null;
}

function normalizeLabel(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, LABEL_LIMIT);
}

function courseLabel(course) {
  if (!course) return "";
  const title = String(course.title || "Class").trim();
  const className = String(course.class_name || "").trim();
  return className ? `${title} (${className})` : title;
}

function normalizeBlock(row) {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: String(row.start_time || "").slice(0, 5),
    endTime: String(row.end_time || "").slice(0, 5),
    roomId: row.room_id,
    roomName: row.projector_room_profiles?.name || row.room_name || "",
    courseId: row.course_id || null,
    courseName: courseLabel(row.courses),
    label: row.label || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCourse(row) {
  return {
    id: row.id,
    label: courseLabel(row),
    title: row.title || "",
    class_name: row.class_name || "",
  };
}

async function getTeacherContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to manage projector schedules.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage projector schedules.", 403) };
  }

  return { user };
}

async function listRooms(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }

  return data || [];
}

async function listCourses(admin, teacherId) {
  const { data, error } = await admin
    .from("courses")
    .select("id, title, class_name")
    .eq("owner_id", teacherId)
    .order("title", { ascending: true })
    .order("class_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeCourse);
}

async function listBlocks(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_room_schedule_blocks")
    .select("id, day_of_week, start_time, end_time, room_id, course_id, label, created_at, updated_at, projector_room_profiles(name), courses(title, class_name)")
    .eq("teacher_id", teacherId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    if (isMissingScheduleTable(error)) return { blocks: [], setupMissing: true };
    throw new Error(error.message);
  }

  return { blocks: (data || []).map(normalizeBlock), setupMissing: false };
}

async function loadSchedule(admin, teacherId) {
  const [{ blocks, setupMissing }, rooms, courses] = await Promise.all([
    listBlocks(admin, teacherId),
    listRooms(admin, teacherId),
    listCourses(admin, teacherId),
  ]);
  return { blocks, rooms, courses, setupMissing };
}

async function validateSchedulePayload(admin, teacherId, body, currentBlockId = null) {
  const dayOfWeek = normalizeDay(body.dayOfWeek);
  const startTime = normalizeTime(body.startTime);
  const endTime = normalizeTime(body.endTime);
  const roomId = String(body.roomId || "");
  const courseId = String(body.courseId || "").trim() || null;
  const label = normalizeLabel(body.label);

  if (dayOfWeek == null) return { error: jsonError("Choose a day for the schedule block.") };
  if (!startTime || !endTime) return { error: jsonError("Use valid start and end times.") };
  if (endTime <= startTime) return { error: jsonError("End time must be after start time.") };
  if (!isUuid(roomId)) return { error: jsonError("Choose a Room for this schedule block.") };
  if (courseId && !isUuid(courseId)) return { error: jsonError("Choose a valid class or leave it blank.") };

  const { data: room, error: roomError } = await admin
    .from("projector_room_profiles")
    .select("id")
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (roomError) return { error: jsonError(roomError.message, 500) };
  if (!room) return { error: jsonError("That Room does not belong to you.", 404) };

  if (courseId) {
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("owner_id", teacherId)
      .maybeSingle();
    if (courseError) return { error: jsonError(courseError.message, 500) };
    if (!course) return { error: jsonError("That class does not belong to you.", 404) };
  }

  let overlapQuery = admin
    .from("projector_room_schedule_blocks")
    .select("id, label, start_time, end_time")
    .eq("teacher_id", teacherId)
    .eq("day_of_week", dayOfWeek)
    .lt("start_time", endTime)
    .gt("end_time", startTime)
    .limit(1);

  if (currentBlockId) overlapQuery = overlapQuery.neq("id", currentBlockId);

  const { data: overlap, error: overlapError } = await overlapQuery;
  if (overlapError) {
    if (isMissingScheduleTable(overlapError)) return { error: jsonError("Projector schedules are not set up yet.", 503, { setupMissing: true }) };
    return { error: jsonError(overlapError.message, 500) };
  }
  if (overlap?.length) return { error: jsonError("That schedule block overlaps another block on the same day.") };

  return {
    payload: {
      teacher_id: teacherId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      room_id: roomId,
      course_id: courseId,
      label: label || null,
    },
  };
}

async function createBlock(admin, teacherId, body) {
  const validation = await validateSchedulePayload(admin, teacherId, body);
  if (validation.error) return validation.error;

  const { data, error } = await admin
    .from("projector_room_schedule_blocks")
    .insert(validation.payload)
    .select("id, day_of_week, start_time, end_time, room_id, course_id, label, created_at, updated_at, projector_room_profiles(name), courses(title, class_name)")
    .single();

  if (error) {
    if (isMissingScheduleTable(error)) return jsonError("Projector schedules are not set up yet.", 503, { setupMissing: true });
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ block: normalizeBlock(data) });
}

async function updateBlock(admin, teacherId, body) {
  const blockId = String(body.blockId || "");
  if (!isUuid(blockId)) return jsonError("Choose a schedule block to update.");

  const { data: existing, error: existingError } = await admin
    .from("projector_room_schedule_blocks")
    .select("id")
    .eq("id", blockId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (existingError) {
    if (isMissingScheduleTable(existingError)) return jsonError("Projector schedules are not set up yet.", 503, { setupMissing: true });
    return jsonError(existingError.message, 500);
  }
  if (!existing) return jsonError("Schedule block not found.", 404);

  const validation = await validateSchedulePayload(admin, teacherId, body, blockId);
  if (validation.error) return validation.error;

  const { data, error } = await admin
    .from("projector_room_schedule_blocks")
    .update({ ...validation.payload, updated_at: new Date().toISOString() })
    .eq("id", blockId)
    .eq("teacher_id", teacherId)
    .select("id, day_of_week, start_time, end_time, room_id, course_id, label, created_at, updated_at, projector_room_profiles(name), courses(title, class_name)")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Schedule block not found.", 404);
  return NextResponse.json({ block: normalizeBlock(data) });
}

async function deleteBlock(admin, teacherId, body) {
  const blockId = String(body.blockId || "");
  if (!isUuid(blockId)) return jsonError("Choose a schedule block to delete.");

  const { error } = await admin
    .from("projector_room_schedule_blocks")
    .delete()
    .eq("id", blockId)
    .eq("teacher_id", teacherId);

  if (error) {
    if (isMissingScheduleTable(error)) return jsonError("Projector schedules are not set up yet.", 503, { setupMissing: true });
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const context = await getTeacherContext();
  if (context.error) return context.error;

  try {
    return NextResponse.json(await loadSchedule(createAdminClient(), context.user.id));
  } catch (error) {
    return jsonError(error.message || "Could not load projector schedule.", 500);
  }
}

export async function POST(request) {
  const context = await getTeacherContext();
  if (context.error) return context.error;

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (body?.action === "create-block") return createBlock(admin, context.user.id, body);
  if (body?.action === "update-block") return updateBlock(admin, context.user.id, body);
  if (body?.action === "delete-block") return deleteBlock(admin, context.user.id, body);

  return jsonError("Unknown schedule action.");
}
