import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const DEFAULT_SLOTS = Array.from({ length: 4 }, (_, index) => ({
  name: `Screen ${index + 1}`,
  inputType: "display_only",
  enabled: true,
}));
const INPUT_TYPES = new Set(["touch", "keyboard_mouse", "display_only"]);

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normalizeRoomName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeScreenNumber(value) {
  const screenNumber = String(value || "").trim();
  return SCREEN_IDS.includes(screenNumber) ? screenNumber : null;
}

function normalizeAutopilotConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const mode = ["items", "playlist", "word_wall", "clock"].includes(source.mode) ? source.mode : "clock";
  const config = {
    enabled: source.enabled === true,
    mode,
    intervalSeconds: Math.min(Math.max(Number.parseInt(source.intervalSeconds, 10) || 60, 10), 3600),
    shuffle: source.shuffle === true,
  };
  if (mode === "items") {
    config.itemIds = Array.isArray(source.itemIds)
      ? source.itemIds.filter((id) => isUuid(id)).slice(0, 60)
      : [];
  }
  if (mode === "playlist") config.playlistId = isUuid(source.playlistId) ? source.playlistId : "";
  if (mode === "word_wall") config.wordListId = isUuid(source.wordListId) ? source.wordListId : "";
  if (mode === "clock") config.showPeriod = source.showPeriod === true;
  return config;
}

function normalizeSlots(value) {
  const source = Array.isArray(value) ? value : DEFAULT_SLOTS;
  const seenNames = new Set();
  const slots = [];

  for (let index = 0; index < source.length && slots.length < 12; index += 1) {
    const slot = source[index] || {};
    const fallbackName = `Screen ${index + 1}`;
    const name = String(slot.name || fallbackName).trim().replace(/\s+/g, " ").slice(0, 60) || fallbackName;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    slots.push({
      name,
      inputType: INPUT_TYPES.has(slot.inputType) ? slot.inputType : "display_only",
      enabled: slot.enabled !== false,
      ...(slot.autopilot && typeof slot.autopilot === "object" ? { autopilot: normalizeAutopilotConfig(slot.autopilot) } : {}),
    });
  }

  return slots.length ? slots : DEFAULT_SLOTS;
}

function normalizeRoom(row) {
  return {
    id: row.id,
    name: row.name,
    slots: normalizeSlots(row.slots),
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function defaultRoom() {
  const now = new Date().toISOString();
  return {
    id: "default",
    name: "Default Room",
    slots: DEFAULT_SLOTS,
    is_default: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

function roomScreenIds(room) {
  return normalizeSlots(room?.slots).map((_, index) => String(index + 1));
}

function enabledRoomScreenIds(room) {
  return normalizeSlots(room?.slots)
    .map((slot, index) => (slot.enabled === false ? null : String(index + 1)))
    .filter(Boolean);
}

async function ensureDefaultRoom(admin, teacherId) {
  const { data: existingDefault, error: defaultError } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .eq("is_default", true)
    .maybeSingle();

  if (defaultError) throw defaultError;
  if (existingDefault) return normalizeRoom(existingDefault);

  const { data: activeRoom } = await admin
    .from("projector_room_profiles")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("projector_room_profiles")
    .insert({
      teacher_id: teacherId,
      name: "Default Room",
      slots: DEFAULT_SLOTS,
      is_default: true,
      is_active: !activeRoom,
    })
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeRoom(data);
}

async function getTeacherContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to manage Rooms.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage Rooms.", 403) };
  }

  return { user };
}

async function getTeacherSession(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_sessions")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function broadcastScreenUpdates(admin, sessionId, payloads) {
  if (!sessionId || !payloads.length) return;
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

async function notifyScreenProfileChanged(admin, teacherId, screenId) {
  const session = await getTeacherSession(admin, teacherId);
  if (!session) return;
  await broadcastScreenUpdates(admin, session.id, [{ screenId, refetch: true }]);
}

async function listRooms(admin, teacherId) {
  try {
    await ensureDefaultRoom(admin, teacherId);
  } catch (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      const fallback = defaultRoom();
      return { rooms: [fallback], activeRoom: fallback, setupMissing: true };
    }
    throw new Error(error.message);
  }

  const { data, error } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      const fallback = defaultRoom();
      return { rooms: [fallback], activeRoom: fallback, setupMissing: true };
    }
    throw new Error(error.message);
  }

  if (!data?.length) {
    const fallback = defaultRoom();
    return { rooms: [fallback], activeRoom: fallback };
  }

  const rooms = data.map(normalizeRoom);
  const currentActiveRoom = rooms.find((room) => room.is_active);
  if (!currentActiveRoom) {
    const fallbackActiveRoom = rooms.find((room) => room.is_default) || rooms[0];
    await admin
      .from("projector_room_profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", fallbackActiveRoom.id)
      .eq("teacher_id", teacherId);
    fallbackActiveRoom.is_active = true;
  }

  return {
    rooms,
    activeRoom: rooms.find((room) => room.is_active) || rooms.find((room) => room.is_default) || rooms[0],
  };
}

