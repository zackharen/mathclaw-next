import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { LESSON_RESOURCE_BUCKET } from "@/lib/lesson-resources/constants";
import { eligibleVocabulary, VOCABULARY_CAROUSEL_TYPE } from "@/lib/projector/vocabulary-carousel.mjs";
import { buildVocabularyCarouselWords, vocabularyForCourse } from "@/lib/projector/vocabulary-carousel-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const DEFAULT_SLOTS = Array.from({ length: 4 }, (_, index) => ({ name: `Screen ${index + 1}`, enabled: true }));
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const errorResponse = (message, status = 400) => NextResponse.json({ error: message }, { status });

async function teacherContext(admin) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Sign in as a teacher to control Projector.", 401) };
  if (!isTeacherAccountType(await getAccountTypeForUser(supabase, user))) {
    return { error: errorResponse("Only teachers can control Projector.", 403) };
  }
  return { supabase, user, admin };
}

async function assertCourse(context, courseId) {
  if (!isUuid(courseId)) return null;
  const access = await getCourseAccessForUser(context.supabase, context.user.id, courseId, "id, owner_id, title");
  return access?.course || null;
}

async function currentSession(admin, teacherId) {
  const { data, error } = await admin.from("projector_sessions").select("*")
    .eq("teacher_id", teacherId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureSession(admin, teacherId) {
  const existing = await currentSession(admin, teacherId);
  if (existing) return existing;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await admin.from("projector_sessions").insert({
      teacher_id: teacherId,
      pin: String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
      screen_tokens: Object.fromEntries(SCREEN_IDS.map((id) => [id, crypto.randomUUID()])),
      screen_states: Object.fromEntries(SCREEN_IDS.map((id) => [id, null])),
    }).select("*").single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    const concurrent = await currentSession(admin, teacherId);
    if (concurrent) return concurrent;
  }
  throw new Error("Could not create a projector session.");
}

async function availableScreens(admin, teacherId) {
  const { data, error } = await admin.from("projector_room_profiles")
    .select("slots").eq("teacher_id", teacherId).eq("is_active", true).limit(1).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
  const slots = Array.isArray(data?.slots) && data.slots.length ? data.slots : DEFAULT_SLOTS;
  return slots.slice(0, 12).map((slot, index) => ({
    id: String(index + 1),
    name: String(slot?.name || `Screen ${index + 1}`).slice(0, 60),
    enabled: slot?.enabled !== false && slot?.autopilot?.enabled !== true,
    reason: slot?.autopilot?.enabled ? "Autopilot is on" : slot?.enabled === false ? "Screen is off" : "",
  }));
}

function carouselFromState(state) {
  if (state?.type !== VOCABULARY_CAROUSEL_TYPE) return null;
  try {
    const content = JSON.parse(state.content);
    return content && Array.isArray(content.words) ? content : null;
  } catch {
    return null;
  }
}

async function broadcast(admin, sessionId, screenIds) {
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

async function imageResponse(admin, token, resourceId) {
  if (!isUuid(token) || !isUuid(resourceId)) return errorResponse("Image not found.", 404);
  for (const screenId of SCREEN_IDS) {
    const { data: session, error } = await admin.from("projector_sessions")
      .select("teacher_id, screen_states").contains("screen_tokens", { [screenId]: token })
      .limit(1).maybeSingle();
    if (error) throw error;
    if (!session) continue;
    const imageIsShowing = SCREEN_IDS.some((id) =>
      carouselFromState(session.screen_states?.[id])?.words.some((word) => word.id === resourceId && word.image)
    );
    if (!imageIsShowing) break;
    const { data: resource, error: resourceError } = await admin.from("lesson_resources")
      .select("storage_bucket, storage_path, mime_type").eq("id", resourceId)
      .eq("owner_id", session.teacher_id).eq("item_kind", "vocabulary").maybeSingle();
    if (resourceError) throw resourceError;
    if (!resource?.storage_path || !resource.mime_type?.startsWith("image/")) break;
    const { data, error: storageError } = await admin.storage
      .from(resource.storage_bucket || LESSON_RESOURCE_BUCKET).createSignedUrl(resource.storage_path, 300);
    if (storageError || !data?.signedUrl) throw storageError || new Error("Image could not be opened.");
    return NextResponse.redirect(data.signedUrl);
  }
  return errorResponse("Image not found.", 404);
}

export async function GET(request) {
  const admin = createAdminClient();
  const params = request.nextUrl.searchParams;
  try {
    if (params.has("image")) return await imageResponse(admin, params.get("token"), params.get("image"));
    const context = await teacherContext(admin);
    if (context.error) return context.error;
    const courseId = params.get("courseId");
    if (!(await assertCourse(context, courseId))) return errorResponse("You cannot use this class.", 403);
    const [screens, session, vocabulary] = await Promise.all([
      availableScreens(admin, context.user.id),
      currentSession(admin, context.user.id),
      vocabularyForCourse(admin, context.user.id, courseId),
    ]);
    const runningScreenIds = SCREEN_IDS.filter((id) =>
      carouselFromState(session?.screen_states?.[id])?.courseId === courseId
    );
    const runningStartedAt = runningScreenIds.length
      ? carouselFromState(session.screen_states[runningScreenIds[0]])?.startedAt || null
      : null;
    return NextResponse.json({
      screens,
      runningScreenIds,
      runningStartedAt,
      allCount: eligibleVocabulary(vocabulary.resources, vocabulary.associations, [], false).length,
      completedCount: eligibleVocabulary(vocabulary.resources, vocabulary.associations, vocabulary.completedLessonIds, true).length,
    });
  } catch (error) {
    return errorResponse(error.message || "Projector setup could not be loaded.", 500);
  }
}

export async function POST(request) {
  const admin = createAdminClient();
  const context = await teacherContext(admin);
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const course = await assertCourse(context, body.courseId);
  if (!course) return errorResponse("You cannot use this class.", 403);
  try {
    const session = await ensureSession(admin, context.user.id);
    const screens = await availableScreens(admin, context.user.id);
    const states = { ...(session.screen_states || {}) };
    if (body.action === "stop") {
      const stopped = SCREEN_IDS.filter((id) =>
        carouselFromState(states[id])?.courseId === body.courseId
      );
      stopped.forEach((id) => { states[id] = null; });
      if (stopped.length) {
        const { error } = await admin.from("projector_sessions").update({ screen_states: states, updated_at: new Date().toISOString() })
          .eq("id", session.id).eq("teacher_id", context.user.id);
        if (error) throw error;
        await broadcast(admin, session.id, stopped);
      }
      return NextResponse.json({ ok: true, runningScreenIds: [] });
    }
    if (body.action !== "start") return errorResponse("Unknown carousel action.");
    const selected = [...new Set(Array.isArray(body.screenIds) ? body.screenIds.map(String) : [])];
    if (!selected.length || selected.some((id) => !screens.some((screen) => screen.id === id && screen.enabled))) {
      return errorResponse("Choose at least one available projector screen.");
    }
    const intervalSeconds = Number(body.intervalSeconds);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 3600) {
      return errorResponse("Choose an interval from 10 seconds to 60 minutes.");
    }
    const vocabulary = await vocabularyForCourse(admin, context.user.id, body.courseId);
    const eligible = eligibleVocabulary(
      vocabulary.resources, vocabulary.associations, vocabulary.completedLessonIds, body.completedOnly === true
    );
    if (!eligible.length) return errorResponse("This class has no vocabulary words for that selection.");
    let startedAt = new Date().toISOString();
    if (body.startAt) {
      const scheduled = new Date(body.startAt);
      if (Number.isNaN(scheduled.getTime())) return errorResponse("Choose a valid start time.");
      startedAt = scheduled.toISOString();
    }
    const previouslyRunning = SCREEN_IDS.filter((id) => carouselFromState(states[id])?.courseId === body.courseId);
    previouslyRunning.filter((id) => !selected.includes(id)).forEach((id) => { states[id] = null; });
    for (const screenId of selected) {
      const token = session.screen_tokens?.[screenId];
      if (!token) return errorResponse("Open Projector once to set up this screen, then try again.");
      const words = buildVocabularyCarouselWords(eligible, token);
      states[screenId] = {
        type: VOCABULARY_CAROUSEL_TYPE,
        content: JSON.stringify({ courseId: body.courseId, courseTitle: course.title || "", words, intervalSeconds, startedAt }),
      };
    }
    const { error } = await admin.from("projector_sessions").update({ screen_states: states, updated_at: startedAt })
      .eq("id", session.id).eq("teacher_id", context.user.id);
    if (error) throw error;
    await broadcast(admin, session.id, [...new Set([...previouslyRunning, ...selected])]);
    return NextResponse.json({ ok: true, wordCount: eligible.length, runningScreenIds: selected, startedAt });
  } catch (error) {
    return errorResponse(error.message || "The vocabulary carousel could not start.", 500);
  }
}
