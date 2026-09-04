import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { getCourseAccessForUser } from "@/lib/courses/access";
import {
  LESSON_RESOURCE_BUCKET,
  normalizeLessonResourceTitle,
  normalizeLessonResourceUrl,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { listConnectedTeachers } from "@/lib/lesson-resources/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normalizeUuidList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isUuid))].slice(0, limit);
}

async function getTeacherContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in to manage lesson resources.", 401) };
  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage lesson resources.", 403) };
  }
  return { supabase, user, admin: createAdminClient() };
}

async function validateLessonSelection({ supabase, admin, userId, courseId, classDate, lessonIds }) {
  if (!isUuid(courseId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(classDate || ""))) {
    return { error: "Choose lessons from a valid planning day." };
  }
  if (lessonIds.length === 0) return { error: "Choose at least one lesson." };

  const access = await getCourseAccessForUser(supabase, userId, courseId, "id, owner_id");
  if (!access?.course) return { error: "You cannot edit this class plan." };

  const { data: rows, error } = await admin
    .from("course_lesson_plan")
    .select("lesson_id")
    .eq("course_id", courseId)
    .eq("class_date", classDate)
    .in("lesson_id", lessonIds);

  if (error) throw new Error(error.message);
  const scheduledIds = new Set((rows || []).map((row) => row.lesson_id));
  if (lessonIds.some((lessonId) => !scheduledIds.has(lessonId))) {
    return { error: "One of those lessons is no longer scheduled on this day. Refresh and try again." };
  }
  return { course: access.course };
}

async function createResource({ admin, userId, resource, lessonIds }) {
  const { data: created, error } = await admin
    .from("lesson_resources")
    .insert({ ...resource, owner_id: userId })
    .select("id, owner_id, resource_type, title, url, storage_bucket, storage_path, file_name, mime_type, size_bytes, created_at")
    .single();

  if (error) throw new Error(error.message);

  const { error: associationError } = await admin.from("lesson_resource_lessons").insert(
    lessonIds.map((lessonId) => ({ resource_id: created.id, lesson_id: lessonId }))
  );
  if (associationError) {
    await admin.from("lesson_resources").delete().eq("id", created.id);
    throw new Error(associationError.message);
  }

  return { ...created, lessonIds, sharedWith: [] };
}

async function updateDirectShares({ admin, userId, resourceId, teacherIds }) {
  const { data: resource, error } = await admin
    .from("lesson_resources")
    .select("id")
    .eq("id", resourceId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!resource) return { error: "Resource not found." };

  const connected = await listConnectedTeachers(userId, admin);
  const connectedIds = new Set(connected.map((teacher) => teacher.id));
  if (teacherIds.some((teacherId) => !connectedIds.has(teacherId))) {
    return { error: "Resources can only be shared with connected teachers." };
  }

  const { data: existing, error: existingError } = await admin
    .from("lesson_resource_shares")
    .select("teacher_id")
    .eq("resource_id", resourceId);
  if (existingError) throw new Error(existingError.message);

  const existingIds = new Set((existing || []).map((share) => share.teacher_id));
  const additions = teacherIds.filter((teacherId) => !existingIds.has(teacherId));
  const removals = [...existingIds].filter((teacherId) => !teacherIds.includes(teacherId));

  if (additions.length > 0) {
    const { error: insertError } = await admin.from("lesson_resource_shares").insert(
      additions.map((teacherId) => ({ resource_id: resourceId, teacher_id: teacherId }))
    );
    if (insertError) throw new Error(insertError.message);
  }
  if (removals.length > 0) {
    const { error: deleteError } = await admin
      .from("lesson_resource_shares")
      .delete()
      .eq("resource_id", resourceId)
      .in("teacher_id", removals);
    if (deleteError) throw new Error(deleteError.message);
  }

  return { teacherIds };
}

async function updateLibraryShares({ admin, userId, teacherIds }) {
  const connected = await listConnectedTeachers(userId, admin);
  const connectedIds = new Set(connected.map((teacher) => teacher.id));
  if (teacherIds.some((teacherId) => !connectedIds.has(teacherId))) {
    return { error: "Your library can only be shared with connected teachers." };
  }

  const { data: existing, error: existingError } = await admin
    .from("teacher_resource_library_shares")
    .select("teacher_id")
    .eq("owner_id", userId);
  if (existingError) throw new Error(existingError.message);

  const existingIds = new Set((existing || []).map((share) => share.teacher_id));
  const additions = teacherIds.filter((teacherId) => !existingIds.has(teacherId));
  const removals = [...existingIds].filter((teacherId) => !teacherIds.includes(teacherId));

  if (additions.length > 0) {
    const { error: insertError } = await admin.from("teacher_resource_library_shares").insert(
      additions.map((teacherId) => ({ owner_id: userId, teacher_id: teacherId }))
    );
    if (insertError) throw new Error(insertError.message);
  }
  if (removals.length > 0) {
    const { error: deleteError } = await admin
      .from("teacher_resource_library_shares")
      .delete()
      .eq("owner_id", userId)
      .in("teacher_id", removals);
    if (deleteError) throw new Error(deleteError.message);
  }

  return { teacherIds };
}

