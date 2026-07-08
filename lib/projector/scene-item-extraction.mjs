import { createHash } from "node:crypto";

const CONTENT_TYPES = new Set(["text", "latex", "image", "video"]);
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const AUTO_ITEM_CONTENT_LIMIT = 8 * 1024 * 1024;
const AUTO_ITEM_SNIPPET_LIMIT = 40;
const AUTO_ITEM_TITLE_LIMIT = 80;

export function sceneItemContentHash(contentType, content) {
  return createHash("sha256").update(`${contentType}:${content}`, "utf8").digest("hex");
}

function displaySnippetSource(content) {
  if (!content.startsWith(QUESTION_CONTENT_PREFIX)) return content;
  try {
    const parsed = JSON.parse(content.slice(QUESTION_CONTENT_PREFIX.length));
    return typeof parsed.content === "string" ? parsed.content : "";
  } catch {
    return content;
  }
}

function fileNameFromUrl(content) {
  try {
    const pathname = new URL(content).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "").trim();
  } catch {
    return "";
  }
}

export function autoItemTitle(contentType, content) {
  if (contentType === "image" || contentType === "video") {
    const fileName = content.startsWith("data:") ? "" : fileNameFromUrl(content);
    if (fileName) return fileName.slice(0, AUTO_ITEM_TITLE_LIMIT);
    return contentType === "image" ? "Saved image" : "Saved video";
  }
  const snippet = displaySnippetSource(content).replace(/\s+/g, " ").trim().slice(0, AUTO_ITEM_SNIPPET_LIMIT);
  if (snippet) return snippet;
  return contentType === "latex" ? "Saved LaTeX" : "Saved text";
}

export function sceneItemCandidates(screenStates) {
  const source = screenStates && typeof screenStates === "object" ? screenStates : {};
  const byHash = new Map();
  for (const state of Object.values(source)) {
    if (!state || typeof state !== "object") continue;
    const contentType = state.type;
    const content = String(state.content || "");
    if (!CONTENT_TYPES.has(contentType) || !content.trim()) continue;
    if (content.length > AUTO_ITEM_CONTENT_LIMIT) continue;
    const contentHash = sceneItemContentHash(contentType, content);
    if (byHash.has(contentHash)) continue;
    byHash.set(contentHash, {
      contentType,
      content,
      contentHash,
      title: autoItemTitle(contentType, content),
    });
  }
  return [...byHash.values()];
}
