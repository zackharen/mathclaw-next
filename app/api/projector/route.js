import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { sceneItemCandidates, sceneItemContentHash } from "@/lib/projector/scene-item-extraction.mjs";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const DEFAULT_SCREEN_IDS = ["1", "2", "3", "4"];
const CONTENT_TYPES = new Set(["text", "latex", "image", "video", "clock", "word_wall"]);
const LIBRARY_CATEGORIES = new Set(["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"]);
const LIBRARY_TITLE_LIMIT = 80;
const LIBRARY_CONTENT_LIMIT = 8 * 1024 * 1024;
const SCENE_TITLE_LIMIT = 80;
const SCENE_STATE_LIMIT = 24 * 1024 * 1024;
const SCENE_FOLDER_TITLE_LIMIT = 60;
const TOP_TEXT_LIMIT = 500;
const CAPTION_LIMIT = 140;
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const TAKEOVER_STATE_KEY = "__mathclaw_projector_takeover_v1__";
const REVIEW_STATE_KEY = "__mathclaw_projector_review_v1__";
const BROADCAST_SEND_TIMEOUT_MS = 1500;

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeScreenNumber(value) {
  const screenNumber = String(value || "").trim();
  return SCREEN_IDS.includes(screenNumber) ? screenNumber : null;
}

function normalizeScreenIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeScreenNumber).filter(Boolean))];
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
      ...(slot?.autopilot && typeof slot.autopilot === "object" ? { autopilot: normalizeAutopilotConfig(slot.autopilot) } : {}),
    }))
    .filter((slot, index, slots) => slots.findIndex((item) => item.name.toLowerCase() === slot.name.toLowerCase()) === index);
}

function normalizeAutopilotConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const mode = ["items", "playlist", "word_wall", "clock"].includes(source.mode) ? source.mode : "clock";
  const intervalSeconds = Math.min(Math.max(Number.parseInt(source.intervalSeconds, 10) || 60, 10), 3600);
  const config = {
    enabled: source.enabled === true,
    mode,
    intervalSeconds,
    shuffle: source.shuffle === true,
  };
  if (mode === "items") {
    config.itemIds = Array.isArray(source.itemIds) ? source.itemIds.filter(isUuid).slice(0, 60) : [];
  }
  if (mode === "playlist") {
    config.playlistId = isUuid(source.playlistId) ? source.playlistId : "";
  }
  if (mode === "word_wall") {
    config.wordListId = isUuid(source.wordListId) ? source.wordListId : "";
  }
  if (mode === "clock") {
    config.showPeriod = source.showPeriod === true;
  }
  return config;
}

function roomScreenIds(room) {
  const slots = normalizeRoomSlots(room?.slots);
  return slots.length ? slots.map((_, index) => String(index + 1)) : DEFAULT_SCREEN_IDS;
}

function enabledRoomScreenIds(room) {
  const slots = normalizeRoomSlots(room?.slots);
  const source = slots.length ? slots : DEFAULT_SCREEN_IDS.map(() => ({ enabled: true }));
  return source
    .map((slot, index) => (slot.enabled === false ? null : String(index + 1)))
    .filter(Boolean);
}

function autopilotRoomScreenIds(room) {
  const slots = normalizeRoomSlots(room?.slots);
  return slots
    .map((slot, index) => (slot.enabled !== false && slot.autopilot?.enabled ? String(index + 1) : null))
    .filter(Boolean);
}

async function getActiveRoom(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(error.message);
  }

  return data || null;
}

async function getActiveRoomScreenIds(admin, teacherId) {
  const room = await getActiveRoom(admin, teacherId);
  return roomScreenIds(room);
}

async function getEnabledActiveRoomScreenIds(admin, teacherId, options = {}) {
  const room = await getActiveRoom(admin, teacherId);
  const enabledIds = enabledRoomScreenIds(room);
  if (!options.excludeAutopilot) return enabledIds;
  const autopilotIds = new Set(autopilotRoomScreenIds(room));
  return enabledIds.filter((screenId) => !autopilotIds.has(screenId));
}

function normalizeTopText(type, topText, content = "") {
  if (type === "text" && !String(content || "").startsWith(QUESTION_CONTENT_PREFIX)) return "";
  return String(topText || "").trim().slice(0, TOP_TEXT_LIMIT);
}

function normalizeCaption(caption) {
  return String(caption || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, CAPTION_LIMIT);
}

function displayContent(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return source;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    return typeof parsed.content === "string" ? parsed.content : "";
  } catch {
    return source;
  }
}

function isQuestionContent(content) {
  return String(content || "").startsWith(QUESTION_CONTENT_PREFIX);
}