export async function POST(request) {
  const context = await getTeacherContext();
  if (context.error) return context.error;
  const { supabase, user, admin } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid lesson resource request.");
  }

  try {
    if (body.action === "create-link" || body.action === "register-file") {
      const lessonIds = normalizeUuidList(body.lessonIds);
      const selection = await validateLessonSelection({
        supabase,
        admin,
        userId: user.id,
        courseId: body.courseId,
        classDate: body.classDate,
        lessonIds,
      });
      if (selection.error) return jsonError(selection.error);

      let created;
      if (body.action === "create-link") {
        const url = normalizeLessonResourceUrl(body.url);
        if (!url) return jsonError("Enter a valid http or https link.");
        const fallbackTitle = new URL(url).hostname.replace(/^www\./, "");
        created = await createResource({
          admin,
          userId: user.id,
          lessonIds,
          resource: {
            resource_type: "link",
            title: normalizeLessonResourceTitle(body.title, fallbackTitle),
            url,
          },
        });
      } else {
        const storagePath = String(body.storagePath || "");
        if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes("..")) {
          return jsonError("Invalid uploaded file path.");
        }
        const validation = validateLessonResourceFile({
          name: body.fileName,
          size: body.sizeBytes,
          type: body.mimeType,
        });
        if (validation.error) return jsonError(validation.error);

        const pathParts = storagePath.split("/");
        const storedName = pathParts.pop();
        const folder = pathParts.join("/");
        const { data: storedFiles, error: storageError } = await admin.storage
          .from(LESSON_RESOURCE_BUCKET)
          .list(folder, { limit: 10, search: storedName });
        if (storageError) return jsonError(storageError.message, 500);
        if (!(storedFiles || []).some((file) => file.name === storedName)) {
          return jsonError("The uploaded file could not be verified.");
        }

        created = await createResource({
          admin,
          userId: user.id,
          lessonIds,
          resource: {
            resource_type: "file",
            title: normalizeLessonResourceTitle(body.title, body.fileName),
            storage_bucket: LESSON_RESOURCE_BUCKET,
            storage_path: storagePath,
            file_name: normalizeLessonResourceTitle(body.fileName, "File"),
            mime_type: validation.mimeType,
            size_bytes: Number(body.sizeBytes),
          },
        });
      }

      revalidatePath(`/classes/${body.courseId}/plan`);
      return NextResponse.json({ resource: created });
    }

    if (body.action === "delete") {
      if (!isUuid(body.resourceId)) return jsonError("Resource not found.");
      const { data: resource, error } = await admin
        .from("lesson_resources")
        .select("id, resource_type, storage_bucket, storage_path")
        .eq("id", body.resourceId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!resource) return jsonError("Resource not found.", 404);

      if (resource.resource_type === "file" && resource.storage_path) {
        const { error: removeError } = await admin.storage
          .from(resource.storage_bucket || LESSON_RESOURCE_BUCKET)
          .remove([resource.storage_path]);
        if (removeError) throw new Error(removeError.message);
      }
      const { error: deleteError } = await admin
        .from("lesson_resources")
        .delete()
        .eq("id", resource.id)
        .eq("owner_id", user.id);
      if (deleteError) throw new Error(deleteError.message);
      return NextResponse.json({ deleted: resource.id });
    }

    if (body.action === "update-resource-shares") {
      if (!isUuid(body.resourceId)) return jsonError("Resource not found.");
      const result = await updateDirectShares({
        admin,
        userId: user.id,
        resourceId: body.resourceId,
        teacherIds: normalizeUuidList(body.teacherIds, 100),
      });
      if (result.error) return jsonError(result.error);
      return NextResponse.json(result);
    }

    if (body.action === "update-library-shares") {
      const result = await updateLibraryShares({
        admin,
        userId: user.id,
        teacherIds: normalizeUuidList(body.teacherIds, 100),
      });
      if (result.error) return jsonError(result.error);
      revalidatePath("/dashboard");
      return NextResponse.json(result);
    }

    return jsonError("Unknown lesson resource action.");
  } catch (error) {
    return jsonError(error.message || "Lesson resources could not be updated.", 500);
  }
}
