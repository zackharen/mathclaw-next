import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(path) {
  const env = {};
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
  return env;
}

function removeLegacySavedGames(metadata) {
  if (!metadata || typeof metadata !== "object" || !("saved_games" in metadata)) {
    return { metadata: metadata || {}, changed: false };
  }
  const nextMetadata = { ...metadata };
  delete nextMetadata.saved_games;
  return { metadata: nextMetadata, changed: true };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value || {}));
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}

const email = process.argv[2];
const envPath = process.argv[3] || ".env.local";

if (!email) {
  console.error("Usage: node scripts/compact-auth-metadata.mjs <email> [env-file]");
  process.exit(1);
}

const env = readEnvFile(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envPath}`);
}

const admin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const user = await findUserByEmail(admin, email);
if (!user) {
  throw new Error(`No auth user found for ${email}`);
}

const beforeBytes = byteLength(user.user_metadata);
const { metadata, changed } = removeLegacySavedGames(user.user_metadata);

if (!changed) {
  console.log(
    JSON.stringify(
      {
        email,
        changed: false,
        userMetadataBytes: beforeBytes,
        metadataKeys: Object.keys(user.user_metadata || {}),
      },
      null,
      2
    )
  );
  process.exit(0);
}

const { data, error } = await admin.auth.admin.updateUserById(user.id, {
  user_metadata: metadata,
});

if (error) throw error;

console.log(
  JSON.stringify(
    {
      email,
      changed: true,
      beforeBytes,
      afterBytes: byteLength(data.user?.user_metadata),
      metadataKeys: Object.keys(data.user?.user_metadata || {}),
    },
    null,
    2
  )
);
