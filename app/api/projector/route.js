import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const DEFAULT_SCREEN_IDS = ["1", "2", "3", "4"];
const CONTENT_TYPES = new Set(["text", "latex", "image", "video"]);
const LIBRARY_CATEGORIES = new Set(["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"]);
const LIBRARY_TITLE_LIMIT = 80;
const LIBRARY_CONTENT_LIMIT = 8 * 1024 * 1024;
const SCENE_TITLE_LIMIT = 80;
const SCENE_STATE_LIMIT = 24 * 1024 * 1024;
const SCENE_FOLDER_TITLE_LIMIT = 60;
const TOP_TEXT_LIMIT = 500;
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";

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
    }))
    .filter((slot, index, slots) => slots.findIndex((item) => item.name.toLowerCase() === slot.name.toLowerCase()) === index);
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

async function getEnabledActiveRoomScreenIds(admin, teacherId) {
  const room = await getActiveRoom(admin, teacherId);
  return enabledRoomScreenIds(room);
}

function normalizeTopText(type, topText, content = "") {
  if (type === "text" && !String(content || "").startsWith(QUESTION_CONTENT_PREFIX)) return "";
  return String(topText || "").trim().slice(0, TOP_TEXT_LIMIT);
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

function normalizeState(type, content, topText = "", revealAnswer = false) {
  if (!CONTENT_TYPES.has(type)) return null;
  const rawContent = String(content || "");
  const safeContent = type === "text" || type === "latex" ? rawContent : rawContent.trim();
  if (!safeContent.trim()) return null;
  const mediaContent = displayContent(safeContent).trim();
  if (type === "video" && mediaContent.startsWith("data:")) return null;
  if (type === "video" && /\.(mov|avi|wmv|mkv)(\?|#|$)/i.test(mediaContent)) return null;
  const safeTopText = normalizeTopText(type, topText, safeContent);
  return {
    type,
    content: safeContent,
    ...(safeTopText ? { topText: safeTopText } : {}),
    ...(isQuestionContent(safeContent) && revealAnswer ? { revealAnswer: true } : {}),
  };
}

function normalizeSceneStates(value) {
  const source = value && typeof value === "object" ? value : {};
  return SCREEN_IDS.reduce((states, screenId) => {
    const state = source[screenId];
    states[screenId] = state ? normalizeState(state.type, state.content, state.topText, state.revealAnswer) : null;
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
  const channel = admin.channel(`projector-session-${sessionId}`, {
    config: { broadcast: { ack: true } },
  });
  try {
    for (const payload of payloads) {
      await channel.send({
        type: "broadcast",
        event: "screen-updated",
        payload,
      });
    }
  } finally {
    await admin.removeChannel(channel);
  }
}

function buildBroadcastPayload(screenId, state) {
  if (!state) return { screenId, type: null, content: null };
  if (state.type === "image") {
    return { screenId, type: state.type, refetch: true };
  }
  return {
    screenId,
    type: state.type,
    content: state.content,
    topText: state.topText || "",
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

  return NextResponse.json({ scene: normalizeSceneItem(data) });
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
  for (const scene of normalizedScenes) {
    const response = await createSceneFromStates(admin, teacherId, scene, scene.screenStates);
    if (!response.ok) return response;
    const payload = await response.json();
    savedScenes.push(payload.scene);
  }

  return NextResponse.json({ scenes: savedScenes });
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

  return NextResponse.json({ scene: normalizeSceneItem(data) });
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
  const activeScreenIds = await getEnabledActiveRoomScreenIds(admin, teacherId);
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
  const nextSessionStates = {
    ...(session.screen_states && typeof session.screen_states === "object" ? session.screen_states : {}),
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

  return NextResponse.json({ ok: true, title: scene.title, screenStates: nextSessionStates });
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

  const token = String(searchParams.get("token") || "").trim();
  if (!token) return jsonError("Missing projector token.");

  try {
    const session = await findSessionByToken(admin, token);
    const screenNumber = findScreenNumberForToken(session?.screen_tokens, token);
    if (!session || !screenNumber) return jsonError("Projector token not found.", 404);

    return NextResponse.json({
      sessionId: session.id,
      screenNumber,
      state: session.screen_states?.[screenNumber] || null,
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

  if (body?.action === "save-scene") {
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
    const enabledScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id);
    if (!enabledScreenIds.includes(screenId)) return jsonError("Inactive screens cannot receive new actions.");
    const current = context.session.screen_states && typeof context.session.screen_states === "object"
      ? context.session.screen_states
      : {};
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
    const { error } = await admin
      .from("projector_sessions")
      .update({ screen_states: nextStates, updated_at: new Date().toISOString() })
      .eq("id", context.session.id)
      .eq("teacher_id", context.user.id);
    if (error) return jsonError(error.message, 500);
    await broadcastScreenUpdates(admin, context.session.id, [buildBroadcastPayload(screenId, nextState)]);
    return NextResponse.json({ screenId, state: nextState });
  }

  if (body?.action === "rotate-screens") {
    const activeScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id);
    if (!activeScreenIds.length) return jsonError("A Room needs at least one active screen.");
    const current = context.session.screen_states && typeof context.session.screen_states === "object"
      ? context.session.screen_states
      : {};
    const rotateBackward = body.direction === "backward";
    const rotated = { ...current };
    activeScreenIds.forEach((screenId, index) => {
      const sourceIndex = rotateBackward
        ? (index + 1) % activeScreenIds.length
        : (index - 1 + activeScreenIds.length) % activeScreenIds.length;
      rotated[screenId] = current[activeScreenIds[sourceIndex]] || null;
    });
    const { error } = await admin
      .from("projector_sessions")
      .update({ screen_states: rotated, updated_at: new Date().toISOString() })
      .eq("id", context.session.id)
      .eq("teacher_id", context.user.id);
    if (error) return jsonError(error.message, 500);
    await broadcastScreenUpdates(
      admin,
      context.session.id,
      activeScreenIds.map((screenId) => buildBroadcastPayload(screenId, rotated[screenId]))
    );
    return NextResponse.json({ screenStates: rotated });
  }

  const screenIds = normalizeScreenIds(body.screenIds);
  const enabledScreenIds = await getEnabledActiveRoomScreenIds(admin, context.user.id);
  const inactiveScreenIds = screenIds.filter((screenId) => !enabledScreenIds.includes(screenId));
  if (inactiveScreenIds.length) return jsonError("Inactive screens cannot receive new content.");
  const state = normalizeState(body.type, body.content, body.topText, false);

  if (!screenIds.length) return jsonError("Choose at least one screen.");
  if (!state) {
    if (body.type === "video") {
      return jsonError("Use a web-safe MP4 URL for video. MOV and uploaded videos are not supported yet.");
    }
    return jsonError("Add content before sending.");
  }

  const nextStates = {
    ...(context.session.screen_states && typeof context.session.screen_states === "object"
      ? context.session.screen_states
      : {}),
  };
  for (const screenId of screenIds) {
    nextStates[screenId] = state;
  }

  const { error } = await admin
    .from("projector_sessions")
    .update({ screen_states: nextStates, updated_at: new Date().toISOString() })
    .eq("id", context.session.id)
    .eq("teacher_id", context.user.id);

  if (error) return jsonError(error.message, 500);

  await broadcastScreenUpdates(
    admin,
    context.session.id,
    screenIds.map((screenId) => buildBroadcastPayload(screenId, state))
  );

  return NextResponse.json({ ok: true });
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

  const nextStates = {
    ...(context.session.screen_states && typeof context.session.screen_states === "object"
      ? context.session.screen_states
      : {}),
    [screenId]: null,
  };

  const { error } = await admin
    .from("projector_sessions")
    .update({ screen_states: nextStates, updated_at: new Date().toISOString() })
    .eq("id", context.session.id)
    .eq("teacher_id", context.user.id);

  if (error) return jsonError(error.message, 500);

  await broadcastScreenUpdates(admin, context.session.id, [{ screenId, type: null, content: null }]);

  return NextResponse.json({ ok: true });
}
