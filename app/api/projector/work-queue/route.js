import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "projector-work-queue";
const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const STUDENT_NAME_LIMIT = 40;
const WORK_LABEL_LIMIT = 80;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const WORK_QUEUE_SELECT = "id, screen_number, screen_name, student_name, label, public_url, content_type, size_bytes, status, created_at, sent_at, reviewed_at, flagged_at";
const LEGACY_WORK_QUEUE_SELECT = "id, screen_number, screen_name, public_url, content_type, size_bytes, status, created_at, sent_at";

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeScreenNumber(value) {
  const screenNumber = String(value || "").trim();
  return SCREEN_IDS.includes(screenNumber) ? screenNumber : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function isMissingNamingColumns(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || /student_name|label/i.test(error?.message || "");
}

function isMissingReviewColumns(error) {
  return error?.code === "PGRST204" || error?.code === "42703" || /reviewed_at|flagged_at/i.test(error?.message || "");
}

function normalizeOptionalText(value, limit, fieldLabel) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length > limit) {
    return { error: `${fieldLabel} can be at most ${limit} characters.` };
  }
  return { value: text || null };
}

function normalizeRoomSlots(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((slot, index) => ({
      name: String(slot?.name || `Screen ${index + 1}`).trim().replace(/\s+/g, " ").slice(0, 60) || `Screen ${index + 1}`,
      inputType: ["touch", "keyboard_mouse", "display_only"].includes(slot?.inputType)
        ? slot.inputType
        : "display_only",
      enabled: slot?.enabled !== false,
    }));
}

function publicEntry(row) {
  return {
    id: row.id,
    screenNumber: String(row.screen_number),
    screenName: row.screen_name,
    url: row.public_url,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    studentName: row.student_name || null,
    label: row.label || null,
    reviewedAt: row.reviewed_at || null,
    flaggedAt: row.flagged_at || null,
    createdAt: row.created_at,
    sentAt: row.sent_at || null,
  };
}

async function getTeacherContext(admin) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to manage submitted work.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage submitted work.", 403) };
  }

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("id")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { error: jsonError(error.message, 500) };
  if (!session) return { error: jsonError("Open Projector once before managing submitted work.", 404) };
  return { user, session };
}

async function findSessionByToken(admin, token) {
  for (const screenId of SCREEN_IDS) {
    const { data, error } = await admin
      .from("projector_sessions")
      .select("id, teacher_id, screen_tokens")
      .contains("screen_tokens", { [screenId]: token })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return { session: data, screenNumber: screenId };
  }
  return null;
}

async function getActiveRoomSlot(admin, teacherId, screenNumber) {
  const { data, error } = await admin
    .from("projector_room_profiles")
    .select("slots")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { name: `Screen ${screenNumber}`, inputType: "display_only", enabled: true };
    }
    throw new Error(error.message);
  }

  const slots = normalizeRoomSlots(data?.slots);
  return slots[Number(screenNumber) - 1] || { name: `Screen ${screenNumber}`, inputType: "display_only", enabled: false };
}

async function ensureBucket(admin) {
  const { error: getError } = await admin.storage.getBucket(BUCKET);
  if (!getError) {
    const { error: updateError } = await admin.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_UPLOAD_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
    });
    return updateError || null;
  }

  const { error: createError } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
  });

  if (createError && !/already exists/i.test(createError.message || "")) return createError;
  return null;
}

