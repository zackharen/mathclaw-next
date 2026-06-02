import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const SCREEN_IDS = ["1", "2", "3", "4"];
const CONTENT_TYPES = new Set(["text", "latex", "image", "video"]);
const LIBRARY_TITLE_LIMIT = 80;
const LIBRARY_CONTENT_LIMIT = 8 * 1024 * 1024;
const SCENE_TITLE_LIMIT = 80;
const SCENE_STATE_LIMIT = 24 * 1024 * 1024;

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

function normalizeState(type, content) {
  if (!CONTENT_TYPES.has(type)) return null;
  const safeContent = String(content || "").trim();
  if (!safeContent) return null;
  if (type === "video" && safeContent.startsWith("data:")) return null;
  if (type === "video" && /\.(mov|avi|wmv|mkv)(\?|#|$)/i.test(safeContent)) return null;
  return { type, content: safeContent };
}

function normalizeSceneStates(value) {
  const source = value && typeof value === "object" ? value : {};
  return SCREEN_IDS.reduce((states, screenId) => {
    const state = source[screenId];
    states[screenId] = state ? normalizeState(state.type, state.content) : null;
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

function normalizeLibraryItem(row) {
  return {
    id: row.id,
    title: row.title,
    content_type: row.content_type,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeSceneItem(row) {
  return {
    id: row.id,
    title: row.title,
    screen_states: normalizeSceneStates(row.screen_states),
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
  if (!safeScreenNumber) return jsonError("Choose screen 1, 2, 3, or 4.");

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
    .select("id, title, content_type, content, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ items: [] });
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ items: (data || []).map(normalizeLibraryItem) });
}

async function listScenes(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_scene_library_items")
    .select("id, title, screen_states, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ scenes: [] });
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ scenes: (data || []).map(normalizeSceneItem) });
}

async function saveLibraryItem(admin, teacherId, body) {
  const state = normalizeState(body.type, body.content);
  if (!state) return jsonError("Add content before saving.");
  if (state.content.length > LIBRARY_CONTENT_LIMIT) {
    return jsonError("That item is too large to save. Try a shorter video URL or smaller image.");
  }

  const title = normalizeLibraryTitle(body.title, state);
  const { data, error } = await admin
    .from("projector_library_items")
    .insert({
      teacher_id: teacherId,
      title,
      content_type: state.type,
      content: state.content,
    })
    .select("id, title, content_type, content, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ item: normalizeLibraryItem(data) });
}

async function saveScene(admin, teacherId, session, body) {
  const screenStates = normalizeSceneStates(session.screen_states);
  const serialized = JSON.stringify(screenStates);
  if (serialized.length > SCENE_STATE_LIMIT) {
    return jsonError("That room setup is too large to save. Try smaller images or shorter media URLs.");
  }

  const title = normalizeSceneTitle(body.title);
  const { data, error } = await admin
    .from("projector_scene_library_items")
    .insert({
      teacher_id: teacherId,
      title,
      screen_states: screenStates,
    })
    .select("id, title, screen_states, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector scene library is not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ scene: normalizeSceneItem(data) });
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

  const screenStates = normalizeSceneStates(scene.screen_states);
  const { error: updateError } = await admin
    .from("projector_sessions")
    .update({ screen_states: screenStates, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("teacher_id", teacherId);

  if (updateError) return jsonError(updateError.message, 500);

  await broadcastScreenUpdates(
    admin,
    session.id,
    SCREEN_IDS.map((screenId) => buildBroadcastPayload(screenId, screenStates[screenId]))
  );

  return NextResponse.json({ ok: true, title: scene.title, screenStates });
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

  if (body?.action === "save-scene") {
    return saveScene(admin, context.user.id, context.session, body);
  }

  if (body?.action === "delete-scene") {
    return deleteScene(admin, context.user.id, body);
  }

  if (body?.action === "load-scene") {
    return loadScene(admin, context.user.id, context.session, body);
  }

  const screenIds = normalizeScreenIds(body.screenIds);
  const state = normalizeState(body.type, body.content);

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
  if (!screenId) return jsonError("Choose screen 1, 2, 3, or 4.");

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
