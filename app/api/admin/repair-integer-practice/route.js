import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/auth/owner";

const CONFIRM_TOKEN = "clear_integer_practice";

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findUserByEmail(admin, email) {
  const normalizedEmail = normalizeEmail(email);
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => normalizeEmail(user.email) === normalizedEmail);
    if (match) return match;
    if (users.length < 500) break;
    page += 1;
  }

  return null;
}

async function clearBrokenIntegerPracticeSave(email, confirm) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return json({ error: "Email is required." }, 400);
  }

  if (confirm !== CONFIRM_TOKEN) {
    return json({ error: "Missing confirmation token." }, 400);
  }

  if (!isOwnerEmail(normalizedEmail)) {
    return json({ error: "This repair route is limited to owner emails." }, 403);
  }

  const admin = createAdminClient();
  const authUser = await findUserByEmail(admin, normalizedEmail);

  if (!authUser) {
    return json({ error: "User not found." }, 404);
  }

  const nextMetadata = { ...(authUser.user_metadata || {}) };
  const savedGames =
    nextMetadata.saved_games && typeof nextMetadata.saved_games === "object"
      ? { ...nextMetadata.saved_games }
      : {};

  delete savedGames.integer_practice;

  if (Object.keys(savedGames).length > 0) {
    nextMetadata.saved_games = savedGames;
  } else {
    delete nextMetadata.saved_games;
  }

  const { error } = await admin.auth.admin.updateUserById(authUser.id, {
    user_metadata: nextMetadata,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({
    ok: true,
    cleared: "saved_games.integer_practice",
    email: normalizedEmail,
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return clearBrokenIntegerPracticeSave(
    searchParams.get("email"),
    searchParams.get("confirm")
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return clearBrokenIntegerPracticeSave(body.email, body.confirm);
}