async function uploadWork(admin, request) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "").trim();
  const studentName = normalizeOptionalText(formData.get("studentName"), STUDENT_NAME_LIMIT, "Name");
  const label = normalizeOptionalText(formData.get("label"), WORK_LABEL_LIMIT, "Question");
  const file = formData.get("file");

  if (!token) return jsonError("Connect this screen before submitting work.", 401);
  if (studentName.error) return jsonError(studentName.error);
  if (label.error) return jsonError(label.error);
  if (!file || typeof file.arrayBuffer !== "function") return jsonError("Take a photo before submitting.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError("That photo is too large. Retake it or move closer to the page.");

  const contentType = file.type || "image/jpeg";
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) return jsonError("Submit a JPEG, PNG, WebP, or GIF image.");

  const resolved = await findSessionByToken(admin, token);
  if (!resolved?.session || !resolved.screenNumber) return jsonError("Projector token not found.", 404);

  const slot = await getActiveRoomSlot(admin, resolved.session.teacher_id, resolved.screenNumber);
  if (slot.enabled === false) return jsonError("This screen is inactive right now.", 403);
  if (slot.inputType !== "touch") return jsonError("This screen is not set up for camera submissions.", 403);

  const bucketError = await ensureBucket(admin);
  if (bucketError) return jsonError(bucketError.message, 500);

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
  const storagePath = `${resolved.session.teacher_id}/${resolved.session.id}/${Date.now()}-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    cacheControl: "604800",
    upsert: false,
  });

  if (uploadError) return jsonError(uploadError.message, 500);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  const insertPayload = {
    teacher_id: resolved.session.teacher_id,
    session_id: resolved.session.id,
    screen_number: Number(resolved.screenNumber),
    screen_name: slot.name || `Screen ${resolved.screenNumber}`,
    student_name: studentName.value,
    label: label.value,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    public_url: data.publicUrl,
    content_type: contentType,
    size_bytes: file.size,
  };

  let { data: row, error: insertError } = await admin
    .from("projector_work_queue")
    .insert(insertPayload)
    .select(WORK_QUEUE_SELECT)
    .single();

  if (isMissingNamingColumns(insertError) || isMissingReviewColumns(insertError)) {
    const legacyPayload = { ...insertPayload };
    delete legacyPayload.student_name;
    delete legacyPayload.label;
    ({ data: row, error: insertError } = await admin
      .from("projector_work_queue")
      .insert(legacyPayload)
      .select(LEGACY_WORK_QUEUE_SELECT)
      .single());
  }

  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    if (insertError.code === "42P01" || insertError.code === "PGRST205") {
      return jsonError("The work queue is not set up yet.", 503);
    }
    return jsonError(insertError.message, 500);
  }

  return NextResponse.json({ entry: publicEntry(row) });
}

async function listQueue(admin, teacherId) {
  let { data, error } = await admin
    .from("projector_work_queue")
    .select(WORK_QUEUE_SELECT)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (isMissingNamingColumns(error) || isMissingReviewColumns(error)) {
    ({ data, error } = await admin
      .from("projector_work_queue")
      .select(LEGACY_WORK_QUEUE_SELECT)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(80));
  }

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ entries: [], setupMissing: true });
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ entries: (data || []).map(publicEntry), setupMissing: false });
}

async function markSent(admin, teacherId, body) {
  const entryId = String(body.entryId || "");
  if (!isUuid(entryId)) return jsonError("Choose a submitted photo.");

  let { data, error } = await admin
    .from("projector_work_queue")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("teacher_id", teacherId)
    .select(WORK_QUEUE_SELECT)
    .maybeSingle();

  if (isMissingNamingColumns(error) || isMissingReviewColumns(error)) {
    ({ data, error } = await admin
      .from("projector_work_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("teacher_id", teacherId)
      .select(LEGACY_WORK_QUEUE_SELECT)
      .maybeSingle());
  }

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return jsonError("The work queue is not set up yet.", 503);
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Submitted photo not found.", 404);
  return NextResponse.json({ entry: publicEntry(data) });
}

async function markReviewed(admin, teacherId, body) {
  const entryIds = Array.isArray(body.entryIds) ? body.entryIds.map(String).filter(isUuid) : [];
  if (!entryIds.length) return jsonError("Choose submitted photos to mark reviewed.");

  let { data, error } = await admin
    .from("projector_work_queue")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .in("id", entryIds)
    .select(WORK_QUEUE_SELECT);

  if (isMissingReviewColumns(error)) {
    ({ data, error } = await admin
      .from("projector_work_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("teacher_id", teacherId)
      .in("id", entryIds)
      .select(LEGACY_WORK_QUEUE_SELECT));
  }

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ entries: (data || []).map(publicEntry) });
}

async function toggleFlag(admin, teacherId, body) {
  const entryId = String(body.entryId || "");
  if (!isUuid(entryId)) return jsonError("Choose a submitted photo.");
  const flagged = body.flagged !== false;

  const { data, error } = await admin
    .from("projector_work_queue")
    .update({ flagged_at: flagged ? new Date().toISOString() : null })
    .eq("id", entryId)
    .eq("teacher_id", teacherId)
    .select(WORK_QUEUE_SELECT)
    .maybeSingle();

  if (isMissingReviewColumns(error)) return jsonError("Review flags are not set up yet.", 503);
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Submitted photo not found.", 404);
  return NextResponse.json({ entry: publicEntry(data) });
}

async function deleteEntry(admin, teacherId, entryId) {
  if (!isUuid(entryId)) return jsonError("Choose a submitted photo.");

  const { data, error: readError } = await admin
    .from("projector_work_queue")
    .select("id, storage_bucket, storage_path")
    .eq("id", entryId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (readError) {
    if (readError.code === "42P01" || readError.code === "PGRST205") return jsonError("The work queue is not set up yet.", 503);
    return jsonError(readError.message, 500);
  }
  if (!data) return jsonError("Submitted photo not found.", 404);

  const { error: deleteError } = await admin
    .from("projector_work_queue")
    .delete()
    .eq("id", entryId)
    .eq("teacher_id", teacherId);

  if (deleteError) return jsonError(deleteError.message, 500);
  await admin.storage.from(data.storage_bucket || BUCKET).remove([data.storage_path]);
  return NextResponse.json({ ok: true, entryId });
}

async function clearQueue(admin, teacherId) {
  const { data, error: readError } = await admin
    .from("projector_work_queue")
    .select("id, storage_bucket, storage_path")
    .eq("teacher_id", teacherId);

  if (readError) {
    if (readError.code === "42P01" || readError.code === "PGRST205") return jsonError("The work queue is not set up yet.", 503);
    return jsonError(readError.message, 500);
  }

  const { error: deleteError } = await admin.from("projector_work_queue").delete().eq("teacher_id", teacherId);
  if (deleteError) return jsonError(deleteError.message, 500);

  const pathsByBucket = (data || []).reduce((groups, row) => {
    const bucket = row.storage_bucket || BUCKET;
    groups[bucket] = groups[bucket] || [];
    if (row.storage_path) groups[bucket].push(row.storage_path);
    return groups;
  }, {});
  await Promise.allSettled(
    Object.entries(pathsByBucket).map(([bucket, paths]) => admin.storage.from(bucket).remove(paths))
  );

  return NextResponse.json({ ok: true, cleared: data?.length || 0 });
}

export async function GET() {
  const admin = createAdminClient();
  const context = await getTeacherContext(admin);
  if (context.error) return context.error;
  return listQueue(admin, context.user.id);
}

export async function POST(request) {
  const admin = createAdminClient();
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return uploadWork(admin, request);
  }

  const context = await getTeacherContext(admin);
  if (context.error) return context.error;

  const body = await request.json().catch(() => ({}));
  if (body.action === "mark-sent") return markSent(admin, context.user.id, body);
  if (body.action === "mark-reviewed") return markReviewed(admin, context.user.id, body);
  if (body.action === "toggle-flag") return toggleFlag(admin, context.user.id, body);
  if (body.action === "clear") return clearQueue(admin, context.user.id);
  return jsonError("Choose a work queue action.");
}

export async function DELETE(request) {
  const admin = createAdminClient();
  const context = await getTeacherContext(admin);
  if (context.error) return context.error;

  const { searchParams } = new URL(request.url);
  return deleteEntry(admin, context.user.id, searchParams.get("entryId"));
}