function normalizeState(type, content, topText = "", revealAnswer = false, caption = "") {
  if (!CONTENT_TYPES.has(type)) return null;
  const rawContent = String(content || "");
  const safeContent = type === "text" || type === "latex" ? rawContent : rawContent.trim();
  if (!safeContent.trim()) return null;
  if (type === "clock" || type === "word_wall") {
    return { type, content: safeContent };
  }
  const mediaContent = displayContent(safeContent).trim();
  if (type === "video" && mediaContent.startsWith("data:")) return null;
  if (type === "video" && /\.(mov|avi|wmv|mkv)(\?|#|$)/i.test(mediaContent)) return null;
  const safeTopText = normalizeTopText(type, topText, safeContent);
  const safeCaption = normalizeCaption(caption);
  return {
    type,
    content: safeContent,
    ...(safeTopText ? { topText: safeTopText } : {}),
    ...(safeCaption ? { caption: safeCaption } : {}),
    ...(isQuestionContent(safeContent) && revealAnswer ? { revealAnswer: true } : {}),
  };
}

function cloneJson(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function sessionScreenStates(session) {
  return session?.screen_states && typeof session.screen_states === "object" ? session.screen_states : {};
}

function takeoverStateFrom(screenStates) {
  const takeover = screenStates?.[TAKEOVER_STATE_KEY];
  if (!takeover || typeof takeover !== "object") return null;
  const sourceScreenId = normalizeScreenNumber(takeover.sourceScreenId);
  const activeScreenIds = normalizeScreenIds(takeover.activeScreenIds);
  const heldScreenStates = takeover.heldScreenStates && typeof takeover.heldScreenStates === "object"
    ? takeover.heldScreenStates
    : {};
  if (!sourceScreenId || !activeScreenIds.length) return null;
  return {
    sourceScreenId,
    activeScreenIds,
    heldScreenStates,
    startedAt: takeover.startedAt || null,
  };
}

function reviewStateFrom(screenStates) {
  const review = screenStates?.[REVIEW_STATE_KEY];
  if (!review || typeof review !== "object") return null;
  const screenIds = normalizeScreenIds(review.screenIds);
  const pages = Array.isArray(review.pages)
    ? review.pages.map((page) => {
        const assignments = page?.assignments && typeof page.assignments === "object" ? page.assignments : {};
        return {
          assignments: Object.fromEntries(
            Object.entries(assignments)
              .map(([screenId, entry]) => {
                const safeScreenId = normalizeScreenNumber(screenId);
                if (!safeScreenId || !entry?.url) return null;
                return [
                  safeScreenId,
                  {
                    id: String(entry.id || ""),
                    url: String(entry.url || ""),
                    caption: normalizeCaption(entry.caption || ""),
                  },
                ];
              })
              .filter(Boolean)
          ),
        };
      })
    : [];
  const pageIndex = Math.min(Math.max(Number.parseInt(review.pageIndex, 10) || 0, 0), Math.max(pages.length - 1, 0));
  if (!screenIds.length || !pages.length) return null;
  return {
    screenIds,
    pages,
    pageIndex,
    showCaptions: review.showCaptions !== false,
    startedAt: review.startedAt || null,
    restoreStates: review.restoreStates && typeof review.restoreStates === "object" ? review.restoreStates : null,
  };
}

function publicReviewStateFrom(screenStates) {
  const review = reviewStateFrom(screenStates);
  if (!review) return null;
  const { restoreStates, ...publicReview } = review;
  void restoreStates;
  return publicReview;
}

function publicTakeoverStateFrom(screenStates) {
  const takeover = takeoverStateFrom(screenStates);
  if (!takeover) return null;
  return {
    sourceScreenId: takeover.sourceScreenId,
    activeScreenIds: takeover.activeScreenIds,
    startedAt: takeover.startedAt,
  };
}

function clientScreenStates(screenStates) {
  const source = screenStates && typeof screenStates === "object" ? screenStates : {};
  const nextStates = { ...source };
  const takeover = publicTakeoverStateFrom(source);
  if (takeover) nextStates[TAKEOVER_STATE_KEY] = takeover;
  const review = publicReviewStateFrom(source);
  if (review) nextStates[REVIEW_STATE_KEY] = review;
  return nextStates;
}

function stripTakeoverState(screenStates) {
  const nextStates = { ...(screenStates && typeof screenStates === "object" ? screenStates : {}) };
  delete nextStates[TAKEOVER_STATE_KEY];
  return nextStates;
}

function stripReviewState(screenStates) {
  const nextStates = { ...(screenStates && typeof screenStates === "object" ? screenStates : {}) };
  delete nextStates[REVIEW_STATE_KEY];
  return nextStates;
}

function restoreTakeoverState(screenStates) {
  const takeover = takeoverStateFrom(screenStates);
  if (!takeover) return { screenStates: stripTakeoverState(screenStates), takeover: null };
  const nextStates = stripTakeoverState(screenStates);
  if (Object.keys(takeover.heldScreenStates || {}).length) {
    takeover.activeScreenIds.forEach((screenId) => {
      nextStates[screenId] = cloneJson(takeover.heldScreenStates?.[screenId]);
    });
  }
  return { screenStates: nextStates, takeover };
}

function effectiveScreenState(screenStates, screenId) {
  const review = reviewStateFrom(screenStates);
  const reviewedEntry = review?.pages?.[review.pageIndex]?.assignments?.[String(screenId)];
  if (reviewedEntry?.url) {
    return {
      type: "image",
      content: reviewedEntry.url,
      ...(review.showCaptions && reviewedEntry.caption ? { caption: reviewedEntry.caption } : {}),
    };
  }
  const takeover = takeoverStateFrom(screenStates);
  if (takeover?.activeScreenIds.includes(String(screenId))) {
    return screenStates?.[takeover.sourceScreenId] || null;
  }
  return screenStates?.[screenId] || null;
}

function reviewBroadcastPayload(screenStates, screenId) {
  return buildBroadcastPayload(screenId, effectiveScreenState(screenStates, screenId));
}

function normalizeSceneStates(value) {
  const source = value && typeof value === "object" ? value : {};
  return SCREEN_IDS.reduce((states, screenId) => {
    const state = source[screenId];
    states[screenId] = state ? normalizeState(state.type, state.content, state.topText, state.revealAnswer, state.caption) : null;
    return states;
  }, {});
}

function normalizeLibraryTitle(title, state) {
  const safeTitle = String(title || "").trim().replace(/\s+/g, " ").slice(0, LIBRARY_TITLE_LIMIT);
  if (safeTitle) return safeTitle;
  if (state.type === "latex") return "Saved LaTeX";
  if (state.type === "image") return "Saved image";
  if (state.type === "video") return "Saved video";
  return state.content.slice(0, LIBRARY_TITLE_LIMIT) || "Saved text";
}

function normalizeSceneTitle(title) {
  const safeTitle = String(title || "").trim().replace(/\s+/g, " ").slice(0, SCENE_TITLE_LIMIT);
  return safeTitle || "Saved room setup";
}

function normalizeSceneFolderTitle(title) {
  return String(title || "").trim().replace(/\s+/g, " ").slice(0, SCENE_FOLDER_TITLE_LIMIT);
}

function normalizeSceneFolderId(value) {
  const folderId = String(value || "").trim();
  return isUuid(folderId) ? folderId : null;
}

function normalizeLibraryItem(row) {
  return {
    id: row.id,
    title: row.title,
    content_type: row.content_type,
    content: row.content,
    category: row.category || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeSceneItem(row) {
  return {
    id: row.id,
    title: row.title,
    folder_id: row.folder_id || null,
    screen_states: normalizeSceneStates(row.screen_states),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeSceneFolder(row) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeWordListEntries(entries) {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map((entry) => ({
      word: String(entry?.word || "").trim().replace(/\s+/g, " ").slice(0, 80),
      definition: String(entry?.definition || "").trim().replace(/\s+/g, " ").slice(0, 240),
    }))
    .filter((entry) => entry.word)
    .slice(0, 200);
}

function normalizeWordList(row) {
  return {
    id: row.id,
    name: row.name,
    entries: normalizeWordListEntries(row.entries),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function findScreenNumberForToken(screenTokens, token) {
  return SCREEN_IDS.find((screenId) => screenTokens?.[screenId] === token) || null;
}

async function findSessionByToken(admin, token) {
  for (const screenId of SCREEN_IDS) {
    const { data, error } = await admin
      .from("projector_sessions")
      .select("id, screen_tokens, screen_states")
      .contains("screen_tokens", { [screenId]: token })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }
  return null;
}

async function broadcastScreenUpdates(admin, sessionId, payloads) {
  const channel = admin.channel(`projector-session-${sessionId}`);
  try {
    for (const payload of payloads) {
      await Promise.race([
        channel.send({
          type: "broadcast",
          event: "screen-updated",
          payload,
        }),
        new Promise((resolve) => setTimeout(resolve, BROADCAST_SEND_TIMEOUT_MS)),
      ]);
    }
  } finally {
    await admin.removeChannel(channel);
  }
}

async function persistScreenStates(admin, session, teacherId, screenStates, broadcastScreenIds = []) {
  const { error } = await admin
    .from("projector_sessions")
    .update({ screen_states: screenStates, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("teacher_id", teacherId);

  if (error) return { error };

  const uniqueScreenIds = [...new Set(broadcastScreenIds.map(normalizeScreenNumber).filter(Boolean))];
  if (uniqueScreenIds.length) {
    await broadcastScreenUpdates(
      admin,
      session.id,
      uniqueScreenIds.map((screenId) => buildBroadcastPayload(screenId, screenStates[screenId]))
    );
  }
  return { ok: true };
}

function buildBroadcastPayload(screenId, state) {
  if (!state) return { screenId, type: null, content: null };
  if (state.type === "image" && !state.caption) {
    return { screenId, type: state.type, refetch: true };
  }
  return {
    screenId,
    type: state.type,
    content: state.content,
    topText: state.topText || "",
    caption: state.caption || "",
    revealAnswer: Boolean(state.revealAnswer),
  };
}

async function getTeacherSession(admin, supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to control Projector.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can control Projector.", 403) };
  }

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { error: jsonError(error.message, 500) };
  if (!session) return { error: jsonError("No projector session found.", 404) };
  return { session, user };
}

async function resolvePin(admin, pin, screenNumber) {
  const safePin = String(pin || "").trim();
  const safeScreenNumber = normalizeScreenNumber(screenNumber);

  if (!/^\d{6}$/.test(safePin)) return jsonError("Enter a 6-digit room PIN.");
  if (!safeScreenNumber) return jsonError("Choose a screen number from 1 to 12.");

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("screen_tokens")
    .eq("pin", safePin)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  const token = session?.screen_tokens?.[safeScreenNumber];
  if (!token) return jsonError("That room PIN and screen number were not found.", 404);
  return NextResponse.json({ token });
}

async function listLibrary(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_library_items")
    .select("id, title, content_type, content, category, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ items: [] });
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallback, error: fallbackError } = await admin
        .from("projector_library_items")
        .select("id, title, content_type, content, created_at, updated_at")
        .eq("teacher_id", teacherId)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (fallbackError) return jsonError(fallbackError.message, 500);
      return NextResponse.json({ items: (fallback || []).map(normalizeLibraryItem) });
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ items: (data || []).map(normalizeLibraryItem) });
}

async function listScenes(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_scene_library_items")
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ scenes: [] });
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallbackData, error: fallbackError } = await admin
        .from("projector_scene_library_items")
        .select("id, title, screen_states, created_at, updated_at")
        .eq("teacher_id", teacherId)
        .order("updated_at", { ascending: false })
        .limit(40);

      if (fallbackError) {
        if (fallbackError.code === "42P01" || fallbackError.code === "PGRST205") {
          return NextResponse.json({ scenes: [] });
        }
        return jsonError(fallbackError.message, 500);
      }
      return NextResponse.json({ scenes: (fallbackData || []).map(normalizeSceneItem), folders: [] });
    }
    return jsonError(error.message, 500);
  }

  const { data: folderData, error: folderError } = await admin
    .from("projector_scene_folders")
    .select("id, title, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (folderError) {
    if (folderError.code === "42P01" || folderError.code === "PGRST205") {
      return NextResponse.json({ scenes: (data || []).map(normalizeSceneItem), folders: [] });
    }
    return jsonError(folderError.message, 500);
  }

  return NextResponse.json({
    scenes: (data || []).map(normalizeSceneItem),
    folders: (folderData || []).map(normalizeSceneFolder),
  });
}

async function listWordLists(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_word_lists")
    .select("id, name, entries, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ wordLists: [], setupMissing: true });
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ wordLists: (data || []).map(normalizeWordList) });
}

async function saveWordList(admin, teacherId, body) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, LIBRARY_TITLE_LIMIT);
  const entries = normalizeWordListEntries(body.entries);
  if (!name) return jsonError("Name the word list before saving it.");
  if (!entries.length) return jsonError("Add at least one word before saving the list.");

  const wordListId = String(body.wordListId || "");
  const query = isUuid(wordListId)
    ? admin
        .from("projector_word_lists")
        .update({ name, entries, updated_at: new Date().toISOString() })
        .eq("id", wordListId)
        .eq("teacher_id", teacherId)
    : admin.from("projector_word_lists").insert({ teacher_id: teacherId, name, entries });

  const { data, error } = await query.select("id, name, entries, created_at, updated_at").single();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector word lists are not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ wordList: normalizeWordList(data) });
}

