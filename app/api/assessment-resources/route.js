import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { loadAssessmentScheduleData, occurrenceKey } from "@/lib/assessment-resources/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { getCourseAccessForUser } from "@/lib/courses/access";
import {
  LESSON_RESOURCE_BUCKET,
  getLessonResourceSiteSuggestion,
  normalizeLessonResourceSiteName,
  normalizeLessonResourceTitle,
  normalizeLessonResourceUrl,
  validateLessonResourceFile,
} from "@/lib/lesson-resources/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function uuidList(value, limit = 100) {
  return Array.isArray(value) ? [...new Set(value.filter(isUuid))].slice(0, limit) : [];
}

async function contextForCourse(courseId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("Sign in to manage assessment resources.", 401) };
  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) return { error: jsonError("Only teachers can manage assessment resources.", 403) };
  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, owner_id, selected_library_id, school_year_start, school_year_end, schedule_model, ab_meeting_day, pacing_mode"
  );
  if (!access?.course) return { error: jsonError("You cannot edit this class.", 403) };
  return { supabase, admin: createAdminClient(), user, course: access.course };
}

async function createResource({ admin, userId, course, occurrence, resource, lessonIds }) {
  const { data: created, error } = await admin
    .from("assessment_resources")
    .insert({
      ...resource,
      owner_id: userId,
      course_id: course.id,
      rule_id: occurrence.rule_id,
      original_date: occurrence.original_date,
      assignment_date: occurrence.assignment_date,
      assignment_label: occurrence.label,
      assessment_number: occurrence.assessment_number,
    })
    .select("id, owner_id, course_id, rule_id, original_date, assignment_date, assignment_label, assessment_number, resource_type, title, url, storage_bucket, storage_path, file_name, mime_type, size_bytes, created_at")
    .single();
  if (error) throw new Error(error.message);
  const { error: lessonError } = await admin.from("assessment_resource_lessons").insert(
    lessonIds.map((lessonId) => ({ resource_id: created.id, lesson_id: lessonId }))
  );
  if (lessonError) {
    await admin.from("assessment_resources").delete().eq("id", created.id);
    throw new Error(lessonError.message);
  }
  return { ...created, lessonIds, canDelete: true };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid assessment resource request.");
  }
  if (!isUuid(body.courseId)) return jsonError("Choose a valid class.");
  const context = await contextForCourse(body.courseId);
  if (context.error) return context.error;
  const { admin, user, course } = context;

  try {
    if (body.action === "create-link" || body.action === "register-file") {
      const lessonIds = uuidList(body.lessonIds);
      if (lessonIds.length === 0) return jsonError("Choose at least one curriculum lesson.");
      const { data: validLessons, error: lessonsError } = await admin
        .from("curriculum_lessons")
        .select("id")
        .eq("library_id", course.selected_library_id)
        .in("id", lessonIds);
      if (lessonsError) throw new Error(lessonsError.message);
      if ((validLessons || []).length !== lessonIds.length) return jsonError("One of those lessons is not in this class curriculum.");

      const schedule = await loadAssessmentScheduleData({ course, admin });
      const occurrence = schedule.occurrences.find(
        (item) => !item.is_skipped && occurrenceKey(item.rule_id, item.original_date) === occurrenceKey(body.ruleId, body.originalDate)
      );
      if (!occurrence) return jsonError("That numbered assessment is no longer scheduled. Refresh and try again.");

      let created;
      if (body.action === "create-link") {
        const url = normalizeLessonResourceUrl(body.url);
        if (!url) return jsonError("Enter a valid http or https link.");
        let siteSuggestion = getLessonResourceSiteSuggestion(url);
        if (siteSuggestion.source === "unknown") {
          const { data: saved, error: savedError } = await admin
            .from("lesson_resource_site_names")
            .select("display_name")
            .eq("owner_id", user.id)
            .eq("hostname", siteSuggestion.hostname)
            .maybeSingle();
          if (savedError) throw new Error(savedError.message);
          const siteName = normalizeLessonResourceSiteName(saved?.display_name || body.siteName);
          if (!siteName) return jsonError(`Tell MathClaw what to call ${siteSuggestion.hostname} going forward.`);
          if (!saved) {
            const { error: upsertError } = await admin.from("lesson_resource_site_names").upsert({
              owner_id: user.id,
              hostname: siteSuggestion.hostname,
              display_name: siteName,
              updated_at: new Date().toISOString(),
            }, { onConflict: "owner_id,hostname" });
            if (upsertError) throw new Error(upsertError.message);
          }
          siteSuggestion = { ...siteSuggestion, name: siteName };
        }
        created = await createResource({
          admin, userId: user.id, course, occurrence, lessonIds,
          resource: { resource_type: "link", title: normalizeLessonResourceTitle(body.title, siteSuggestion.name), url },
        });
        created.siteNamePreference = { hostname: siteSuggestion.hostname, displayName: siteSuggestion.name };
      } else {
        const storagePath = String(body.storagePath || "");
        if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes("..")) return jsonError("Invalid uploaded file path.");
        const validation = validateLessonResourceFile({ name: body.fileName, size: body.sizeBytes, type: body.mimeType });
        if (validation.error) return jsonError(validation.error);
        const pathParts = storagePath.split("/");
        const storedName = pathParts.pop();
        const { data: stored, error: storageError } = await admin.storage
          .from(LESSON_RESOURCE_BUCKET)
          .list(pathParts.join("/"), { limit: 10, search: storedName });
        if (storageError) throw new Error(storageError.message);
        if (!(stored || []).some((file) => file.name === storedName)) return jsonError("The uploaded file could not be verified.");
        created = await createResource({
          admin, userId: user.id, course, occurrence, lessonIds,
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
      revalidatePath(`/classes/${course.id}/plan`);
      return NextResponse.json({ resource: created });
    }

    if (body.action === "delete") {
      if (!isUuid(body.resourceId)) return jsonError("Assessment resource not found.");
      const { data: resource, error } = await admin
        .from("assessment_resources")
        .select("id, owner_id, resource_type, storage_bucket, storage_path")
        .eq("id", body.resourceId)
        .eq("course_id", course.id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!resource) return jsonError("You can only remove assessment resources you uploaded.", 404);
      if (resource.resource_type === "file" && resource.storage_path) {
        const { error: removeError } = await admin.storage
          .from(resource.storage_bucket || LESSON_RESOURCE_BUCKET)
          .remove([resource.storage_path]);
        if (removeError) throw new Error(removeError.message);
      }
      const { error: deleteError } = await admin.from("assessment_resources").delete().eq("id", resource.id);
      if (deleteError) throw new Error(deleteError.message);
      revalidatePath(`/classes/${course.id}/plan`);
      return NextResponse.json({ deleted: resource.id });
    }
    return jsonError("Unknown assessment resource action.");
  } catch (error) {
    return jsonError(error.message || "Assessment resources could not be updated.", 500);
  }
}