async function ensureSessionScreens(admin, session, room) {
  if (!session) return null;
  const screenTokens = session.screen_tokens && typeof session.screen_tokens === "object" ? { ...session.screen_tokens } : {};
  const screenStates = session.screen_states && typeof session.screen_states === "object" ? { ...session.screen_states } : {};
  let changed = false;

  for (const screenId of roomScreenIds(room)) {
    if (!screenTokens[screenId]) {
      screenTokens[screenId] = crypto.randomUUID();
      changed = true;
    }
    if (!(screenId in screenStates)) {
      screenStates[screenId] = null;
      changed = true;
    }
  }

  if (!changed) return session;

  const { data, error } = await admin
    .from("projector_sessions")
    .update({ screen_tokens: screenTokens, screen_states: screenStates, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("teacher_id", session.teacher_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function resolvePin(admin, pin, screenNumber) {
  const safePin = String(pin || "").trim();
  const safeScreenNumber = normalizeScreenNumber(screenNumber);
  if (!/^\d{6}$/.test(safePin)) return jsonError("Enter a 6-digit room PIN.");
  if (!safeScreenNumber) return jsonError("Choose a screen number from 1 to 12.");

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("*")
    .eq("pin", safePin)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!session) return jsonError("That room PIN was not found.", 404);

  const { activeRoom } = await listRooms(admin, session.teacher_id);
  if (!roomScreenIds(activeRoom).includes(safeScreenNumber)) {
    return jsonError("That screen is not part of the active Room.", 404);
  }

  const nextSession = await ensureSessionScreens(admin, session, activeRoom);
  const token = nextSession?.screen_tokens?.[safeScreenNumber];
  if (!token) return jsonError("That screen is not ready yet.", 404);
  return NextResponse.json({ token });
}

async function findSessionByToken(admin, token) {
  for (const screenId of SCREEN_IDS) {
    const { data, error } = await admin
      .from("projector_sessions")
      .select("id, teacher_id, screen_tokens, screen_states")
      .contains("screen_tokens", { [screenId]: token })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }
  return null;
}

function findScreenNumberForToken(screenTokens, token) {
  return SCREEN_IDS.find((screenId) => screenTokens?.[screenId] === token) || null;
}

async function createRoom(admin, teacherId, body) {
  const name = normalizeRoomName(body.name);
  if (!name) return jsonError("Name the Room before saving it.");
  const screenCount = Math.min(Math.max(Number(body.screenCount) || 4, 1), 12);
  const slots = Array.from({ length: screenCount }, (_, index) => ({
    name: `Screen ${index + 1}`,
    inputType: "display_only",
    enabled: true,
  }));

  const { data, error } = await admin
    .from("projector_room_profiles")
    .insert({ teacher_id: teacherId, name, slots })
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("You already have a Room with that name.");
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ room: normalizeRoom(data) });
}

async function updateRoom(admin, teacherId, body) {
  const roomId = String(body.roomId || "");
  if (!isUuid(roomId)) return jsonError("Choose a Room to update.");
  const name = normalizeRoomName(body.name);
  if (!name) return jsonError("Name the Room before saving it.");
  const slots = normalizeSlots(body.slots);
  if (!enabledRoomScreenIds({ slots }).length) return jsonError("A Room needs at least one active screen.");

  const { data, error } = await admin
    .from("projector_room_profiles")
    .update({ name, slots, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return jsonError("You already have a Room with that name.");
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Room not found.", 404);

  return NextResponse.json({ room: normalizeRoom(data) });
}

async function toggleScreen(admin, teacherId, body) {
  const roomId = String(body.roomId || "");
  if (!isUuid(roomId)) return jsonError("Choose a Room to update.");
  const screenNumber = normalizeScreenNumber(body.screenId);
  if (!screenNumber) return jsonError("Choose a screen number from 1 to 12.");

  const { data: room, error: roomError } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (roomError) return jsonError(roomError.message, 500);
  if (!room) return jsonError("Room not found.", 404);

  const slots = normalizeSlots(room.slots);
  const index = Number(screenNumber) - 1;
  if (!slots[index]) return jsonError("That screen is not part of this Room.", 404);

  const enabled = body.enabled !== false;
  const nextSlots = slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, enabled } : slot));
  if (!enabledRoomScreenIds({ slots: nextSlots }).length) {
    return jsonError("A Room needs at least one active screen.");
  }

  const { data, error } = await admin
    .from("projector_room_profiles")
    .update({ slots: nextSlots, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Room not found.", 404);

  if (data.is_active) await notifyScreenProfileChanged(admin, teacherId, screenNumber);
  return NextResponse.json({ room: normalizeRoom(data) });
}

async function setActiveRoom(admin, teacherId, body) {
  const roomId = String(body.roomId || "");
  if (!isUuid(roomId)) return jsonError("Choose a Room to activate.");

  const { data: room, error: roomError } = await admin
    .from("projector_room_profiles")
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (roomError) return jsonError(roomError.message, 500);
  if (!room) return jsonError("Room not found.", 404);

  const { error: clearError } = await admin
    .from("projector_room_profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("teacher_id", teacherId);
  if (clearError) return jsonError(clearError.message, 500);

  const { data, error } = await admin
    .from("projector_room_profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .select("id, name, slots, is_default, is_active, created_at, updated_at")
    .single();
  if (error) return jsonError(error.message, 500);

  const session = await getTeacherSession(admin, teacherId);
  await ensureSessionScreens(admin, session, data);

  return NextResponse.json({ room: normalizeRoom(data) });
}

async function deleteRoom(admin, teacherId, body) {
  const roomId = String(body.roomId || "");
  if (!isUuid(roomId)) return jsonError("Choose a Room to delete.");

  const { data: room, error: roomError } = await admin
    .from("projector_room_profiles")
    .select("id, is_default, is_active")
    .eq("id", roomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (roomError) return jsonError(roomError.message, 500);
  if (!room) return jsonError("Room not found.", 404);
  if (room.is_default) return jsonError("The default Room cannot be deleted.");

  const { error } = await admin
    .from("projector_room_profiles")
    .delete()
    .eq("id", roomId)
    .eq("teacher_id", teacherId);
  if (error) return jsonError(error.message, 500);

  if (room.is_active) {
    await admin
      .from("projector_room_profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("teacher_id", teacherId)
      .eq("is_default", true);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const admin = createAdminClient();
  const token = String(searchParams.get("token") || "").trim();

  if (token) {
    try {
      const session = await findSessionByToken(admin, token);
      const screenNumber = findScreenNumberForToken(session?.screen_tokens, token);
      if (!session || !screenNumber) return jsonError("Projector token not found.", 404);
      const { activeRoom } = await listRooms(admin, session.teacher_id);
      if (!roomScreenIds(activeRoom).includes(screenNumber)) {
        return jsonError("That screen is not part of the active Room.", 404);
      }
      // Resolve this screen's profile from the active Room's slots (index = screenNumber - 1)
      // so the receiver can learn its capability. Fall back for old sessions / missing slots.
      const slot = normalizeSlots(activeRoom?.slots)[Number(screenNumber) - 1] || null;
      return NextResponse.json({
        sessionId: session.id,
        screenNumber,
        state: session.screen_states?.[screenNumber] || null,
        screenName: slot?.name || `Screen ${screenNumber}`,
        inputType: INPUT_TYPES.has(slot?.inputType) ? slot.inputType : "display_only",
        enabled: slot?.enabled !== false,
      });
    } catch (error) {
      return jsonError(error.message || "Could not load projector screen.", 500);
    }
  }

  const context = await getTeacherContext();
  if (context.error) return context.error;

  try {
    const payload = await listRooms(admin, context.user.id);
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(error.message || "Could not load Rooms.", 500);
  }
}

export async function POST(request) {
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (body?.action === "resolve") {
    return resolvePin(admin, body.pin, body.screenNumber);
  }

  const context = await getTeacherContext();
  if (context.error) return context.error;

  if (body?.action === "create-room") return createRoom(admin, context.user.id, body);
  if (body?.action === "update-room") return updateRoom(admin, context.user.id, body);
  if (body?.action === "toggle-screen") return toggleScreen(admin, context.user.id, body);
  if (body?.action === "set-active-room") return setActiveRoom(admin, context.user.id, body);
  if (body?.action === "delete-room") return deleteRoom(admin, context.user.id, body);

  return jsonError("Unknown Rooms action.");
}
