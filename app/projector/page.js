import crypto from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import ProjectorClient from "./projector-client";

export const dynamic = "force-dynamic";

const SCREEN_IDS = ["1", "2", "3", "4"];

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

  return (
    <ProjectorClient
      session={session}
      libraryItems={libraryItems}
      sceneItems={sceneItems}
      sceneFolders={sceneFolders}
    />
  );
}
