import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const BUCKET = "projector-videos";
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanFileName(name) {
  return String(name || "recording")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function getTeacherContext(admin) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to upload projector videos.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can upload projector videos.", 403) };
  }

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("id")
    .eq("teacher_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) return { error: jsonError(error.message, 500) };
  if (!session) return { error: jsonError("Open Projector once before uploading a video.", 404) };
  return { user };
}

async function ensureVideoBucket(admin) {
  const { error: getError } = await admin.storage.getBucket(BUCKET);
  if (!getError) {
    const { error: updateError } = await admin.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: null,
    });
    return updateError || null;
  }

  const { error: createError } = await admin.storage.createBucket(BUCKET, {
    public: true,
  });

  if (createError && !/already exists/i.test(createError.message || "")) return createError;
  return null;
}

async function prepareUpload(admin, user, body) {
  const size = Number(body.size || 0);
  if (!size || size > MAX_VIDEO_BYTES) {
    return jsonError("Choose a screen recording under 75MB.");
  }

  const bucketError = await ensureVideoBucket(admin);
  if (bucketError) return jsonError(bucketError.message, 500);

  const originalName = cleanFileName(body.fileName);
  const uploadPath = `raw/${user.id}/${Date.now()}-${randomUUID()}-${originalName}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(uploadPath);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({
    bucket: BUCKET,
    path: data.path,
    token: data.token,
  });
}

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

async function convertVideo(admin, user, body) {
  if (!ffmpegPath) return jsonError("Video conversion is not available on this server.", 500);

  const rawPath = String(body.path || "");
  if (!rawPath.startsWith(`raw/${user.id}/`)) return jsonError("That upload was not found.", 404);

  const bucketError = await ensureVideoBucket(admin);
  if (bucketError) return jsonError(bucketError.message, 500);

  const { data: rawBlob, error: downloadError } = await admin.storage.from(BUCKET).download(rawPath);
  if (downloadError || !rawBlob) {
    return jsonError(downloadError?.message || "Could not read the uploaded recording.", 500);
  }

  const workDir = path.join(tmpdir(), `projector-video-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = path.join(workDir, "input");
  const outputPath = path.join(workDir, "output.mp4");

  try {
    await writeFile(inputPath, await blobToBuffer(rawBlob));
    await execFileAsync(
      ffmpegPath,
      [
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      { timeout: 55000 }
    );

    const convertedPath = `converted/${user.id}/${Date.now()}-${randomUUID()}.mp4`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(convertedPath, await readFile(outputPath), {
        contentType: "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) return jsonError(uploadError.message, 500);

    await admin.storage.from(BUCKET).remove([rawPath]);
    const { data } = admin.storage.from(BUCKET).getPublicUrl(convertedPath);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    return jsonError(
      error?.killed
        ? "That recording took too long to convert. Try a shorter clip."
        : "Could not convert that recording. Try an MP4, MOV, or WebM screen recording.",
      500
    );
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

export async function POST(request) {
  const admin = createAdminClient();
  const context = await getTeacherContext(admin);
  if (context.error) return context.error;

  const body = await request.json().catch(() => ({}));
  if (body.action === "prepare") return prepareUpload(admin, context.user, body);
  if (body.action === "convert") return convertVideo(admin, context.user, body);

  return jsonError("Choose a video upload action.");
}
