import {
  LESSON_RESOURCE_BUCKET,
  sanitizeLessonResourceFileName,
  validateLessonResourceFile,
} from "./constants";
import { createClient } from "@/lib/supabase/client";

export async function postLessonResource(body) {
  const response = await fetch("/api/lesson-resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Lesson resources could not be updated.");
  return data;
}

// Uploads to storage, then registers the file against the lessons. If
// registering fails, the stored object is removed so a failed upload never
// leaves an invisible file behind. Shared by the class plan panel and the
// all-classes grid so the rollback cannot drift between them.
export async function uploadLessonResourceFile({ ownerId, courseId, classDate, lessonIds, title, file }) {
  const validation = validateLessonResourceFile(file);
  if (validation.error) throw new Error(validation.error);

  const storagePath = `${ownerId}/${crypto.randomUUID()}/${sanitizeLessonResourceFileName(file.name)}`;
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(LESSON_RESOURCE_BUCKET)
    .upload(storagePath, file, { contentType: validation.mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  try {
    return await postLessonResource({
      action: "register-file",
      courseId,
      classDate,
      lessonIds,
      title,
      storagePath,
      fileName: file.name,
      mimeType: validation.mimeType,
      sizeBytes: file.size,
    });
  } catch (error) {
    await supabase.storage.from(LESSON_RESOURCE_BUCKET).remove([storagePath]);
    throw error;
  }
}
