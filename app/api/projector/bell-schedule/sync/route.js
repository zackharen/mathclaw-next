import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { findActiveBellScheduleBlock } from "@/lib/bell-schedules/constants";
import { eligibleVocabulary, VOCABULARY_CAROUSEL_TYPE } from "@/lib/projector/vocabulary-carousel.mjs";
import {
  broadcastScreenUpdate,
  buildVocabularyCarouselWords,
  vocabularyForCourse,
} from "@/lib/projector/vocabulary-carousel-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const errorResponse = (message, status = 400) => NextResponse.json({ error: message }, { status });

// The tables/column this route depends on may not exist yet if the
// 20260923120000_bell_schedules.sql migration hasn't been applied to this
// Supabase project (undefined_table, undefined_column, or PostgREST's
// schema-cache-miss equivalents). Treat that the same as "nothing
// configured" instead of failing -- mirrors the existing tolerance for a
// not-yet-migrated projector_room_profiles table in vocabulary-carousel/route.js.
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
function isMissingSchema(error) {
  return Boolean(error) && MISSING_SCHEMA_CODES.has(error.code);
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

export async function POST(request) {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Sign in as a teacher to control Projector.", 401);
  if (!isTeacherAccountType(await getAccountTypeForUser(supabase, user))) {
    return errorResponse("Only teachers can control Projector.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const screenId = String(body.screenId || "");
  const courseDate = String(body.courseDate || "");
  const nowMinutes = Number(body.nowMinutes);
  if (!SCREEN_IDS.includes(screenId)) return errorResponse("Choose a screen number from 1 to 12.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(courseDate)) return errorResponse("courseDate must be YYYY-MM-DD.");
  if (!Number.isInteger(nowMinutes) || nowMinutes < 0 || nowMinutes >= 1440) {
    return errorResponse("nowMinutes must be 0-1439.");
  }

  try {
    const { data: calendarDay, error: calendarError } = await admin
      .from("school_calendar_days")
      .select("bell_schedule_type_id")
      .eq("owner_id", user.id)
      .eq("class_date", courseDate)
      .maybeSingle();
    if (calendarError && !isMissingSchema(calendarError)) throw calendarError;
    const scheduleTypeId = calendarDay?.bell_schedule_type_id;
    if (!scheduleTypeId) return NextResponse.json({ active: false });

    const { data: blocks, error: blocksError } = await admin
      .from("teacher_bell_schedule_blocks")
      .select("id, course_id, start_time, end_time")
      .eq("owner_id", user.id)
      .eq("schedule_type_id", scheduleTypeId);
    if (blocksError && !isMissingSchema(blocksError)) throw blocksError;
    const activeBlock = findActiveBellScheduleBlock(blocks || [], nowMinutes);
    if (!activeBlock) return NextResponse.json({ active: false });

    const { data: session, error: sessionError } = await admin
      .from("projector_sessions")
      .select("id, screen_tokens, screen_states")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;
    const token = session?.screen_tokens?.[screenId];
    if (!session || !token) return errorResponse("Open Projector once to set up this screen, then try again.");

    const currentCarousel = carouselFromState(session.screen_states?.[screenId]);
    if (currentCarousel?.courseId === activeBlock.course_id && currentCarousel?.bellScheduleBlockId === activeBlock.id) {
      return NextResponse.json({ active: true, courseId: activeBlock.course_id, changed: false });
    }

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, title")
      .eq("id", activeBlock.course_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) return NextResponse.json({ active: false });

    const vocabulary = await vocabularyForCourse(admin, user.id, course.id);
    const eligible = eligibleVocabulary(vocabulary.resources, vocabulary.associations, [], false);
    if (!eligible.length) return NextResponse.json({ active: false });

    const words = buildVocabularyCarouselWords(eligible, token);
    const states = { ...(session.screen_states || {}) };
    states[screenId] = {
      type: VOCABULARY_CAROUSEL_TYPE,
      content: JSON.stringify({
        courseId: course.id,
        courseTitle: course.title || "",
        bellScheduleBlockId: activeBlock.id,
        words,
        intervalSeconds: 30,
        startedAt: new Date().toISOString(),
      }),
    };
    const { error: updateError } = await admin
      .from("projector_sessions")
      .update({ screen_states: states, updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("teacher_id", user.id);
    if (updateError) throw updateError;
    await broadcastScreenUpdate(admin, session.id, [screenId]);

    return NextResponse.json({
      active: true,
      courseId: course.id,
      courseTitle: course.title,
      wordCount: eligible.length,
      changed: true,
      screenStates: states,
    });
  } catch (error) {
    return errorResponse(error.message || "The class schedule could not be checked.", 500);
  }
}