async function deleteWordList(admin, teacherId, body) {
  const wordListId = String(body.wordListId || "");
  if (!isUuid(wordListId)) return jsonError("Choose a word list to delete.");
  const { error } = await admin
    .from("projector_word_lists")
    .delete()
    .eq("id", wordListId)
    .eq("teacher_id", teacherId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}

async function saveLibraryItem(admin, teacherId, body) {
  const state = normalizeState(body.type, body.content);
  if (!state) return jsonError("Add content before saving.");
  if (state.content.length > LIBRARY_CONTENT_LIMIT) {
    return jsonError("That item is too large to save. Try a shorter video URL or smaller image.");
  }

  const title = normalizeLibraryTitle(body.title, state);
  const category = LIBRARY_CATEGORIES.has(body.category) ? body.category : null;

  const { data, error } = await admin
    .from("projector_library_items")
    .insert({
      teacher_id: teacherId,
      title,
      content_type: state.type,
      content: state.content,
      content_hash: sceneItemContentHash(state.type, state.content),
      ...(category ? { category } : {}),
    })
    .select("id, title, content_type, content, category, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector library is not set up yet.", 503);
    }
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallback, error: fallbackError } = await admin
        .from("projector_library_items")
        .insert({ teacher_id: teacherId, title, content_type: state.type, content: state.content })
        .select("id, title, content_type, content, created_at, updated_at")
        .single();
      if (fallbackError) return jsonError(fallbackError.message, 500);
      return NextResponse.json({ item: normalizeLibraryItem(fallback) });
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ item: normalizeLibraryItem(data) });
}

