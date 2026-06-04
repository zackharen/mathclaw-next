"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const LIBRARY_CATEGORIES = ["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"];
const MATHCLAW_ORIGIN = "https://mathclaw.com";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const DIRECT_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;

function ensureKatexAssets() {
  if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = KATEX_CSS;
    document.head.appendChild(link);
  }

  if (window.katex || document.querySelector(`script[src="${KATEX_JS}"]`)) return;
  const script = document.createElement("script");
  script.src = KATEX_JS;
  script.async = true;
  document.head.appendChild(script);
}

function isEscapedLatexCharacter(source, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function isExponentStart(character) {
  return Boolean(character && /[A-Za-z0-9{\\]/.test(character));
}

function normalizeLatexLineForDisplay(line) {
  let normalized = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "%" && !isEscapedLatexCharacter(line, index)) {
      normalized += "\\%";
    } else if (character === "↑") {
      normalized += "\\uparrow ";
    } else if (character === "^" && !isExponentStart(line[index + 1])) {
      normalized += "\\uparrow ";
    } else {
      normalized += character;
    }
  }
  return normalized;
}

function renderLatex(element, content) {
  if (!element) return;
  const lines = String(content || "").split(/\r?\n/);
  if (!window.katex) {
    element.textContent = content || "";
    return;
  }
  try {
    element.replaceChildren();
    lines.forEach((line) => {
      const row = document.createElement("div");
      row.className = "projectorLatexLine";
      if (line.trim()) {
        window.katex.render(normalizeLatexLineForDisplay(line), row, {
          throwOnError: false,
          displayMode: true,
        });
      } else {
        row.appendChild(document.createElement("br"));
      }
      element.appendChild(row);
    });
  } catch {
    element.textContent = content || "";
  }
}

function ProjectorLatex({ content, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureKatexAssets();
    const id = window.setInterval(() => {
      if (window.katex) {
        renderLatex(ref.current, content);
        window.clearInterval(id);
      }
    }, 80);
    renderLatex(ref.current, content);
    return () => window.clearInterval(id);
  }, [content]);

  return <div ref={ref} className={className} />;
}

function renderTopText(state, compact = false) {
  if (!state?.topText || state.type === "text") return null;
  return <div className={compact ? "projectorTopTextThumb" : "projectorTopTextDisplay"}>{state.topText}</div>;
}

