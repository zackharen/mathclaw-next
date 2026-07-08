import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sceneItemCandidates } from "../lib/projector/scene-item-extraction.mjs";

// One-time, idempotent backfill: runs every saved scene's screens through the
// same extraction/dedupe logic as scene saves, so all scene contents exist as
// individual saved Items. Adds rows only; never mutates or deletes.
// Usage: node scripts/backfill-projector-scene-items.mjs [env-file] [--dry-run]

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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const envPath = args.find((arg) => !arg.startsWith("--")) || ".env.local";

const env = readEnvFile(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envPath}`);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countItems(filters = (query) => query) {
  const { count, error } = await filters(
    admin.from("projector_library_items").select("id", { count: "exact", head: true })
  );
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const unhashedCount = await countItems((query) => query.is("content_hash", null));
if (unhashedCount > 0) {
  throw new Error(
    `${unhashedCount} projector_library_items rows have no content_hash. Apply migrations_20260707_projector_library_item_hash.sql first.`
  );
}

const itemsBefore = await countItems();

const candidatesByTeacher = new Map();
let sceneCount = 0;
const pageSize = 20;
for (let offset = 0; ; offset += pageSize) {
  const { data: scenes, error } = await admin
    .from("projector_scene_library_items")
    .select("id, teacher_id, screen_states")
    .order("created_at", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (error) throw new Error(error.message);
  if (!scenes?.length) break;

  for (const scene of scenes) {
    sceneCount += 1;
    const byHash = candidatesByTeacher.get(scene.teacher_id) || new Map();
    for (const candidate of sceneItemCandidates(scene.screen_states)) {
      if (!byHash.has(candidate.contentHash)) byHash.set(candidate.contentHash, candidate);
    }
    candidatesByTeacher.set(scene.teacher_id, byHash);
  }
  if (scenes.length < pageSize) break;
}

let insertedCount = 0;
let skippedExisting = 0;
const perTeacher = [];

for (const [teacherId, byHash] of candidatesByTeacher) {
  const candidates = [...byHash.values()];
  const existingHashes = new Set();
  for (let start = 0; start < candidates.length; start += 100) {
    const chunk = candidates.slice(start, start + 100);
    const { data: existing, error } = await admin
      .from("projector_library_items")
      .select("content_hash")
      .eq("teacher_id", teacherId)
      .in("content_hash", chunk.map((candidate) => candidate.contentHash));
    if (error) throw new Error(error.message);
    for (const row of existing || []) existingHashes.add(row.content_hash);
  }

  const missing = candidates.filter((candidate) => !existingHashes.has(candidate.contentHash));
  skippedExisting += candidates.length - missing.length;
  perTeacher.push({ teacherId, sceneItemCandidates: candidates.length, toInsert: missing.length });

  if (dryRun || !missing.length) continue;

  // Insert in small batches; contents can be multi-MB data URLs, so cap batch
  // payload size as well as row count.
  const maxBatchBytes = 4 * 1024 * 1024;
  let batch = [];
  let batchBytes = 0;
  async function flushBatch() {
    if (!batch.length) return;
    const { data, error } = await admin
      .from("projector_library_items")
      .insert(batch)
      .select("id");
    if (error) throw new Error(error.message);
    insertedCount += data?.length || 0;
    batch = [];
    batchBytes = 0;
  }
  for (const candidate of missing) {
    const row = {
      teacher_id: teacherId,
      title: candidate.title,
      content_type: candidate.contentType,
      content: candidate.content,
      content_hash: candidate.contentHash,
    };
    const rowBytes = candidate.content.length;
    if (batch.length && (batch.length >= 10 || batchBytes + rowBytes > maxBatchBytes)) {
      await flushBatch();
    }
    batch.push(row);
    batchBytes += rowBytes;
  }
  await flushBatch();
}

const itemsAfter = await countItems();

console.log(
  JSON.stringify(
    {
      dryRun,
      supabaseUrl: url,
      scenesScanned: sceneCount,
      teachers: perTeacher,
      dedupedCandidates: perTeacher.reduce((sum, teacher) => sum + teacher.sceneItemCandidates, 0),
      skippedAsExistingReplicas: skippedExisting,
      inserted: insertedCount,
      itemsBefore,
      itemsAfter,
    },
    null,
    2
  )
);
