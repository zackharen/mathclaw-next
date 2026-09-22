import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { getCourseAccessForUser, listEditableCoursesForUser } from "@/lib/courses/access";
import {
  LESSON_RESOURCE_BUCKET,
  buildVocabularyLessonIdsByNumber,
  getLessonResourceSiteSuggestion,
  getLessonResourceTitleSuggestion,
  normalizeLessonResourceSiteName,
  normalizeLessonResourceEdit,
  normalizeLessonResourceTitle,
  normalizeLessonResourceUrl,
  normalizeLessonVocabularyInput,
  normalizeVocabularyLessonNumber,
  LESSON_VOCABULARY_CSV_MAX_ROWS,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { listConnectedTeachers } from "@/lib/lesson-resources/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatLessonLabel } from "@/lib/curriculum/lesson-label";

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

async function allRows(query, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

export async function GET() {
  const context = await getTeacherContext();
  if (context.error) return context.error;
  const { supabase, user, admin } = context;

  try {
    const [resources, courses] = await Promise.all([
      allRows((from, to) =>
        admin
          .from("lesson_resources")
          .select("id, item_kind, resource_type, title, url, file_name, created_at")
          .eq("owner_id", user.id)
          .eq("item_kind", "resource")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      ),
      listEditableCoursesForUser(supabase, user.id, "id, title"),
    ]);

    const associations = [];
    for (let offset = 0; offset < resources.length; offset += 100) {
      const resourceIds = resources.slice(offset, offset + 100).map((resource) => resource.id);
      const { data, error } = await admin
        .from("lesson_resource_lessons")
        .select("resource_id, lesson_id, curriculum_lessons(source_lesson_code, title)")
        .in("resource_id", resourceIds);
      if (error) throw new Error(error.message);
      associations.push(...(data || []));
    }

    const lessonIdsByResource = new Map();
    for (const row of associations) {
      const lessons = lessonIdsByResource.get(row.resource_id) || [];
      lessons.push({
        id: row.lesson_id,
        label: formatLessonLabel(
          row.curriculum_lessons?.source_lesson_code,
          row.curriculum_lessons?.title || "Lesson"
        ),
      });
      lessonIdsByResource.set(row.resource_id, lessons);
    }

    const courseOptions = await Promise.all(
      courses.map(async (course) => {
        const rows = await allRows((from, to) =>
          admin
            .from("course_lesson_plan")
            .select("lesson_id, class_date, curriculum_lessons(source_lesson_code, title)")
            .eq("course_id", course.id)
            .order("class_date", { ascending: true })
            .order("lesson_slot", { ascending: true })
            .range(from, to)
        );
        const seen = new Set();
        const lessons = [];
        for (const row of rows) {
          if (!row.lesson_id || seen.has(row.lesson_id)) continue;
          seen.add(row.lesson_id);
          lessons.push({
            id: row.lesson_id,
            label: formatLessonLabel(
              row.curriculum_lessons?.source_lesson_code,
              row.curriculum_lessons?.title || "Lesson"
            ),
          });
        }
        return { id: course.id, title: course.title, lessons };
      })
    );

    return NextResponse.json({
      resources: resources.map((resource) => ({
        ...resource,
        lessons: lessonIdsByResource.get(resource.id) || [],
      })),
      courses: courseOptions.filter((course) => course.lessons.length > 0),
    });
  } catch (error) {
    return jsonError(error.message || "Uploaded items could not be loaded.", 500);
  }
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

async function validateCourseLesson({ supabase, admin, userId, courseId, lessonId }) {
  if (!isUuid(courseId) || !isUuid(lessonId)) return { error: "Choose a lesson from this class." };
  const access = await getCourseAccessForUser(supabase, userId, courseId, "id, owner_id");
  if (!access?.course) return { error: "You cannot edit this class plan." };

  const { data: rows, error } = await admin
    .from("course_lesson_plan")
    .select("lesson_id")
    .eq("course_id", courseId)
    .eq("lesson_id", lessonId)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!rows?.length) return { error: "That lesson is not scheduled in this class. Refresh and try again." };
  return {};
}

// Links the new lesson before unlinking the old ones, so a failure part-way never
// leaves the resource attached to no lesson -- it would vanish from every plan day
// with no way back to it in the UI.
async function moveResourceToLesson({ admin, resourceId, lessonId }) {
  const { error: linkError } = await admin
    .from("lesson_resource_lessons")
    .upsert(
      { resource_id: resourceId, lesson_id: lessonId },
      { onConflict: "resource_id,lesson_id", ignoreDuplicates: true }
    );
  if (linkError) throw new Error(linkError.message);

  const { error: unlinkError } = await admin
    .from("lesson_resource_lessons")
    .delete()
    .eq("resource_id", resourceId)
    .neq("lesson_id", lessonId);
  if (unlinkError) throw new Error(unlinkError.message);
}

async function createResource({ admin, userId, resource, lessonIds }) {
  const { data: created, error } = await admin
    .from("lesson_resources")
    .insert({ ...resource, owner_id: userId })
    .select("id, owner_id, item_kind, resource_type, title, definition, url, storage_bucket, storage_path, file_name, mime_type, size_bytes, created_at")
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

async function validateStoredFile({ admin, userId, body }) {
  const storagePath = String(body.storagePath || "");
  if (!storagePath.startsWith(`${userId}/`) || storagePath.includes("..")) {
    return { error: "Invalid uploaded file path." };
  }
  const validation = validateLessonResourceFile({
    name: body.fileName,
    size: body.sizeBytes,
    type: body.mimeType,
  });
  if (validation.error) return { error: validation.error };

  const pathParts = storagePath.split("/");
  const storedName = pathParts.pop();
  const folder = pathParts.join("/");
  const { data: storedFiles, error: storageError } = await admin.storage
    .from(LESSON_RESOURCE_BUCKET)
    .list(folder, { limit: 10, search: storedName });
  if (storageError) throw new Error(storageError.message);
  if (!(storedFiles || []).some((file) => file.name === storedName)) {
    return { error: "The uploaded file could not be verified." };
  }

  return {
    values: {
      storage_bucket: LESSON_RESOURCE_BUCKET,
      storage_path: storagePath,
      file_name: normalizeLessonResourceTitle(body.fileName, "File"),
      mime_type: validation.mimeType,
      size_bytes: Number(body.sizeBytes),
    },
  };
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
        let siteSuggestion = getLessonResourceSiteSuggestion(url);
        if (siteSuggestion.source === "unknown") {
          const { data: savedSiteRow, error: savedSiteError } = await admin
            .from("lesson_resource_site_names")
            .select("display_name")
            .eq("owner_id", user.id)
            .eq("hostname", siteSuggestion.hostname)
            .maybeSingle();
          if (savedSiteError) throw new Error(savedSiteError.message);
          const siteName = normalizeLessonResourceSiteName(
            savedSiteRow?.display_name || body.siteName
          );
          if (!siteName) {
            return jsonError(`Tell MathClaw what to call ${siteSuggestion.hostname} going forward.`);
          }
          if (!savedSiteRow) {
            const { error: siteNameError } = await admin.from("lesson_resource_site_names").upsert(
              {
                owner_id: user.id,
                hostname: siteSuggestion.hostname,
                display_name: siteName,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "owner_id,hostname" }
            );
            if (siteNameError) throw new Error(siteNameError.message);
          }
          siteSuggestion = { ...siteSuggestion, name: siteName, source: "saved" };
        }
        created = await createResource({
          admin,
          userId: user.id,
          lessonIds,
          resource: {
            item_kind: "resource",
            resource_type: "link",
            title: normalizeLessonResourceTitle(
              body.title,
              getLessonResourceTitleSuggestion(url) || siteSuggestion.name
            ),
            url,
          },
        });
        created.siteNamePreference = {
          hostname: siteSuggestion.hostname,
          displayName: siteSuggestion.name,
        };
      } else {
        const storedFile = await validateStoredFile({ admin, userId: user.id, body });
        if (storedFile.error) return jsonError(storedFile.error);

        created = await createResource({
          admin,
          userId: user.id,
          lessonIds,
          resource: {
            item_kind: "resource",
            resource_type: "file",
            title: normalizeLessonResourceTitle(body.title, body.fileName),
            ...storedFile.values,
          },
        });
      }

      revalidatePath(`/classes/${body.courseId}/plan`);
      return NextResponse.json({ resource: created });
    }

    if (body.action === "create-vocabulary" || body.action === "register-vocabulary-file") {
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

      const attachmentType =
        body.action === "register-vocabulary-file" ? "file" : String(body.attachmentType || "none");
      const normalized = normalizeLessonVocabularyInput({
        word: body.word,
        definition: body.definition,
        attachmentType,
        url: body.url,
      });
      if (normalized.error) return jsonError(normalized.error);

      let fileValues = {};
      if (attachmentType === "file") {
        const storedFile = await validateStoredFile({ admin, userId: user.id, body });
        if (storedFile.error) return jsonError(storedFile.error);
        fileValues = storedFile.values;
      }

      const vocabulary = await createResource({
        admin,
        userId: user.id,
        lessonIds,
        resource: {
          item_kind: "vocabulary",
          ...normalized.values,
          ...fileValues,
        },
      });
      revalidatePath(`/classes/${body.courseId}/plan`);
      return NextResponse.json({ vocabulary });
    }

    if (body.action === "import-vocabulary-csv") {
      if (!isUuid(body.courseId)) return jsonError("Choose a valid class.");
      const access = await getCourseAccessForUser(supabase, user.id, body.courseId, "id, owner_id");
      if (!access?.course) return jsonError("You cannot edit this class plan.", 403);
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        return jsonError("The CSV does not contain any vocabulary rows.");
      }
      if (body.rows.length > LESSON_VOCABULARY_CSV_MAX_ROWS) {
        return jsonError(`A CSV can contain at most ${LESSON_VOCABULARY_CSV_MAX_ROWS} vocabulary rows.`);
      }

      const planRows = await allRows((from, to) =>
        admin
          .from("course_lesson_plan")
          .select("lesson_id, curriculum_lessons(id, source_lesson_code, title)")
          .eq("course_id", body.courseId)
          .order("class_date", { ascending: true })
          .order("lesson_slot", { ascending: true })
          .range(from, to)
      );
      const lessonsByNumber = buildVocabularyLessonIdsByNumber(planRows);

      const prepared = [];
      const importErrors = [];
      body.rows.forEach((row, index) => {
        const csvRow = Number.isInteger(row?.rowNumber) ? row.rowNumber : index + 1;
        const lessonNumber = normalizeVocabularyLessonNumber(row?.lessonNumber);
        const lessonMatches = lessonsByNumber.get(lessonNumber);
        if (!lessonNumber || !lessonMatches || lessonMatches.length === 0) {
          importErrors.push(`Row ${csvRow}: lesson “${String(row?.lessonNumber || "").trim()}” is not scheduled in this class.`);
          return;
        }
        const normalized = normalizeLessonVocabularyInput({
          word: row?.word,
          definition: row?.definition,
          attachmentType: "none",
          url: "",
        });
        if (normalized.error) {
          importErrors.push(`Row ${csvRow}: ${normalized.error}`);
          return;
        }
        prepared.push({
          id: crypto.randomUUID(),
          lessonIds: lessonMatches,
          values: normalized.values,
        });
      });

      if (importErrors.length > 0) {
        return NextResponse.json(
          { error: "Fix the CSV rows listed below before importing.", errors: importErrors.slice(0, 50) },
          { status: 400 }
        );
      }

      const resourceIds = prepared.map((entry) => entry.id);
      const { error: insertError } = await admin.from("lesson_resources").insert(
        prepared.map((entry) => ({
          id: entry.id,
          owner_id: user.id,
          item_kind: "vocabulary",
          ...entry.values,
        }))
      );
      if (insertError) throw new Error(insertError.message);

      const { error: associationError } = await admin.from("lesson_resource_lessons").insert(
        prepared.flatMap((entry) =>
          entry.lessonIds.map((lessonId) => ({ resource_id: entry.id, lesson_id: lessonId }))
        )
      );
      if (associationError) {
        await admin.from("lesson_resources").delete().in("id", resourceIds).eq("owner_id", user.id);
        throw new Error(associationError.message);
      }

      revalidatePath(`/classes/${body.courseId}/plan`);
      return NextResponse.json({ imported: prepared.length });
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

    if (body.action === "update") {
      if (!isUuid(body.resourceId)) return jsonError("Resource not found.");
      const { data: resource, error } = await admin
        .from("lesson_resources")
        .select("id, item_kind, resource_type, title, url")
        .eq("id", body.resourceId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!resource) return jsonError("Resource not found.", 404);
      if (resource.item_kind === "vocabulary") {
        return jsonError("Vocabulary entries are edited from their lesson card.");
      }

      const normalized = normalizeLessonResourceEdit({
        resourceType: resource.resource_type,
        title: body.title,
        url: body.url,
      });
      if (normalized.error) return jsonError(normalized.error);

      const lessonId = body.lessonId ? String(body.lessonId) : "";
      if (lessonId) {
        const lessonCheck = await validateCourseLesson({
          supabase,
          admin,
          userId: user.id,
          courseId: body.courseId,
          lessonId,
        });
        if (lessonCheck.error) return jsonError(lessonCheck.error);
      }
      const updates = { ...normalized.values, updated_at: new Date().toISOString() };

      const { data: updated, error: updateError } = await admin
        .from("lesson_resources")
        .update(updates)
        .eq("id", resource.id)
        .eq("owner_id", user.id)
        .select("id, resource_type, title, url")
        .single();
      if (updateError) throw new Error(updateError.message);
      if (lessonId) await moveResourceToLesson({ admin, resourceId: resource.id, lessonId });
      if (isUuid(body.courseId)) revalidatePath(`/classes/${body.courseId}/plan`);
      return NextResponse.json({
        resource: lessonId ? { ...updated, lessonIds: [lessonId] } : updated,
      });
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
