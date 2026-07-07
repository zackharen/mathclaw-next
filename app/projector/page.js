import crypto from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import ProjectorClient from "./projector-client";
import ProjectorRoomsManager from "./projector-rooms-manager";
import ProjectorFullLibrary from "./projector-full-library-sorted";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const TAKEOVER_STATE_KEY = "__mathclaw_projector_takeover_v1__";
const DEFAULT_ROOM_SLOTS = Array.from({ length: 4 }, (_, index) => ({
  name: `Screen ${index + 1}`,
  inputType: "display_only",
  enabled: true,
}));

function createScreenTokens() {
  return SCREEN_IDS.reduce((tokens, screenId) => {
    tokens[screenId] = crypto.randomUUID();
    return tokens;
  }, {});
}

function createEmptyScreenStates() {
  return SCREEN_IDS.reduce((states, screenId) => {
    states[screenId] = null;
    return states;
  }, {});
}

function sanitizeSessionForClient(session) {
  const screenStates = session?.screen_states && typeof session.screen_states === "object" ? session.screen_states : {};
  const takeover = screenStates[TAKEOVER_STATE_KEY];
  if (!takeover || typeof takeover !== "object") return session;

  const sourceScreenId = SCREEN_IDS.includes(String(takeover.sourceScreenId || ""))
    ? String(takeover.sourceScreenId)
    : null;
  const activeScreenIds = Array.isArray(takeover.activeScreenIds)
    ? takeover.activeScreenIds.map(String).filter((screenId) => SCREEN_IDS.includes(screenId))
    : [];
  const nextScreenStates = { ...screenStates };
  if (sourceScreenId && activeScreenIds.length) {
    nextScreenStates[TAKEOVER_STATE_KEY] = {
      sourceScreenId,
      activeScreenIds,
      startedAt: takeover.startedAt || null,
    };
  } else {
    delete nextScreenStates[TAKEOVER_STATE_KEY];
  }

  return { ...session, screen_states: nextScreenStates };
}

async function createUniquePinSession(supabase, teacherId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const { data: existing } = await supabase
      .from("projector_sessions")
      .select("id")
      .eq("pin", pin)
      .maybeSingle();

    if (existing) continue;

    const { data, error } = await supabase
      .from("projector_sessions")
      .insert({
        teacher_id: teacherId,
        pin,
        screen_tokens: createScreenTokens(),
        screen_states: createEmptyScreenStates(),
      })
      .select("*")
      .single();

    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message);
  }

  throw new Error("Could not create a unique projector PIN.");
}

async function loadLibraryItems(supabase, teacherId) {
  const { data, error } = await supabase
    .from("projector_library_items")
    .select("id, title, content_type, content, category, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("projector_library_items")
        .select("id, title, content_type, content, created_at, updated_at")
        .eq("teacher_id", teacherId)
        .order("updated_at", { ascending: false })
        .limit(60);

      if (fallbackError) {
        if (fallbackError.code === "42P01" || fallbackError.code === "PGRST205") return [];
        throw new Error(fallbackError.message);
      }
      return fallbackData || [];
    }
    throw new Error(error.message);
  }

  return data || [];
}

async function loadSceneItems(supabase, teacherId) {
  const { data, error } = await supabase
    .from("projector_scene_library_items")
    .select("id, title, folder_id, screen_states, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("projector_scene_library_items")
        .select("id, title, screen_states, created_at, updated_at")
        .eq("teacher_id", teacherId)
        .order("updated_at", { ascending: false })
        .limit(40);

      if (fallbackError) {
        if (fallbackError.code === "42P01" || fallbackError.code === "PGRST205") return [];
        throw new Error(fallbackError.message);
      }
      return fallbackData || [];
    }
    throw new Error(error.message);
  }

  return data || [];
}

