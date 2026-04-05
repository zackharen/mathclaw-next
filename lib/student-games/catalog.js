import { createAdminClient } from "@/lib/supabase/admin";

export const GAME_CATALOG = [
  {
    slug: "2048",
    name: "2048",
    category: "arcade",
    description: "Merge tiles and chase higher scores.",
    is_multiplayer: false,
  },
  {
    slug: "connect4",
    name: "Connect4",
    category: "multiplayer",
    description: "Play head-to-head with an invite code.",
    is_multiplayer: true,
  },
  {
    slug: "integer_practice",
    name: "Adding & Subtracting Integers",
    category: "math_skills",
    description: "Adaptive integer fluency practice.",
    is_multiplayer: false,
  },
  {
    slug: "money_counting",
    name: "Money Counting",
    category: "math_skills",
    description: "Count money or build the right amount with quick replayable rounds.",
    is_multiplayer: false,
  },
  {
    slug: "minesweeper",
    name: "Minesweeper",
    category: "arcade",
    description: "Clear the board, flag the mines, and beat the clock.",
    is_multiplayer: false,
  },
  {
    slug: "number_compare",
    name: "Which Number Is Bigger?",
    category: "math_skills",
    description: "Compare decimals, negatives, fractions, and more.",
    is_multiplayer: false,
  },
  {
    slug: "telling_time",
    name: "Telling Time",
    category: "math_skills",
    description: "Read clocks and set times with fast clock-based rounds.",
    is_multiplayer: false,
  },
  {
    slug: "sudoku",
    name: "Sudoku",
    category: "arcade",
    description: "Fill the grid with digits 1 through 9 and keep every row, column, and box clean.",
    is_multiplayer: false,
  },
  {
    slug: "comet_typing",
    name: "Comet Typing",
    category: "arcade",
    description: "Guide Nova the courier by typing words quickly and keeping your streak alive.",
    is_multiplayer: false,
  },
];

export const GAME_SLUGS = new Set(GAME_CATALOG.map((game) => game.slug));

export function getGameBySlug(slug) {
  return GAME_CATALOG.find((game) => game.slug === slug) || null;
}

export function sortGamesByName(games) {
  return [...(games || [])].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""))
  );
}

export async function ensureGameCatalog(adminClient = null) {
  const admin = adminClient || createAdminClient();
  const { error } = await admin.from("games").upsert(GAME_CATALOG, {
    onConflict: "slug",
    ignoreDuplicates: false,
  });

  if (error && !String(error.message || "").includes("duplicate")) {
    throw new Error(error.message);
  }
}
