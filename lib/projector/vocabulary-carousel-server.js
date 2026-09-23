import crypto from "crypto";
import { shuffledVocabulary } from "./vocabulary-carousel.mjs";

async function allRows(makeQuery) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if ((data || []).length < 500) return result;
  }
}

// Shared by the manual "Push Vocabulary to Projector" API and the
// schedule-driven autopilot resolver, so both see identical eligibility.
export async function vocabularyForCourse(admin, teacherId, courseId) {
  const plan = await allRows((from, to) => admin.from("course_lesson_plan")
    .select("lesson_id, status").eq("course_id", courseId).range(from, to));
  const lessonIds = [...new Set(plan.map((row) => row.lesson_id).filter(Boolean))];
  const completedLessonIds = [...new Set(plan.filter((row) => row.status === "completed").map((row) => row.lesson_id))];
  if (!lessonIds.length) return { resources: [], associations: [], completedLessonIds };
  const associations = [];
  for (let index = 0; index < lessonIds.length; index += 100) {
    associations.push(...await allRows((from, to) => admin.from("lesson_resource_lessons")
      .select("resource_id, lesson_id").in("lesson_id", lessonIds.slice(index, index + 100)).range(from, to)));
  }
  const resourceIds = [...new Set(associations.map((row) => row.resource_id))];
  const resources = [];
  for (let index = 0; index < resourceIds.length; index += 100) {
    const { data, error } = await admin.from("lesson_resources")
      .select("id, title, definition, resource_type, mime_type, storage_path")
      .eq("owner_id", teacherId).eq("item_kind", "vocabulary")
      .in("id", resourceIds.slice(index, index + 100));
    if (error) throw error;
    resources.push(...(data || []));
  }
  return { resources, associations, completedLessonIds };
}

export async function broadcastScreenUpdate(admin, sessionId, screenIds) {
  const channel = admin.channel(`projector-session-${sessionId}`);
  try {
    for (const screenId of screenIds) {
      await Promise.race([
        channel.send({ type: "broadcast", event: "screen-updated", payload: { screenId, refetch: true } }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
  } finally {
    await admin.removeChannel(channel);
  }
}

// Shuffles eligible vocabulary into the {id, word, definition, image} shape
// the receiver's VocabularyCarouselWidget expects. `token` is the receiving
// screen's own token, needed for the signed private-image open URL.
export function buildVocabularyCarouselWords(eligible, token) {
  return shuffledVocabulary(eligible, crypto.randomInt).map((entry) => ({
    id: entry.id,
    word: entry.title,
    definition: entry.definition || "",
    image: entry.resource_type === "file" && entry.mime_type?.startsWith("image/") && entry.storage_path
      ? `/api/projector/vocabulary-carousel?image=${encodeURIComponent(entry.id)}&token=${encodeURIComponent(token)}`
      : "",
  }));
}