async function renameLibraryItem(admin, teacherId, body) {
  const itemId = String(body.itemId || "");
  if (!isUuid(itemId)) return jsonError("Choose a saved item to rename.");

  const title = String(body.title || "").trim().replace(/\s+/g, " ").slice(0, LIBRARY_TITLE_LIMIT);
  if (!title) return jsonError("Enter a name for this item.");

  const category = LIBRARY_CATEGORIES.has(body.category) ? body.category : null;

  const { data, error } = await admin
    .from("projector_library_items")
    .update({ title, category, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("teacher_id", teacherId)
    .select("id, title, content_type, content, category, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return jsonError("Projector library is not set up yet.", 503);
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallback, error: fallbackError } = await admin
        .from("projector_library_items")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .eq("teacher_id", teacherId)
        .select("id, title, content_type, content, created_at, updated_at")
        .maybeSingle();
      if (fallbackError) return jsonError(fallbackError.message, 500);
      if (!fallback) return jsonError("Saved item not found.", 404);
      return NextResponse.json({ item: normalizeLibraryItem(fallback) });
    }
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Saved item not found.", 404);

  return NextResponse.json({ item: normalizeLibraryItem(data) });
}

async function validateSceneFolder(admin, teacherId, folderId) {
  if (!folderId) return null;
  const { data: folder, error: folderError } = await admin
    .from("projector_scene_folders")
    .select("id")
    .eq("id", folderId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (folderError) {
    if (folderError.code === "42P01" || folderError.code === "PGRST205") {
      return jsonError("Projector scene folders are not set up yet.", 503);
    }
    return jsonError(folderError.message, 500);
  }
  if (!folder) return jsonError("Choose one of your room setup folders.");
  return null;
}

async function extractSceneItemsToLibrary(admin, teacherId, screenStates) {
  try {
    const candidates = sceneItemCandidates(screenStates);
    if (!candidates.length) return [];

    const { data: existing, error: existingError } = await admin
      .from("projector_library_items")
      .select("content_hash")
      .eq("teacher_id", teacherId)
      .in("content_hash", candidates.map((candidate) => candidate.contentHash));
    if (existingError) return [];

    const existingHashes = new Set((existing || []).map((row) => row.content_hash));
    const missing = candidates.filter((candidate) => !existingHashes.has(candidate.contentHash));
    if (!missing.length) return [];

    const { data, error } = await admin
      .from("projector_library_items")
      .insert(
        missing.map((candidate) => ({
          teacher_id: teacherId,
          title: candidate.title,
          content_type: candidate.contentType,
          content: candidate.content,
          content_hash: candidate.contentHash,
        }))
      )
      .select("id, title, content_type, content, category, created_at, updated_at");
    if (error) return [];

    return (data || []).map(normalizeLibraryItem);
  } catch {
    return [];
  }
}

async function createSceneFromStates(admin, teacherId, body, screenStates) {
  const serialized = JSON.stringify(screenStates);
  if (serialized.length > SCENE_STATE_LIMIT) {
    return jsonError("That room setup is too large to save. Try smaller images or shorter media URLs.");
  }

  const title = normalizeSceneTitle(body.title);
  const folderId = normalizeSceneFolderId(body.folderId);
  const folderError = await validateSceneFolder(admin, teacherId, folderId);
  if (folderError) return folderError;

  const { data, error } = await admin
    .from("projector_scene_library_items")
    .insert({
      teacher_id: teacherId,
      title,
      folder_id: folderId,
      screen_states: screenStates,
    })
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  const autoSavedItems = await extractSceneItemsToLibrary(admin, teacherId, screenStates);
  return NextResponse.json({ scene: normalizeSceneItem(data), autoSavedItems });
}

async function saveScene(admin, teacherId, session, body) {
  const activeScreenIds = await getActiveRoomScreenIds(admin, teacherId);
  const normalized = normalizeSceneStates(session.screen_states);
  const screenStates = activeScreenIds.reduce((states, screenId) => {
    states[screenId] = normalized[screenId] || null;
    return states;
  }, {});

  return createSceneFromStates(admin, teacherId, body, screenStates);
}

function sceneStatesFromPayload(body, { requireContent = true } = {}) {
  const normalized = normalizeSceneStates(body.screenStates);
  const requestedScreenIds = Array.isArray(body.screenIds)
    ? normalizeScreenIds(body.screenIds)
    : Object.keys(body.screenStates && typeof body.screenStates === "object" ? body.screenStates : {})
        .map(normalizeScreenNumber)
        .filter(Boolean);
  const screenIds = [...new Set(requestedScreenIds)].sort((left, right) => Number(left) - Number(right));
  if (!screenIds.length) return { error: jsonError("Add at least one screen slot before saving.") };

  const screenStates = screenIds.reduce((states, screenId) => {
    states[screenId] = normalized[screenId] || null;
    return states;
  }, {});
  if (requireContent && !Object.values(screenStates).some(Boolean)) {
    return { error: jsonError("Add content to at least one screen slot before saving.") };
  }
  return { screenStates };
}

async function saveSceneFromPayload(admin, teacherId, body) {
  if (!String(body.title || "").trim()) return jsonError("Name this scene before saving it.");
  const { error, screenStates } = sceneStatesFromPayload(body, { requireContent: false });
  if (error) return error;

  return createSceneFromStates(admin, teacherId, body, screenStates);
}

async function saveScenesFromPayload(admin, teacherId, body) {
  const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 30) : [];
  if (!scenes.length) return jsonError("Add at least one scene before saving.");

  const normalizedScenes = [];
  for (const scene of scenes) {
    if (!String(scene.title || "").trim()) return jsonError("Every scene needs a name before saving.");
    const title = normalizeSceneTitle(scene.title);
    const folderId = normalizeSceneFolderId(scene.folderId);
    const folderError = await validateSceneFolder(admin, teacherId, folderId);
    if (folderError) return folderError;
    const { error, screenStates } = sceneStatesFromPayload(scene);
    if (error) return error;
    normalizedScenes.push({ title, folderId, screenStates });
  }

  const savedScenes = [];
  const autoSavedItems = [];
  for (const scene of normalizedScenes) {
    const response = await createSceneFromStates(admin, teacherId, scene, scene.screenStates);
    if (!response.ok) return response;
    const payload = await response.json();
    savedScenes.push(payload.scene);
    if (Array.isArray(payload.autoSavedItems)) autoSavedItems.push(...payload.autoSavedItems);
  }

  return NextResponse.json({ scenes: savedScenes, autoSavedItems });
}

async function updateSceneFromPayload(admin, teacherId, body) {
  const sceneId = String(body.sceneId || "");
  if (!isUuid(sceneId)) return jsonError("Choose a saved room setup to update.");

  const { error, screenStates } = sceneStatesFromPayload(body);
  if (error) return error;

  const serialized = JSON.stringify(screenStates);
  if (serialized.length > SCENE_STATE_LIMIT) {
    return jsonError("That room setup is too large to save. Try smaller images or shorter media URLs.");
  }

  const { data, error: updateError } = await admin
    .from("projector_scene_library_items")
    .update({ screen_states: screenStates, updated_at: new Date().toISOString() })
    .eq("id", sceneId)
    .eq("teacher_id", teacherId)
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "42P01" || updateError.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(updateError.message, 500);
  }
  if (!data) return jsonError("Saved room setup not found.", 404);

  const autoSavedItems = await extractSceneItemsToLibrary(admin, teacherId, screenStates);
  return NextResponse.json({ scene: normalizeSceneItem(data), autoSavedItems });
}

