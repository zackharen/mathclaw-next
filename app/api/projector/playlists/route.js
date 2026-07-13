import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";

export const dynamic = "force-dynamic";

const PLAYLIST_NAME_LIMIT = 80;
const MAX_ENTRIES = 60;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 60 * 60;
const ENTRY_TYPES = new Set(["item", "scene"]);

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normalizePlaylistName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, PLAYLIST_NAME_LIMIT);
}

function normalizePlaylist(row) {
  return {
    id: row.id,
    name: row.name,
    loop: Boolean(row.loop),
    entries: Array.isArray(row.entries) ? row.entries : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getTeacherContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to manage Playlists.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage Playlists.", 403) };
  }

  return { user };
}

async function listPlaylists(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_playlists")
    .select("id, name, loop, entries, created_at, updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ playlists: [], setupMissing: true });
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ playlists: (data || []).map(normalizePlaylist) });
}

async function validateEntryRefs(admin, teacherId, entries) {
  const itemIds = [...new Set(entries.filter((entry) => entry.type === "item").map((entry) => entry.refId))];
  const sceneIds = [...new Set(entries.filter((entry) => entry.type === "scene").map((entry) => entry.refId))];

  if (itemIds.length) {
    const { data, error } = await admin
      .from("projector_library_items")
      .select("id")
      .eq("teacher_id", teacherId)
      .in("id", itemIds);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return "Projector library is not set up yet.";
      }
      return error.message;
    }
    const found = new Set((data || []).map((row) => row.id));
    if (itemIds.some((id) => !found.has(id))) return "Every playlist item must come from your saved items.";
  }

  if (sceneIds.length) {
    const { data, error } = await admin
      .from("projector_scene_library_items")
      .select("id")
      .eq("teacher_id", teacherId)
      .in("id", sceneIds);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return "Projector scene library is not set up yet.";
      }
      return error.message;
    }
    const found = new Set((data || []).map((row) => row.id));
    if (sceneIds.some((id) => !found.has(id))) return "Every playlist scene must come from your saved scenes.";
  }

  return null;
}

async function normalizeEntries(admin, teacherId, rawEntries) {
  if (!Array.isArray(rawEntries)) return { error: "Playlist entries must be an ordered list." };
  if (rawEntries.length > MAX_ENTRIES) return { error: `Playlists can include up to ${MAX_ENTRIES} entries.` };

  const entries = rawEntries.map((entry) => {
    const type = ENTRY_TYPES.has(entry?.type) ? entry.type : "";
    const refId = String(entry?.refId || "").trim();
    const durationSeconds = Math.min(
      Math.max(Number.parseInt(entry?.durationSeconds, 10) || 60, MIN_DURATION_SECONDS),
      MAX_DURATION_SECONDS
    );
    return { type, refId, durationSeconds };
  });

  if (entries.some((entry) => !entry.type || !isUuid(entry.refId))) {
    return { error: "Each playlist entry needs a saved item or scene." };
  }

  const refError = await validateEntryRefs(admin, teacherId, entries);
  if (refError) return { error: refError };

  return { entries };
}

async function createPlaylist(admin, teacherId, body) {
  const name = normalizePlaylistName(body.name);
  if (!name) return jsonError("Name the playlist before saving it.");

  const normalized = await normalizeEntries(admin, teacherId, body.entries || []);
  if (normalized.error) return jsonError(normalized.error);

  const { data, error } = await admin
    .from("projector_playlists")
    .insert({
      teacher_id: teacherId,
      name,
      loop: body.loop === true,
      entries: normalized.entries,
    })
    .select("id, name, loop, entries, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector playlists are not set up yet.", 503);
    }
    if (error.code === "23505") return jsonError("You already have a playlist with that name.");
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ playlist: normalizePlaylist(data) });
}

async function updatePlaylist(admin, teacherId, body) {
  const playlistId = String(body.playlistId || "");
  if (!isUuid(playlistId)) return jsonError("Choose a playlist to update.");

  const patch = {};
  if ("name" in body) {
    const name = normalizePlaylistName(body.name);
    if (!name) return jsonError("Name the playlist before saving it.");
    patch.name = name;
  }
  if ("loop" in body) patch.loop = body.loop === true;
  if ("entries" in body) {
    const normalized = await normalizeEntries(admin, teacherId, body.entries);
    if (normalized.error) return jsonError(normalized.error);
    patch.entries = normalized.entries;
  }

  if (!Object.keys(patch).length) return jsonError("Choose something to update.");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("projector_playlists")
    .update(patch)
    .eq("id", playlistId)
    .eq("teacher_id", teacherId)
    .select("id, name, loop, entries, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector playlists are not set up yet.", 503);
    }
    if (error.code === "23505") return jsonError("You already have a playlist with that name.");
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("Playlist not found.", 404);

  return NextResponse.json({ playlist: normalizePlaylist(data) });
}

async function deletePlaylist(admin, teacherId, body) {
  const playlistId = String(body.playlistId || "");
  if (!isUuid(playlistId)) return jsonError("Choose a playlist to delete.");

  const { error } = await admin
    .from("projector_playlists")
    .delete()
    .eq("id", playlistId)
    .eq("teacher_id", teacherId);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return jsonError("Projector playlists are not set up yet.", 503);
    }
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const admin = createAdminClient();
  const context = await getTeacherContext();
  if (context.error) return context.error;
  return listPlaylists(admin, context.user.id);
}

export async function POST(request) {
  const admin = createAdminClient();
  const context = await getTeacherContext();
  if (context.error) return context.error;

  const body = await request.json().catch(() => ({}));
  if (body?.action === "create-playlist") return createPlaylist(admin, context.user.id, body);
  if (body?.action === "update-playlist") return updatePlaylist(admin, context.user.id, body);
  if (body?.action === "delete-playlist") return deletePlaylist(admin, context.user.id, body);

  return jsonError("Unknown Playlists action.");
}