function renderContentBody(state, compact = false, options = {}) {
  if (!state) return <span className="projectorEmpty">empty</span>;
  if (state.type === "text") {
    return <div className={compact ? "projectorTextThumb" : "projectorTextDisplay"}>{state.content}</div>;
  }
  if (state.type === "latex") {
    return <ProjectorLatex content={state.content} className={compact ? "projectorLatexThumb" : ""} />;
  }
  if (state.type === "image") {
    return <img src={state.content} alt="" className="projectorThumbMedia" />;
  }
  if (state.type === "video") {
    if (compact && !options.playCompactVideo) {
      return (
        <span className="projectorVideoThumb">
          {/\.gif(\?|#|$)/i.test(state.content || "") ? "GIF" : "Video"}
        </span>
      );
    }
    if (/\.gif(\?|#|$)/i.test(state.content || "")) {
      return <img src={state.content} alt="" className="projectorThumbMedia" />;
    }
    return (
      <video className="projectorThumbMedia" src={state.content} autoPlay loop muted playsInline />
    );
  }
  return <span className="projectorEmpty">empty</span>;
}

function renderContent(state, compact = false, options = {}) {
  const topText = renderTopText(state, compact);
  const body = renderContentBody(state, compact, options);
  if (!topText) return body;
  return (
    <div className={compact ? "projectorContentStack isCompact" : "projectorContentStack"}>
      {topText}
      <div className="projectorContentBody">{body}</div>
    </div>
  );
}

function libraryTypeLabel(item) {
  const type = item?.content_type || item?.type || "";
  return type === "latex" ? "LaTeX" : type ? type[0].toUpperCase() + type.slice(1) : "Item";
}

function toLibraryState(item) {
  return {
    type: item.content_type,
    content: item.content,
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text().catch(() => "");
  const cleanText = text.replace(/\s+/g, " ").trim();
  return {
    error: cleanText ? `${fallbackMessage} ${cleanText.slice(0, 120)}` : fallbackMessage,
  };
}

function sceneFilledCount(scene) {
  return SCREEN_IDS.filter((screenId) => scene?.screen_states?.[screenId]).length;
}

function sceneFolderLabel(scene, folders) {
  if (!scene?.folder_id) return "Uncategorized";
  return folders.find((folder) => folder.id === scene.folder_id)?.title || "Folder";
}

function SidebarPanel({ ariaLabel, children, className = "", count, eyebrow, onToggle, open, title }) {
  return (
    <section className={`projectorLibrary ${className}`} aria-label={ariaLabel || title}>
      <button
        className="projectorLibraryHeader projectorPanelToggle"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        <span className="projectorPanelCount">{count}</span>
        <strong className="projectorPanelChevron">{open ? "Hide" : "Show"}</strong>
      </button>
      {open ? <div className="projectorPanelBody">{children}</div> : null}
    </section>
  );
}

export default function ProjectorClient({ session, libraryItems = [], sceneItems = [], sceneFolders = [] }) {
  const [screenStates, setScreenStates] = useState(session.screen_states || {});
  const [library, setLibrary] = useState(libraryItems);
  const [scenes, setScenes] = useState(sceneItems);
  const [folders, setFolders] = useState(sceneFolders);
  const [openFolderIds, setOpenFolderIds] = useState(new Set());
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [openPanels, setOpenPanels] = useState({ screens: true, scenes: false, library: false });
  const [target, setTarget] = useState("all");
  const [type, setType] = useState("text");
  const [text, setText] = useState("Welcome to class");
  const [latex, setLatex] = useState("\\frac{3}{4} + \\frac{1}{8}");
  const [showTopText, setShowTopText] = useState(false);
  const [topText, setTopText] = useState("");
  const [url, setUrl] = useState("");
  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [renamingItemId, setRenamingItemId] = useState(null);
  const [renamingItemTitle, setRenamingItemTitle] = useState("");
  const [renamingItemCategory, setRenamingItemCategory] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [sceneFolderId, setSceneFolderId] = useState("");
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [videoUploadUrl, setVideoUploadUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [savingScene, setSavingScene] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const latexTextareaRef = useRef(null);

  const screenTokens = session.screen_tokens || {};
  const targetScreenIds = useMemo(() => (target === "all" ? SCREEN_IDS : [target]), [target]);
  const sortedFolders = useMemo(
    () =>
      [...folders].sort((left, right) =>
        String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" })
      ),
    [folders]
  );
  const filteredLibrary = useMemo(() => {
    let items = library;
    if (libraryCategoryFilter) items = items.filter((item) => item.category === libraryCategoryFilter);
    if (librarySearch.trim()) {
      const query = librarySearch.trim().toLowerCase();
      items = items.filter((item) => item.title.toLowerCase().includes(query));
    }
    return items;
  }, [library, libraryCategoryFilter, librarySearch]);

  function toggleFolder(folderId) {
    setOpenFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  async function refetchScreenState(screenId) {
    const token = screenTokens[screenId];
    if (!token) return;
    const response = await fetch(`/api/projector?token=${encodeURIComponent(token)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setScreenStates((current) => ({
      ...current,
      [screenId]: payload.state || null,
    }));
  }

  function togglePanel(panelName) {
    setOpenPanels((current) => ({ ...current, [panelName]: !current[panelName] }));
  }

  useEffect(() => {
    ensureKatexAssets();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-session-${session.id}`)
      .on("broadcast", { event: "screen-updated" }, ({ payload }) => {
        const screenId = String(payload?.screenId || "");
        if (!SCREEN_IDS.includes(screenId)) return;
        if (payload?.refetch) {
          refetchScreenState(screenId);
          return;
        }
        setScreenStates((current) => ({
          ...current,
          [screenId]: payload?.type
            ? { type: payload.type, content: payload.content || "", topText: payload.topText || "" }
            : null,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, screenTokens]);

  async function copyUrl(screenId) {
    const screenUrl = `${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`;
    await navigator.clipboard.writeText(screenUrl);
    setMessage(`Screen ${screenId} URL copied.`);
  }

  function currentComposerContent() {
    if (type === "text") return text;
    if (type === "latex") return latex;
    if (type === "image") return imageDataUrl || url;
    return videoUploadUrl || url;
  }

  function currentComposerTopText() {
    return type !== "text" && showTopText ? topText : "";
  }

  function insertLatexSnippet(snippet, cursorOffset = snippet.length) {
    const textarea = latexTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? latex.length;
    const selectionEnd = textarea?.selectionEnd ?? latex.length;
    const nextLatex = `${latex.slice(0, selectionStart)}${snippet}${latex.slice(selectionEnd)}`;
    setLatex(nextLatex);
    window.requestAnimationFrame(() => {
      if (!latexTextareaRef.current) return;
      const nextCursor = selectionStart + cursorOffset;
      latexTextareaRef.current.focus();
      latexTextareaRef.current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function editScreenContent(screenId) {
    const state = screenStates?.[screenId];
    if (!state?.type) {
      setMessage(`Screen ${screenId} is empty.`);
      return;
    }

    setTarget(screenId);
    setType(state.type);
    setShowTopText(Boolean(state.topText));
    setTopText(state.topText || "");
    setUrl("");
    setImageDataUrl("");
    setVideoUploadUrl("");
    setVideoFileName("");
    setOpenPanels((current) => ({ ...current, screens: true }));

    if (state.type === "text") {
      setText(state.content || "");
    } else if (state.type === "latex") {
      setLatex(state.content || "");
    } else if (state.type === "image") {
      if (String(state.content || "").startsWith("data:")) {
        setImageDataUrl(state.content || "");
      } else {
        setUrl(state.content || "");
      }
    } else if (state.type === "video") {
      setUrl(state.content || "");
    }

    setMessage(`Loaded screen ${screenId} into the composer.`);
  }

  async function renameLibraryItem(itemId, title, category) {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-library-item", itemId, title, category }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rename that item.");
      setLibrary((current) => current.map((item) => (item.id === itemId ? payload.item : item)));
      setRenamingItemId(null);
      setMessage(`Renamed to "${payload.item.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  function loadLibraryItem(item) {
    const nextType = item.content_type;
    setType(nextType);
    setLibraryTitle(item.title || "");
    setLibraryCategory(item.category || "");
    setUrl("");
    setImageDataUrl("");
    setVideoUploadUrl("");
    setVideoFileName("");
    setShowTopText(Boolean(item.topText));
    setTopText(item.topText || "");

    if (nextType === "text") setText(item.content || "");
    if (nextType === "latex") setLatex(item.content || "");
    if (nextType === "image") {
      if (String(item.content || "").startsWith("data:")) {
        setImageDataUrl(item.content || "");
      } else {
        setUrl(item.content || "");
      }
    }
    if (nextType === "video") setUrl(item.content || "");
    setMessage(`Loaded "${item.title}" into the composer.`);
  }

  async function saveLibraryItem() {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-library-item",
          title: libraryTitle,
          type,
          content: currentComposerContent(),
          category: libraryCategory,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save that item.");

      setLibrary((current) => [payload.item, ...current.filter((item) => item.id !== payload.item.id)]);
      setLibraryTitle(payload.item.title || "");
      setMessage(`Saved "${payload.item.title}" to your library.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  async function deleteLibraryItem(itemId) {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-library-item", itemId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that item.");

      setLibrary((current) => current.filter((item) => item.id !== itemId));
      setMessage("Saved item deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  async function saveScene() {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-scene",
          title: sceneTitle,
          folderId: sceneFolderId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save that room setup.");

      setScenes((current) => [payload.scene, ...current.filter((scene) => scene.id !== payload.scene.id)]);
      setSceneTitle(payload.scene.title || "");
      setMessage(`Saved "${payload.scene.title}" as a room setup.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function createSceneFolder() {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-scene-folder", title: newFolderTitle }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create that folder.");

      setFolders((current) => [payload.folder, ...current.filter((folder) => folder.id !== payload.folder.id)]);
      setOpenFolderIds((current) => new Set([...current, payload.folder.id]));
      setSceneFolderId(payload.folder.id);
      setNewFolderTitle("");
      setShowNewFolderForm(false);
      setMessage(`Created folder "${payload.folder.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function deleteSceneFolder(folderId) {
    setSavingScene(true);
    setMessage("");
    try {
      const folder = folders.find((item) => item.id === folderId);
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-scene-folder", folderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that folder.");

      setFolders((current) => current.filter((item) => item.id !== folderId));
      setScenes((current) =>
        current.map((scene) => (scene.folder_id === folderId ? { ...scene, folder_id: null } : scene))
      );
      if (sceneFolderId === folderId) setSceneFolderId("");
      setMessage(`Deleted "${folder?.title || "Folder"}". Scenes Moved To Uncategorized.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function updateSceneFolder(sceneId, folderId) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-scene-folder", sceneId, folderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not move that room setup.");

      setScenes((current) => current.map((scene) => (scene.id === sceneId ? payload.scene : scene)));
      setMessage(`Moved "${payload.scene.title}" to ${sceneFolderLabel(payload.scene, folders)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function loadScene(scene) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load-scene", sceneId: scene.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load that room setup.");

      setScreenStates(payload.screenStates || scene.screen_states || {});
      setMessage(`Loaded "${payload.title || scene.title}" to all screens.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function deleteScene(sceneId) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-scene", sceneId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that room setup.");

      setScenes((current) => current.filter((scene) => scene.id !== sceneId));
      setMessage("Room setup deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  function onImageFileChange(event) {
    const file = event.target.files?.[0];
    setImageDataUrl("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("That image is over 5MB. Choose a smaller image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Heads up: images over 2MB can feel slower on classroom Wi-Fi.");
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function onVideoFileChange(event) {
    const file = event.target.files?.[0];
    setVideoUploadUrl("");
    setVideoFileName("");
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      setMessage("That recording is over 75MB. Try a shorter clip.");
      return;
    }

    setUploadingVideo(true);
    setMessage("Uploading recording...");
    try {
      if (file.size <= DIRECT_VIDEO_UPLOAD_BYTES) {
        const formData = new FormData();
        formData.append("file", file);
        setMessage("Converting recording to projector video...");
        const directResponse = await fetch("/api/projector/upload-video", {
          method: "POST",
          body: formData,
        });
        const directPayload = await readJsonResponse(directResponse, "Could not convert the recording.");
        if (!directResponse.ok) {
          throw new Error(directPayload.error || "Could not convert the recording.");
        }

        setVideoUploadUrl(directPayload.url);
        setVideoFileName(file.name);
        setUrl("");
        setMessage("Recording is ready to send.");
        return;
      }

      const prepareResponse = await fetch("/api/projector/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          fileName: file.name,
          contentType: file.type || "video/quicktime",
          size: file.size,
        }),
      });
      const preparePayload = await readJsonResponse(prepareResponse, "Could not prepare the recording upload.");
      if (!prepareResponse.ok) {
        throw new Error(preparePayload.error || "Could not prepare the recording upload.");
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(preparePayload.bucket)
        .uploadToSignedUrl(preparePayload.path, preparePayload.token, file, {
          contentType: file.type || "video/quicktime",
        });
      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setMessage("Converting recording to projector video...");
      const convertResponse = await fetch("/api/projector/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", path: preparePayload.path }),
      });
      const convertPayload = await readJsonResponse(convertResponse, "Could not convert the recording.");
      if (!convertResponse.ok) {
        throw new Error(convertPayload.error || "Could not convert the recording.");
      }

      setVideoUploadUrl(convertPayload.url);
      setVideoFileName(file.name);
      setUrl("");
      setMessage("Recording is ready to send.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploadingVideo(false);
    }
  }

  async function sendContent() {
    setSending(true);
    setMessage("");
    const content = currentComposerContent();
    const nextTopText = currentComposerTopText();

    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          screenIds: targetScreenIds,
          type,
          content,
          topText: nextTopText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not send content.");

      setScreenStates((current) => {
        const next = { ...current };
        targetScreenIds.forEach((screenId) => {
          next[screenId] = nextTopText ? { type, content, topText: nextTopText } : { type, content };
        });
        return next;
      });
      setMessage(`Sent to ${target === "all" ? "all screens" : `screen ${target}`}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function rotateScreens(direction = "forward") {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-screens", direction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rotate screens.");
      setScreenStates(payload.screenStates || {});
      setMessage(direction === "backward" ? "Screens rotated left." : "Screens rotated right.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function clearScreens() {
    setSending(true);
    setMessage("");
    try {
      for (const screenId of targetScreenIds) {
        const response = await fetch("/api/projector", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not clear content.");
      }
      setScreenStates((current) => {
        const next = { ...current };
        targetScreenIds.forEach((screenId) => {
          next[screenId] = null;
        });
        return next;
      });
      setMessage(`Cleared ${target === "all" ? "all screens" : `screen ${target}`}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="projectorDashboard">
      <section className="projectorHeader">
        <div>
          <p className="eyebrow">Projector Party</p>
          <h1>Projector</h1>
        </div>
        <div className="projectorPin">
          <span>Room PIN</span>
          <strong>{session.pin}</strong>
        </div>
      </section>

      <div className="projectorLayout">
        <div className="projectorGridColumn">
          <section className="projectorGrid" aria-label="Projector screens">
            {SCREEN_IDS.map((screenId) => (
              <article className="projectorScreenCard" key={screenId}>
                <div className="projectorScreenCardHeader">
                  <div className="projectorScreenTitleRow">
                    <strong>Screen {screenId}</strong>
                    <button
                      className="projectorScreenEdit"
                      type="button"
                      onClick={() => editScreenContent(screenId)}
                      disabled={!screenStates?.[screenId]?.type}
                    >
                      Edit
                    </button>
                  </div>
                  <span>{screenStates?.[screenId]?.type || "empty"}</span>
                </div>
                <div className="projectorScreenPreview">
                  {renderContent(screenStates?.[screenId], true, { playCompactVideo: true })}
                </div>
                <div className="projectorScreenUrl">
                  <code>{`${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`}</code>
                  <button className="btn secondary" type="button" onClick={() => copyUrl(screenId)}>
                    Copy
                  </button>
                </div>
              </article>
            ))}
          </section>
          <div className="projectorRotateRow">
            <button className="btn secondary" type="button" onClick={() => rotateScreens("backward")} disabled={sending}>
              ↶ Rotate Left
            </button>
            <button className="btn secondary" type="button" onClick={() => rotateScreens("forward")} disabled={sending}>
              ↷ Rotate Right
            </button>
          </div>
        </div>

        <aside className="projectorComposer">
          <SidebarPanel
            ariaLabel="Screen Selection"
            count={target === "all" ? "All" : target}
            eyebrow="Controls"
            onToggle={() => togglePanel("screens")}
            open={openPanels.screens}
            title="Screen Selection"
          >
            <div className="projectorTargetPicker" aria-label="Screen Selection">
              <div className="projectorTargetButtons">
                <button
                  className={target === "all" ? "isActive" : ""}
                  type="button"
                  onClick={() => setTarget("all")}
                >
                  All
                </button>
                {SCREEN_IDS.map((screenId) => (
                  <button
                    className={target === screenId ? "isActive" : ""}
                    key={screenId}
                    type="button"
                    onClick={() => setTarget(screenId)}
                  >
                    {screenId}
                  </button>
                ))}
              </div>
            </div>
            <div className="projectorTabs" role="tablist" aria-label="Content Type">
              {["text", "latex", "image", "video"].map((tab) => (
                <button
                  className={type === tab ? "isActive" : ""}
                  key={tab}
                  type="button"
                  onClick={() => setType(tab)}
                >
                  {tab === "latex" ? "LaTeX" : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {type !== "text" ? (
              <div className="projectorTopTextControls">
                <label className="projectorCheckboxRow">
                  <input
                    type="checkbox"
                    checked={showTopText}
                    onChange={(event) => setShowTopText(event.target.checked)}
                  />
                  <span>Text?</span>
                </label>
                {showTopText ? (
                  <label className="field">
                    <span>Top Text</span>
                    <textarea
                      value={topText}
                      onChange={(event) => setTopText(event.target.value)}
                      rows={2}
                      maxLength={500}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {type === "text" ? (
              <>
                <label className="field">
                  <span>Text</span>
                  <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} />
                </label>
                <div className="projectorComposerPreview">
                  <div className="projectorTextPreview">{text || "Text Preview"}</div>
                </div>
              </>
            ) : null}

            {type === "latex" ? (
              <>
                <label className="field">
                  <span className="projectorLatexLabelRow">
                    <span>LaTeX</span>
                    <span className="projectorLatexInsertButtons" aria-label="LaTeX helpers">
                      <button type="button" onClick={() => insertLatexSnippet("\\frac{}{}", 6)}>
                        Fraction
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\sqrt{}", 6)}>
                        Sqrt
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\uparrow ")}>
                        Up
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\downarrow ")}>
                        Down
                      </button>
                    </span>
                  </span>
                  <textarea
                    ref={latexTextareaRef}
                    value={latex}
                    onChange={(event) => setLatex(event.target.value)}
                    rows={5}
                  />
                </label>
                <div className="projectorComposerPreview">
                  {renderContent({ type, content: latex, topText: currentComposerTopText() })}
                </div>
              </>
            ) : null}

            {type === "image" ? (
              <>
                <label className="field">
                  <span>Image Upload</span>
                  <input accept="image/*" type="file" onChange={onImageFileChange} />
                </label>
                <label className="field">
                  <span>Image URL</span>
                  <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
                </label>
                <div className="projectorComposerPreview">
                  {imageDataUrl || url
                    ? renderContent({ type, content: imageDataUrl || url, topText: currentComposerTopText() })
                    : "No Image Selected"}
                </div>
              </>
            ) : null}

            {type === "video" ? (
              <>
                <label className="field">
                  <span>Video Upload</span>
                  <input
                    accept="video/*,.mov,.m4v,.webm"
                    type="file"
                    onChange={onVideoFileChange}
                    disabled={uploadingVideo}
                  />
                </label>
                {videoFileName ? <p className="projectorUploadNote">Ready: {videoFileName}</p> : null}
                <label className="field">
                  <span>Video or GIF URL</span>
                  <input
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setVideoUploadUrl("");
                      setVideoFileName("");
                    }}
                    placeholder="https://.../video.mp4"
                  />
                </label>
                <div className="projectorComposerPreview">
                  {(videoUploadUrl || url) && /\.gif(\?|#|$)/i.test(videoUploadUrl || url) ? (
                    renderContent({ type, content: videoUploadUrl || url, topText: currentComposerTopText() })
                  ) : videoUploadUrl || url ? (
                    renderContent({ type, content: videoUploadUrl || url, topText: currentComposerTopText() })
                  ) : uploadingVideo ? (
                    "Converting Recording..."
                  ) : (
                    "Upload a Screen Recording or Paste a Hosted MP4/GIF URL"
                  )}
                </div>
              </>
            ) : null}

            <div className="projectorActions">
              <button className="btn" type="button" onClick={sendContent} disabled={sending || uploadingVideo}>
                Send
              </button>
              <button className="btn secondary" type="button" onClick={clearScreens} disabled={sending || uploadingVideo}>
                Clear
              </button>
            </div>
            {message ? <p className="projectorMessage">{message}</p> : null}
          </SidebarPanel>

          <SidebarPanel
            ariaLabel="Saved Room Setups"
            className="projectorSceneLibrary"
            count={scenes.length}
            eyebrow="Scenes"
            onToggle={() => togglePanel("scenes")}
            open={openPanels.scenes}
            title="Scenes"
          >
            <label className="field">
              <span>Save Current Screens As</span>
              <input
                value={sceneTitle}
                onChange={(event) => setSceneTitle(event.target.value)}
                placeholder="Start of Class, Exit Ticket..."
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Folder</span>
              <select value={sceneFolderId} onChange={(event) => setSceneFolderId(event.target.value)}>
                <option value="">Uncategorized</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn secondary" type="button" onClick={saveScene} disabled={savingScene}>
              Save Scene
            </button>

            {/* Uncategorized folder */}
            {(() => {
              const uncatScenes = scenes.filter((scene) => !scene.folder_id);
              const isOpen = openFolderIds.has("uncategorized");
              return (
                <div className="projectorSceneFolderSection">
                  <div className="projectorSceneFolderHeader">
                    <button
                      className="projectorSceneFolderToggle"
                      type="button"
                      onClick={() => toggleFolder("uncategorized")}
                      aria-expanded={isOpen}
                    >
                      <span>Uncategorized</span>
                      <span className="projectorFolderCount">{uncatScenes.length}</span>
                      <strong>{isOpen ? "▲" : "▼"}</strong>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="projectorLibraryList">
                      {uncatScenes.length ? (
                        uncatScenes.map((scene) => (
                          <article className="projectorSceneItem" key={scene.id}>
                            <button type="button" onClick={() => loadScene(scene)} disabled={savingScene}>
                              <span>
                                <strong>{scene.title}</strong>
                                <em>{sceneFilledCount(scene)} Of 4 Screens Filled</em>
                              </span>
                              <span className="projectorSceneThumb" aria-hidden="true">
                                {SCREEN_IDS.map((screenId) => (
                                  <span key={screenId}>{renderContent(scene.screen_states?.[screenId], true)}</span>
                                ))}
                              </span>
                            </button>
                            <div className="projectorSceneControls">
                              <label>
                                <span>Move to folder</span>
                                <select
                                  value={scene.folder_id || ""}
                                  onChange={(event) => updateSceneFolder(scene.id, event.target.value)}
                                  disabled={savingScene}
                                >
                                  <option value="">Uncategorized</option>
                                  {folders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>{folder.title}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="projectorLibraryDelete"
                                type="button"
                                onClick={() => deleteScene(scene.id)}
                                disabled={savingScene}
                                aria-label={`Delete ${scene.title}`}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="projectorLibraryEmpty">No scenes here yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* Named folders */}
            {sortedFolders.map((folder) => {
              const folderScenes = scenes.filter((scene) => scene.folder_id === folder.id);
              const isOpen = openFolderIds.has(folder.id);
              return (
                <div className="projectorSceneFolderSection" key={folder.id}>
                  <div className="projectorSceneFolderHeader">
                    <button
                      className="projectorSceneFolderToggle"
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      aria-expanded={isOpen}
                    >
                      <span>{folder.title}</span>
                      <span className="projectorFolderCount">{folderScenes.length}</span>
                      <strong>{isOpen ? "▲" : "▼"}</strong>
                    </button>
                    <button
                      className="projectorSceneFolderDelete"
                      type="button"
                      onClick={() => deleteSceneFolder(folder.id)}
                      disabled={savingScene}
                      aria-label={`Delete folder ${folder.title}`}
                    >
                      D
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="projectorLibraryList">
                      {folderScenes.length ? (
                        folderScenes.map((scene) => (
                          <article className="projectorSceneItem" key={scene.id}>
                            <button type="button" onClick={() => loadScene(scene)} disabled={savingScene}>
                              <span>
                                <strong>{scene.title}</strong>
                                <em>{sceneFilledCount(scene)} Of 4 Screens Filled</em>
                              </span>
                              <span className="projectorSceneThumb" aria-hidden="true">
                                {SCREEN_IDS.map((screenId) => (
                                  <span key={screenId}>{renderContent(scene.screen_states?.[screenId], true)}</span>
                                ))}
                              </span>
                            </button>
                            <div className="projectorSceneControls">
                              <label>
                                <span>Move to folder</span>
                                <select
                                  value={scene.folder_id || ""}
                                  onChange={(event) => updateSceneFolder(scene.id, event.target.value)}
                                  disabled={savingScene}
                                >
                                  <option value="">Uncategorized</option>
                                  {folders.map((f) => (
                                    <option key={f.id} value={f.id}>{f.title}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="projectorLibraryDelete"
                                type="button"
                                onClick={() => deleteScene(scene.id)}
                                disabled={savingScene}
                                aria-label={`Delete ${scene.title}`}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="projectorLibraryEmpty">No scenes in this folder yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* New folder */}
            {showNewFolderForm ? (
              <div className="projectorSceneFolderCreator">
                <label className="field">
                  <span>Folder Name</span>
                  <input
                    value={newFolderTitle}
                    onChange={(event) => setNewFolderTitle(event.target.value)}
                    placeholder="Period 1, Warmups, Escape Room..."
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <div className="projectorSceneFolderCreatorActions">
                  <button className="btn secondary" type="button" onClick={createSceneFolder} disabled={savingScene || !newFolderTitle.trim()}>
                    Add Folder
                  </button>
                  <button className="btn secondary" type="button" onClick={() => { setShowNewFolderForm(false); setNewFolderTitle(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn secondary" type="button" onClick={() => setShowNewFolderForm(true)}>
                + New Folder
              </button>
            )}
          </SidebarPanel>

          <SidebarPanel
            ariaLabel="Saved Projector Items"
            count={library.length}
            eyebrow="Library"
            onToggle={() => togglePanel("library")}
            open={openPanels.library}
            title="Saved Items"
          >
            <label className="field">
              <span>Save Current Item As</span>
              <input
                value={libraryTitle}
                onChange={(event) => setLibraryTitle(event.target.value)}
                placeholder="Warmup question, word wall..."
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value)}>
                <option value="">No Category</option>
                {LIBRARY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <button
              className="btn secondary"
              type="button"
              onClick={saveLibraryItem}
              disabled={savingLibrary || uploadingVideo}
            >
              Save To Library
            </button>

            {library.length > 0 ? (
              <>
                <label className="field">
                  <span>Search</span>
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search saved items..."
                  />
                </label>
                <div className="projectorLibraryCategoryFilters">
                  <button
                    className={libraryCategoryFilter === "" ? "isActive" : ""}
                    type="button"
                    onClick={() => setLibraryCategoryFilter("")}
                  >
                    All
                  </button>
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <button
                      className={libraryCategoryFilter === cat ? "isActive" : ""}
                      key={cat}
                      type="button"
                      onClick={() => setLibraryCategoryFilter(libraryCategoryFilter === cat ? "" : cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="projectorLibraryList">
              {filteredLibrary.length ? (
                filteredLibrary.map((item) => (
                  <article className="projectorLibraryItem" key={item.id}>
                    {renamingItemId === item.id ? (
                      <div className="projectorLibraryRenameForm">
                        <label className="field">
                          <span>Name</span>
                          <input
                            value={renamingItemTitle}
                            onChange={(event) => setRenamingItemTitle(event.target.value)}
                            maxLength={80}
                            autoFocus
                          />
                        </label>
                        <label className="field">
                          <span>Category</span>
                          <select value={renamingItemCategory} onChange={(event) => setRenamingItemCategory(event.target.value)}>
                            <option value="">No Category</option>
                            {LIBRARY_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </label>
                        <div className="projectorLibraryRenameActions">
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => renameLibraryItem(item.id, renamingItemTitle, renamingItemCategory)}
                            disabled={savingLibrary || !renamingItemTitle.trim()}
                          >
                            Save
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => setRenamingItemId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => loadLibraryItem(item)}>
                        <span>
                          <strong>{item.title}</strong>
                          <em>
                            {item.category ? `${item.category} · ` : ""}
                            {libraryTypeLabel(item)}
                          </em>
                        </span>
                        <span className="projectorLibraryThumb">{renderContent(toLibraryState(item), true)}</span>
                      </button>
                    )}
                    {renamingItemId !== item.id ? (
                      <div className="projectorLibraryItemActions">
                        <button
                          className="projectorLibraryRename"
                          type="button"
                          onClick={() => {
                            setRenamingItemId(item.id);
                            setRenamingItemTitle(item.title || "");
                            setRenamingItemCategory(item.category || "");
                          }}
                          disabled={savingLibrary}
                          aria-label={`Rename ${item.title}`}
                        >
                          Rename
                        </button>
                        <button
                          className="projectorLibraryDelete"
                          type="button"
                          onClick={() => deleteLibraryItem(item.id)}
                          disabled={savingLibrary}
                          aria-label={`Delete ${item.title}`}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : library.length ? (
                <p className="projectorLibraryEmpty">No items match your search.</p>
              ) : (
                <p className="projectorLibraryEmpty">Save single items here — questions, word walls, images, videos. Use Scenes above to save full room layouts.</p>
              )}
            </div>
          </SidebarPanel>

        </aside>
      </div>
    </div>
  );
}
