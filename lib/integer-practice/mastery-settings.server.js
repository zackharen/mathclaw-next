import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureGameCatalog } from "@/lib/student-games/catalog";
import {
  INTEGER_MASTERY_SETTINGS_GAME,
  normalizeIntegerMasterySettings,
} from "./mastery-settings";

export async function ensureIntegerMasterySettingsCatalog(admin = createAdminClient()) {
  await ensureGameCatalog(admin);

  const { error } = await admin.from("games").upsert(
    {
      slug: INTEGER_MASTERY_SETTINGS_GAME.slug,
      name: INTEGER_MASTERY_SETTINGS_GAME.name,
      category: INTEGER_MASTERY_SETTINGS_GAME.category,
      description: INTEGER_MASTERY_SETTINGS_GAME.description,
      is_multiplayer: false,
    },
    {
      onConflict: "slug",
      ignoreDuplicates: false,
    }
  );

  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function getIntegerMasterySettings(admin = createAdminClient()) {
  try {
    const { data, error } = await admin
      .from("game_sessions")
      .select("metadata, created_at, player_id")
      .eq("game_slug", INTEGER_MASTERY_SETTINGS_GAME.slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...normalizeIntegerMasterySettings(data?.metadata?.settings || data?.metadata || {}),
      updatedAt: data?.created_at || null,
      updatedBy: data?.player_id || null,
    };
  } catch {
    return {
      ...normalizeIntegerMasterySettings({}),
      updatedAt: null,
      updatedBy: null,
    };
  }
}