async function renameScene(admin, teacherId, body) {
  const sceneId = String(body.sceneId || "");
  if (!isUuid(sceneId)) return jsonError("Choose a saved room setup to rename.");

  const title = normalizeSceneTitle(body.title);
  if (!title) return jsonError("Enter a name for this room setup.");

  const { data, error } = await admin
    .from("projector_scene_library_items")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sceneId)
    .eq("teacher_id", teacherId)
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Saved room setup not found.", 404);

  return NextResponse.json({ scene: normalizeSceneItem(data) });
}

async function createSceneFolder(admin, teacherId, body) {
  const title = normalizeSceneFolderTitle(body.title);
  if (!title) return jsonError("Name the folder before saving it.");

  const { data, error } = await admin
    .from("projector_scene_folders")
    .insert({ teacher_id: teacherId, title })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene folders are not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ folder: normalizeSceneFolder(data) });
}

async function deleteLibraryItem(admin, teacherId, body) {
  const itemId = String(body.itemId || "");
  if (!isUuid(itemId)) return jsonError("Choose a saved item to delete.");

  const { error } = await admin
    .from("projector_library_items")
    .delete()
    .eq("id", itemId)
    .eq("teacher_id", teacherId);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}

async function deleteSceneFolder(admin, teacherId, body) {
  const folderId = normalizeSceneFolderId(body.folderId);
  if (!folderId) return jsonError("Choose a folder to delete.");

  const { error: clearError } = await admin
    .from("projector_scene_library_items")
    .update({ folder_id: null, updated_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .eq("folder_id", folderId);

  if (clearError) {
    if (clearError.code === "42P01" || clearError.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    if (clearError.code === "42703" || clearError.code === "PGRST204") {
      return jsonError("Projector scene folders are not set up yet.", 503);
    }
    return jsonError(clearError.message, 500);
  }

  const { error } = await admin
    .from("projector_scene_folders")
    .delete()
    .eq("id", folderId)
    .eq("teacher_id", teacherId);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene folders are not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}

async function updateSceneFolder(admin, teacherId, body) {
  const sceneId = String(body.sceneId || "");
  if (!isUuid(sceneId)) return jsonError("Choose a saved room setup to move.");
  const folderId = normalizeSceneFolderId(body.folderId);

  if (folderId) {
    const { data: folder, error: folderError } = await admin
      .from("projector_scene_folders")
      .select("id")
      .eq("id", folderId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (folderError) {
      if (folderError.code === "42P01" || folderError.code === "PGRST205") {
        return jsonError("Projector scene folders are not set up yet.", 503);
      }
      return jsonError(folderError.message, 500);
    }
    if (!folder) return jsonError("Choose one of your room setup folders.");
  }

  const { data, error } = await admin
    .from("projector_scene_library_items")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", sceneId)
    .eq("teacher_id", teacherId)
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    if (error.code === "42703" || error.code === "PGRST204") {
      return jsonError("Projector scene folders are not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Saved room setup not found.", 404);

  return NextResponse.json({ scene: normalizeSceneItem(data) });
}

async function deleteScene(admin, teacherId, body) {
  const sceneId = String(body.sceneId || "");
  if (!isUuid(sceneId)) return jsonError("Choose a saved room setup to delete.");

  const { error } = await admin
    .from("projector_scene_library_items")
    .delete()
    .eq("id", sceneId)
    .eq("teacher_id", teacherId);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}

async function loadScene(admin, teacherId, session, body) {
  const sceneId = String(body.sceneId || "");
  if (!isUuid(sceneId)) return jsonError("Choose a saved room setup to load.");

  const { data: scene, error: sceneError } = await admin
    .from("projector_scene_library_items")
    .select("id, title, screen_states")
    .eq("id", sceneId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (sceneError) {
    if (sceneError.code === "42P01" || sceneError.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(sceneError.message, 500);
  }
  if (!scene) return jsonError("Saved room setup not found.", 404);

  const rawSceneStates = scene.screen_states && typeof scene.screen_states === "object" ? scene.screen_states : {};
  const sceneStates = normalizeSceneStates(rawSceneStates);
  const sceneScreenIds = Object.keys(rawSceneStates)
    .filter((screenId) => SCREEN_IDS.includes(screenId))
    .sort((left, right) => Number(left) - Number(right));
  const activeScreenIds = await getEnabledActiveRoomScreenIds(admin, teacherId, { excludeAutopilot: true });
  if (!activeScreenIds.length) return jsonError("A Room needs at least one active screen.");
  let screenStates = {};

  if (sceneScreenIds.length > activeScreenIds.length) {
    const assignments = body.assignments && typeof body.assignments === "object" ? body.assignments : null;
    if (!assignments) {
      return NextResponse.json(
        {
          error: "This scene has more saved screens than the active Room. Choose which scene items should go to your available screens.",
          needsAssignment: true,
          sceneScreens: sceneScreenIds.map((screenId) => ({ screenId, state: sceneStates[screenId] || null })),
          roomScreens: activeScreenIds,
        },
        { status: 409 }
      );
    }

    const usedRoomScreens = new Set();
    for (const [sceneScreenId, roomScreenId] of Object.entries(assignments)) {
      const safeSceneScreenId = normalizeScreenNumber(sceneScreenId);
      const safeRoomScreenId = activeScreenIds.includes(String(roomScreenId)) ? String(roomScreenId) : null;
      if (!safeSceneScreenId || !safeRoomScreenId || usedRoomScreens.has(safeRoomScreenId)) continue;
      screenStates[safeRoomScreenId] = sceneStates[safeSceneScreenId] || null;
      usedRoomScreens.add(safeRoomScreenId);
    }

    activeScreenIds.forEach((screenId) => {
      if (!usedRoomScreens.has(screenId)) screenStates[screenId] = null;
    });
  } else {
    screenStates = activeScreenIds.reduce((states, screenId, index) => {
      const sourceScreenId = sceneScreenIds[index % Math.max(sceneScreenIds.length, 1)];
      states[screenId] = sourceScreenId ? sceneStates[sourceScreenId] || null : null;
      return states;
    }, {});
  }
  const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(session)));
  const nextSessionStates = {
    ...restored.screenStates,
    ...screenStates,
  };

  const { error: updateError } = await admin
    .from("projector_sessions")
    .update({ screen_states: nextSessionStates, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("teacher_id", teacherId);

  if (updateError) return jsonError(updateError.message, 500);

  await broadcastScreenUpdates(
    admin,
    session.id,
    activeScreenIds.map((screenId) => buildBroadcastPayload(screenId, screenStates[screenId]))
  );

  return NextResponse.json({
    ok: true,
    title: scene.title,
    screenStates: nextSessionStates,
    takeoverEnded: Boolean(restored.takeover),
  });
}

async function startTakeover(admin, teacherId, session, body) {
  const sourceScreenId = normalizeScreenNumber(body.screenId);
  if (!sourceScreenId) return jsonError("Choose a screen to show on all screens.");

  const activeScreenIds = await getEnabledActiveRoomScreenIds(admin, teacherId);
  if (!activeScreenIds.includes(sourceScreenId)) return jsonError("Choose an active screen to show on all screens.");

  const current = sessionScreenStates(session);
  if (takeoverStateFrom(current)) return jsonError("End the current takeover before starting another.");

  const sourceState = current[sourceScreenId] || null;
  if (!sourceState?.type) return jsonError("Add content to that screen before showing it on all screens.");

  const nextStates = {
    ...current,
    [TAKEOVER_STATE_KEY]: {
      sourceScreenId,
      activeScreenIds,
      startedAt: new Date().toISOString(),
    },
  };

  const result = await persistScreenStates(admin, session, teacherId, nextStates);
  if (result.error) return jsonError(result.error.message, 500);
  await broadcastScreenUpdates(
    admin,
    session.id,
    activeScreenIds.map((screenId) => buildBroadcastPayload(screenId, sourceState))
  );

  return NextResponse.json({
    ok: true,
    screenStates: clientScreenStates(nextStates),
    takeover: publicTakeoverStateFrom(nextStates),
  });
}

async function endTakeover(admin, teacherId, session) {
  const current = sessionScreenStates(session);
  const { screenStates, takeover } = restoreTakeoverState(current);
  if (!takeover) {
    return NextResponse.json({ ok: true, ended: false, screenStates });
  }

  const result = await persistScreenStates(admin, session, teacherId, screenStates, takeover.activeScreenIds);
  if (result.error) return jsonError(result.error.message, 500);

  return NextResponse.json({ ok: true, ended: true, screenStates });
}

function workCaption(entry) {
  const parts = [entry.student_name, entry.label].map((part) => String(part || "").trim()).filter(Boolean);
  return parts.join(" · ");
}

async function startReview(admin, teacherId, session, body) {
  const entryIds = Array.isArray(body.entryIds) ? [...new Set(body.entryIds.map(String).filter(isUuid))] : [];
  if (!entryIds.length) return jsonError("Choose at least one submitted photo to review.");

  const screenIds = await getEnabledActiveRoomScreenIds(admin, teacherId, { excludeAutopilot: true });
  if (!screenIds.length) return jsonError("Turn on at least one non-autopilot screen before starting review.");

  const { data: entries, error: entryError } = await admin
    .from("projector_work_queue")
    .select("id, public_url, student_name, label")
    .eq("teacher_id", teacherId)
    .in("id", entryIds);
  if (entryError) return jsonError(entryError.message, 500);
  const entriesById = new Map((entries || []).map((entry) => [entry.id, entry]));
  const orderedEntries = entryIds.map((id) => entriesById.get(id)).filter(Boolean);
  if (!orderedEntries.length) return jsonError("Selected submitted photos were not found.");

  const pages = [];
  for (let index = 0; index < orderedEntries.length; index += screenIds.length) {
    const pageEntries = orderedEntries.slice(index, index + screenIds.length);
    const assignments = {};
    pageEntries.forEach((entry, entryIndex) => {
      assignments[screenIds[entryIndex]] = {
        id: entry.id,
        url: entry.public_url,
        caption: workCaption(entry),
      };
    });
    pages.push({ assignments });
  }

  const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(session)));
  const nextStates = {
    ...restored.screenStates,
    [REVIEW_STATE_KEY]: {
      screenIds,
      pages,
      pageIndex: 0,
      showCaptions: body.showCaptions !== false,
      startedAt: new Date().toISOString(),
      restoreStates: restored.screenStates,
    },
  };

  const result = await persistScreenStates(admin, session, teacherId, nextStates);
  if (result.error) return jsonError(result.error.message, 500);

  await admin
    .from("projector_work_queue")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .in("id", orderedEntries.map((entry) => entry.id));

  await broadcastScreenUpdates(admin, session.id, screenIds.map((screenId) => reviewBroadcastPayload(nextStates, screenId)));
  return NextResponse.json({
    ok: true,
    screenStates: clientScreenStates(nextStates),
    review: publicReviewStateFrom(nextStates),
    takeoverEnded: Boolean(restored.takeover),
  });
}

async function setReviewPage(admin, teacherId, session, body) {
  const current = sessionScreenStates(session);
  const review = reviewStateFrom(current);
  if (!review) return jsonError("Review mode is not running.", 404);
  const pageIndex = Math.min(Math.max(Number.parseInt(body.pageIndex, 10) || 0, 0), review.pages.length - 1);
  const nextStates = {
    ...current,
    [REVIEW_STATE_KEY]: {
      ...review,
      pageIndex,
    },
  };
  const result = await persistScreenStates(admin, session, teacherId, nextStates);
  if (result.error) return jsonError(result.error.message, 500);
  await broadcastScreenUpdates(admin, session.id, review.screenIds.map((screenId) => reviewBroadcastPayload(nextStates, screenId)));
  return NextResponse.json({ ok: true, screenStates: clientScreenStates(nextStates), review: publicReviewStateFrom(nextStates) });
}

async function endReview(admin, teacherId, session) {
  const current = sessionScreenStates(session);
  const review = reviewStateFrom(current);
  if (!review) return NextResponse.json({ ok: true, ended: false, screenStates: clientScreenStates(current) });
  const nextStates = review.restoreStates && typeof review.restoreStates === "object" ? review.restoreStates : stripReviewState(current);
  const result = await persistScreenStates(admin, session, teacherId, nextStates);
  if (result.error) return jsonError(result.error.message, 500);
  await broadcastScreenUpdates(admin, session.id, review.screenIds.map((screenId) => reviewBroadcastPayload(nextStates, screenId)));
  return NextResponse.json({ ok: true, ended: true, screenStates: clientScreenStates(nextStates) });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const admin = createAdminClient();

  if (action === "resolve") {
    return resolvePin(admin, searchParams.get("pin"), searchParams.get("screenNumber"));
  }

  if (action === "library") {
    const supabase = await createClient();
    const context = await getTeacherSession(admin, supabase);
    if (context.error) return context.error;
    return listLibrary(admin, context.user.id);
  }

  if (action === "scenes") {
    const supabase = await createClient();
    const context = await getTeacherSession(admin, supabase);
    if (context.error) return context.error;
    return listScenes(admin, context.user.id);
  }

  if (action === "word-lists") {
    const supabase = await createClient();
    const context = await getTeacherSession(admin, supabase);
    if (context.error) return context.error;
    return listWordLists(admin, context.user.id);
  }

  const token = String(searchParams.get("token") || "").trim();
  if (!token) return jsonError("Missing projector token.");

  try {
    const session = await findSessionByToken(admin, token);
    const screenNumber = findScreenNumberForToken(session?.screen_tokens, token);
    if (!session || !screenNumber) return jsonError("Projector token not found.", 404);

    return NextResponse.json({
      sessionId: session.id,
      screenNumber,
      state: effectiveScreenState(session.screen_states, screenNumber),
    });
  } catch (error) {
    return jsonError(error.message || "Could not load projector screen.", 500);
  }
}

export async function POST(request) {
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (body?.action === "resolve") {
    return resolvePin(admin, body.pin, body.screenNumber);
  }

  const supabase = await createClient();
  const context = await getTeacherSession(admin, supabase);
  if (context.error) return context.error;

  if (body?.action === "save-library-item") {
    return saveLibraryItem(admin, context.user.id, body);
  }

  if (body?.action === "delete-library-item") {
    return deleteLibraryItem(admin, context.user.id, body);
  }

  if (body?.action === "rename-library-item") {
    return renameLibraryItem(admin, context.user.id, body);
  }

  if (body?.action === "save-word-list") {
    return saveWordList(admin, context.user.id, body);
  }

  if (body?.action === "delete-word-list") {
    return deleteWordList(admin, context.user.id, body);
  }

  if (body?.action === "create-scene-folder") {
    return createSceneFolder(admin, context.user.id, body);
  }

  if (body?.action === "delete-scene-folder") {
    return deleteSceneFolder(admin, context.user.id, body);
  }

  if (body?.action === "update-scene-folder") {
    return updateSceneFolder(admin, context.user.id, body);
  }

  if (body?.action === "rename-scene") {
    return renameScene(admin, context.user.id, body);
  }

  if (body?.action === "update-scene") {
    return updateSceneFromPayload(admin, context.user.id, body);
  }

  if (body?.action === "start-takeover") {
    if (reviewStateFrom(sessionScreenStates(context.session))) {
      await endReview(admin, context.user.id, context.session);
      context.session.screen_states = stripReviewState(sessionScreenStates(context.session));
    }
    return startTakeover(admin, context.user.id, context.session, body);
  }

  if (body?.action === "end-takeover") {
    return endTakeover(admin, context.user.id, context.session);
  }

  if (body?.action === "start-review") {
    return startReview(admin, context.user.id, context.session, body);
  }

  if (body?.action === "set-review-page") {
    return setReviewPage(admin, context.user.id, context.session, body);
  }

  if (body?.action === "end-review") {
    return endReview(admin, context.user.id, context.session);
  }

  if (body?.action === "save-scene") {
    const currentStates = sessionScreenStates(context.session);
    if (takeoverStateFrom(currentStates) || reviewStateFrom(currentStates)) {
      return jsonError("End the screen takeover or review mode before saving a scene.");
    }
    return saveScene(admin, context.user.id, context.session, body);
  }

  if (body?.action === "save-workshop-scene") {
    return saveSceneFromPayload(admin, context.user.id, body);
  }

  if (body?.action === "save-workshop-scenes") {
    return saveScenesFromPayload(admin, context.user.id, body);
  }

  if (body?.action === "delete-scene") {
    return deleteScene(admin, context.user.id, body);
  }

  if (body?.action === "load-scene") {
    return loadScene(admin, context.user.id, context.session, body);
  }

  if (body?.action === "reveal-answer") {
    const screenId = normalizeScreenNumber(body.screenId);
    if (!screenId) return jsonError("Choose a screen number from 1 to 12.");
    const enabledScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id, { excludeAutopilot: true });
    if (!enabledScreenIds.includes(screenId)) return jsonError("Inactive screens cannot receive new actions.");
    const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(context.session)));
    const current = restored.screenStates;
    const currentState = normalizeState(
      current[screenId]?.type,
      current[screenId]?.content,
      current[screenId]?.topText,
      current[screenId]?.revealAnswer
    );
    if (!currentState || !isQuestionContent(currentState.content)) {
      return jsonError("That screen does not have a question to reveal.");
    }
    const nextState = { ...currentState, revealAnswer: !currentState.revealAnswer };
    const nextStates = { ...current, [screenId]: nextState };
    const broadcastIds = restored.takeover ? [...restored.takeover.activeScreenIds, screenId] : [screenId];
    const result = await persistScreenStates(admin, context.session, context.user.id, nextStates, broadcastIds);
    if (result.error) return jsonError(result.error.message, 500);
    return NextResponse.json({ screenId, state: nextState, screenStates: nextStates, takeoverEnded: Boolean(restored.takeover) });
  }

  if (body?.action === "rotate-screens") {
    const activeScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id, { excludeAutopilot: true });
    if (!activeScreenIds.length) return jsonError("A Room needs at least one active screen.");
    const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(context.session)));
    const current = restored.screenStates;
    const rotateBackward = body.direction === "backward";
    const rotated = { ...current };
    activeScreenIds.forEach((screenId, index) => {
      const sourceIndex = rotateBackward
        ? (index + 1) % activeScreenIds.length
        : (index - 1 + activeScreenIds.length) % activeScreenIds.length;
      rotated[screenId] = current[activeScreenIds[sourceIndex]] || null;
    });
    const broadcastIds = restored.takeover ? [...restored.takeover.activeScreenIds, ...activeScreenIds] : activeScreenIds;
    const result = await persistScreenStates(admin, context.session, context.user.id, rotated, broadcastIds);
    if (result.error) return jsonError(result.error.message, 500);
    return NextResponse.json({ screenStates: rotated, takeoverEnded: Boolean(restored.takeover) });
  }

  const screenIds = normalizeScreenIds(body.screenIds);
  const enabledScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id);
  const inactiveScreenIds = screenIds.filter((screenId) => !enabledScreenIds.includes(screenId));
  if (inactiveScreenIds.length) return jsonError("Inactive screens cannot receive new content.");
  const state = normalizeState(body.type, body.content, body.topText, false, body.caption);

  if (!screenIds.length) return jsonError("Choose at least one screen.");
  if (!state) {
    if (body.type === "video") {
      return jsonError("Use a web-safe MP4 URL for video. MOV and uploaded videos are not supported yet.");
    }
    return jsonError("Add content before sending.");
  }

  const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(context.session)));
  const nextStates = { ...restored.screenStates };
  for (const screenId of screenIds) {
    nextStates[screenId] = state;
  }

  const broadcastIds = restored.takeover ? [...restored.takeover.activeScreenIds, ...screenIds] : screenIds;
  const result = await persistScreenStates(admin, context.session, context.user.id, nextStates, broadcastIds);
  if (result.error) return jsonError(result.error.message, 500);

  return NextResponse.json({ ok: true, takeoverEnded: Boolean(restored.takeover), screenStates: nextStates });
}

export async function DELETE(request) {
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();
  const context = await getTeacherSession(admin, supabase);
  if (context.error) return context.error;

  const screenId = normalizeScreenNumber(body.screenId);
  if (!screenId) return jsonError("Choose a screen number from 1 to 12.");
  const enabledScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id);
  if (!enabledScreenIds.includes(screenId)) return jsonError("Inactive screens cannot receive new actions.");

  const restored = restoreTakeoverState(stripReviewState(sessionScreenStates(context.session)));
  const nextStates = { ...restored.screenStates, [screenId]: null };
  const broadcastIds = restored.takeover ? [...restored.takeover.activeScreenIds, screenId] : [screenId];
  const result = await persistScreenStates(admin, context.session, context.user.id, nextStates, broadcastIds);
  if (result.error) return jsonError(result.error.message, 500);

  return NextResponse.json({ ok: true, takeoverEnded: Boolean(restored.takeover), screenStates: nextStates });
}