async function loadSceneFolders(supabase, teacherId) {
  const { data, error } = await supabase
    .from("projector_scene_folders")
    .select("id, title, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }

  return data || [];
}

async function loadPlaylists(supabase, teacherId) {
  const { data, error } = await supabase
    .from("projector_playlists")
    .select("id, name, loop, entries, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { playlists: [], setupMissing: true };
    throw new Error(error.message);
  }

  return { playlists: data || [], setupMissing: false };
}

function defaultRoomProfile() {
  const now = new Date().toISOString();
  return {
    id: "default",
    name: "Default Room",
    slots: DEFAULT_ROOM_SLOTS,
    is_default: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

function normalizeRoomProfile(row) {
  return {
    id: row.id,
    name: row.name,
    slots: (Array.isArray(row.slots) && row.slots.length ? row.slots : DEFAULT_ROOM_SLOTS)
      .slice(0, 12)
      .map((slot, index) => ({
        name: String(slot?.name || `Screen ${index + 1}`),
        inputType: ["touch", "keyboard_mouse", "display_only"].includes(slot?.inputType)
          ? slot.inputType
          : "display_only",
        enabled: slot?.enabled !== false,
      })),
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureDefaultRoomProfile(supabase, teacherId) {
  const { data: existingDefault, error: defaultError } = await supabase
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .eq("is_default", true)
    .maybeSingle();

  if (defaultError) throw defaultError;
  if (existingDefault) return normalizeRoomProfile(existingDefault);

  const { data: activeRoom } = await supabase
    .from("projector_room_profiles")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("projector_room_profiles")
    .insert({
      teacher_id: teacherId,
      name: "Default Room",
      slots: DEFAULT_ROOM_SLOTS,
      is_default: true,
      is_active: !activeRoom,
    })
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeRoomProfile(data);
}

async function loadRoomProfiles(supabase, teacherId) {
  try {
    await ensureDefaultRoomProfile(supabase, teacherId);

    const { data, error } = await supabase
      .from("projector_room_profiles")
      .select("id, name, slots, is_default, is_active, created_at, updated_at")
      .eq("teacher_id", teacherId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw error;
    const rooms = (data || []).map(normalizeRoomProfile);
    const activeRoom = rooms.find((room) => room.is_active) || rooms.find((room) => room.is_default) || rooms[0] || defaultRoomProfile();
    return { rooms: rooms.length ? rooms : [activeRoom], activeRoom };
  } catch (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      const fallback = defaultRoomProfile();
      return { rooms: [fallback], activeRoom: fallback };
    }
    throw new Error(error.message);
  }
}

export default async function ProjectorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/projector");

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    redirect("/auth/sign-in?redirect=/projector");
  }

  const { data: existingSession, error } = await supabase
    .from("projector_sessions")
    .select("*")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const session = existingSession || (await createUniquePinSession(supabase, user.id));
  const libraryItems = await loadLibraryItems(supabase, user.id);
  const sceneItems = await loadSceneItems(supabase, user.id);
  const sceneFolders = await loadSceneFolders(supabase, user.id);
  const playlistState = await loadPlaylists(supabase, user.id);
  const { rooms, activeRoom } = await loadRoomProfiles(supabase, user.id);
  const clientSession = sanitizeSessionForClient(session);

  return (
    <>
      <ProjectorClient
        activeRoom={activeRoom}
        session={clientSession}
        libraryItems={libraryItems}
        sceneItems={sceneItems}
        sceneFolders={sceneFolders}
        playlistItems={playlistState.playlists}
        playlistsSetupMissing={playlistState.setupMissing}
      />
      <ProjectorRoomsManager session={clientSession} initialRooms={rooms} initialActiveRoom={activeRoom} />
      <ProjectorFullLibrary
        libraryItems={libraryItems}
        sceneItems={sceneItems}
        sceneFolders={sceneFolders}
        playlistItems={playlistState.playlists}
        playlistsSetupMissing={playlistState.setupMissing}
      />
    </>
  );
}
