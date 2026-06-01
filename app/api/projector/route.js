import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const SCREEN_IDS = ["1", "2", "3", "4"];
const CONTENT_TYPES = new Set(["text", "latex", "image", "video"]);

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const admin = createAdminClient();

  if (action === "resolve") {
    return resolvePin(admin, searchParams.get("pin"), searchParams.get("screenNumber"));
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
