"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SCREEN_IDS = ["1", "2", "3", "4"];
const LIBRARY_CATEGORIES = ["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"];
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";

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

function isArrowTokenStart(source, index) {
  return (
    source.startsWith("\\uparrow", index) ||
    source.startsWith("\\downarrow", index) ||
    source[index] === "↑" ||
    source[index] === "↓" ||
    (source[index] === "^" && !isExponentStart(source[index + 1]))
  );
}

function visibleLatexSpaces(count) {
  return "\\;".repeat(Math.min(count, 4));
}

function normalizeLatexLineForDisplay(line) {
  let normalized = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === " ") {
      let end = index;
      while (line[end] === " ") end += 1;
      normalized += isArrowTokenStart(line, end) ? visibleLatexSpaces(end - index) : line.slice(index, end);
      index = end - 1;
    } else if (line.startsWith("\\uparrow", index) || line.startsWith("\\downarrow", index)) {
      const command = line.startsWith("\\uparrow", index) ? "\\uparrow" : "\\downarrow";
      let end = index + command.length;
      while (line[end] === " ") end += 1;
      normalized += `${command}${visibleLatexSpaces(end - index - command.length)}`;
      index = end - 1;
    } else if (character === "%" && !isEscapedLatexCharacter(line, index)) {
      normalized += "\\%";
    } else if (character === "↑") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "↓") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\downarrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "^" && !isExponentStart(line[index + 1])) {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
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

function parseQuestionContent(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    return parsed.question || parsed || null;
  } catch {
    return null;
  }
}

function displayContent(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return source;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    return typeof parsed.content === "string" ? parsed.content : "";
  } catch {
    return source;
  }
}

function itemTypeLabel(item) {
  if (item?.category === "Questions" && parseQuestionContent(item.content)) return "Question";
  const type = item?.content_type || "";
  return type === "latex" ? "LaTeX" : type ? type[0].toUpperCase() + type.slice(1) : "Item";
}

function shouldRenderLatex(state, content) {
  return state?.type === "latex" || /\\(?:frac|sqrt|uparrow|downarrow|times|div|pm|cdot|text|left|right)\b/.test(content);
}

function previewForState(state) {
  if (!state?.type) return <span className="projectorFullLibraryEmptyCell">Empty</span>;
  const content = displayContent(state.content);
  if (state.type === "image") return <img src={content} alt="" />;
  if (state.type === "video") return <span className="projectorFullLibraryVideo">Video</span>;
  if (shouldRenderLatex(state, content)) return <ProjectorLatex content={content} className="projectorFullLibraryLatex" />;
  if (parseQuestionContent(state.content)) return <span>{content || "Question"}</span>;
  return <span>{content || (state.type === "latex" ? "LaTeX" : state.type)}</span>;
}

function previewForItem(item) {
  return previewForState({ type: item.content_type, content: item.content });
}

function searchableContentForState(state) {
  if (!state?.type || state.type === "image" || state.type === "video") return "";
  return displayContent(state.content);
}

function searchableContentForItem(item) {
  if (!item?.content_type || item.content_type === "image" || item.content_type === "video") return "";
  return displayContent(item.content);
}

function sceneFilledCount(scene) {
  return SCREEN_IDS.filter((screenId) => scene?.screen_states?.[screenId]).length;
}

function normalizePlaylistEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        type: entry?.type === "scene" ? "scene" : "item",
        refId: String(entry?.refId || ""),
        durationSeconds: Math.max(Number.parseInt(entry?.durationSeconds, 10) || 60, 5),
      }))
    : [];
}

function playlistEntryLabel(entry, items, scenes) {
  if (entry?.type === "item") return items.find((item) => item.id === entry.refId)?.title || "Saved Item";
  if (entry?.type === "scene") return scenes.find((scene) => scene.id === entry.refId)?.title || "Scene";
  return "Entry";
}

function playlistDurationLabel(entries) {
  const seconds = normalizePlaylistEntries(entries).reduce((total, entry) => total + entry.durationSeconds, 0);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function sceneSearchText(scene, folderTitle) {
  const screenText = SCREEN_IDS.map((screenId) => searchableContentForState(scene?.screen_states?.[screenId])).join(" ");
  return [scene.title, folderTitle, screenText].filter(Boolean).join(" ").toLowerCase();
}

async function fetchSceneLibrary() {
  const response = await fetch("/api/projector?action=scenes", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load scenes.");
  return {
    scenes: Array.isArray(payload.scenes) ? payload.scenes : [],
    folders: Array.isArray(payload.folders) ? payload.folders : [],
  };
}

async function fetchPlaylists() {
  const response = await fetch("/api/projector/playlists", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load playlists.");
  return {
    playlists: Array.isArray(payload.playlists) ? payload.playlists : [],
    setupMissing: Boolean(payload.setupMissing),
  };
}

function openSavedItemInComposer(item) {
  const libraryPanel = document.querySelector('section[aria-label="Saved Projector Items"]');
  const toggle = libraryPanel?.querySelector(".projectorPanelToggle");
  if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
  window.setTimeout(() => {
    const candidates = Array.from(
      document.querySelectorAll('section[aria-label="Saved Projector Items"] .projectorLibraryItem > button:first-child')
    );
    const match = candidates.find((button) => button.querySelector("strong")?.textContent === item.title);
    match?.click();
  }, 40);
}

export default function ProjectorFullLibrary({
  libraryItems = [],
  sceneItems = [],
  sceneFolders = [],
  playlistItems = [],
  playlistsSetupMissing = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [tab, setTab] = useState(libraryItems.length ? "items" : "scenes");
  const [status, setStatus] = useState("");
  const [loadedScenes, setLoadedScenes] = useState(sceneItems);
  const [loadedFolders, setLoadedFolders] = useState(sceneFolders);
  const [loadedPlaylists, setLoadedPlaylists] = useState(playlistItems);
  const [playlistsMissing, setPlaylistsMissing] = useState(playlistsSetupMissing);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [renamingSceneId, setRenamingSceneId] = useState("");
  const [renamingSceneTitle, setRenamingSceneTitle] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(playlistItems[0]?.id || "");
  const [draftName, setDraftName] = useState("");
  const [draftLoop, setDraftLoop] = useState(true);
  const [draftEntries, setDraftEntries] = useState([]);
  const lastSyncedPlaylistId = useRef("");
  const scenes = loadedScenes;
  const folders = loadedFolders;
  const playlists = loadedPlaylists;
  const hasItems = libraryItems.length > 0;
  const hasScenes = scenes.length > 0;
  const hasPlaylists = !playlistsMissing && playlists.length > 0;
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0] || null;

  useEffect(() => {
    if (sceneItems.length) setLoadedScenes(sceneItems);
    if (sceneFolders.length) setLoadedFolders(sceneFolders);
  }, [sceneFolders, sceneItems]);

  useEffect(() => {
    function updateSceneLibrary(event) {
      if (Array.isArray(event.detail?.scenes)) setLoadedScenes(event.detail.scenes);
      if (Array.isArray(event.detail?.folders)) setLoadedFolders(event.detail.folders);
    }

    window.addEventListener("projector:scene-library-updated", updateSceneLibrary);
    return () => window.removeEventListener("projector:scene-library-updated", updateSceneLibrary);
  }, []);

  function broadcastSceneLibrary(nextScenes, nextFolders = folders) {
    window.dispatchEvent(
      new CustomEvent("projector:scene-library-updated", {
        detail: { scenes: nextScenes, folders: nextFolders, source: "projector-full-library" },
      })
    );
  }

  async function renameScene(sceneId, title) {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) {
      setStatus("Enter a name for this scene.");
      return;
    }

    setStatus("Renaming scene...");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-scene", sceneId, title: nextTitle }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not rename that scene.");

      const nextScenes = scenes.map((scene) => (scene.id === sceneId ? payload.scene : scene));
      setLoadedScenes(nextScenes);
      broadcastSceneLibrary(nextScenes);
      setRenamingSceneId("");
      setRenamingSceneTitle("");
      setStatus(`Renamed scene to "${payload.scene.title}".`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteScene(scene) {
    if (!window.confirm(`Delete "${scene.title}"?`)) return;

    setStatus("Deleting scene...");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-scene", sceneId: scene.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not delete that scene.");

      const nextScenes = scenes.filter((item) => item.id !== scene.id);
      setLoadedScenes(nextScenes);
      broadcastSceneLibrary(nextScenes);
      if (renamingSceneId === scene.id) {
        setRenamingSceneId("");
        setRenamingSceneTitle("");
      }
      setStatus(`Deleted "${scene.title}".`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    if (playlistItems.length) setLoadedPlaylists(playlistItems);
    setPlaylistsMissing(playlistsSetupMissing);
  }, [playlistItems, playlistsSetupMissing]);

  useEffect(() => {
    if (!selectedPlaylist || lastSyncedPlaylistId.current === selectedPlaylist.id) return;
    lastSyncedPlaylistId.current = selectedPlaylist.id;
    setSelectedPlaylistId(selectedPlaylist.id);
    setDraftName(selectedPlaylist.name || "");
    setDraftLoop(selectedPlaylist.loop !== false);
    setDraftEntries(normalizePlaylistEntries(selectedPlaylist.entries));
  }, [selectedPlaylist]);

  useEffect(() => {
    if (!open || sceneItems.length || loadedScenes.length || loadingScenes) return undefined;
    let cancelled = false;
    setLoadingScenes(true);
    fetchSceneLibrary()
      .then(({ scenes: nextScenes, folders: nextFolders }) => {
        if (!cancelled) {
          setLoadedScenes(nextScenes);
          setLoadedFolders(nextFolders);
        }
      })
      .catch((error) => {
        if (!cancelled) setStatus(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingScenes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadedScenes.length, loadingScenes, open, sceneItems.length]);

  useEffect(() => {
    if (!open || playlistsMissing || playlistItems.length || loadedPlaylists.length || loadingPlaylists) return undefined;
    let cancelled = false;
    setLoadingPlaylists(true);
    fetchPlaylists()
      .then(({ playlists: nextPlaylists, setupMissing }) => {
        if (!cancelled) {
          setLoadedPlaylists(nextPlaylists);
          setPlaylistsMissing(setupMissing);
        }
      })
      .catch((error) => {
        if (!cancelled) setStatus(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingPlaylists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadedPlaylists.length, loadingPlaylists, open, playlistItems.length, playlistsMissing]);

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const folderCounts = useMemo(() => {
    const counts = new Map();
    scenes.forEach((scene) => {
      const key = scene.folder_id || "unfiled";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [scenes]);

  const filteredItems = useMemo(() => {
    let items = libraryItems;
    if (category) items = items.filter((item) => item.category === category);
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      items = items.filter((item) =>
        [item.title, item.category, itemTypeLabel(item), searchableContentForItem(item)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }
    return items;
  }, [category, libraryItems, search]);

  const filteredScenes = useMemo(() => {
    let nextScenes = scenes;
    if (folderFilter === "unfiled") nextScenes = nextScenes.filter((scene) => !scene.folder_id);
    else if (folderFilter !== "all") nextScenes = nextScenes.filter((scene) => scene.folder_id === folderFilter);
    if (!search.trim()) return nextScenes;
    const query = search.trim().toLowerCase();
    return nextScenes.filter((scene) => sceneSearchText(scene, folderById.get(scene.folder_id)?.title).includes(query));
  }, [folderById, folderFilter, scenes, search]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("projector:full-library-open", { detail: { open } }));
  }, [open]);

  if (!hasItems && !hasScenes && !hasPlaylists && !loadingScenes && !loadingPlaylists && playlistsMissing) return null;

  function updatePlaylists(nextPlaylists) {
    setLoadedPlaylists(nextPlaylists);
    window.dispatchEvent(new CustomEvent("projector:playlists-updated", { detail: { playlists: nextPlaylists } }));
  }

  function newPlaylistDraft() {
    lastSyncedPlaylistId.current = "";
    setSelectedPlaylistId("");
    setDraftName("");
    setDraftLoop(true);
    setDraftEntries([]);
  }

  function editPlaylist(playlist) {
    lastSyncedPlaylistId.current = playlist.id;
    setSelectedPlaylistId(playlist.id);
    setDraftName(playlist.name || "");
    setDraftLoop(playlist.loop !== false);
    setDraftEntries(normalizePlaylistEntries(playlist.entries));
  }

  function addEntry(type, refId) {
    setDraftEntries((current) => [...current, { type, refId, durationSeconds: 60 }]);
  }

  function updateEntry(index, patch) {
    setDraftEntries((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function moveEntry(index, direction) {
    setDraftEntries((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [entry] = next.splice(index, 1);
      next.splice(targetIndex, 0, entry);
      return next;
    });
  }

  function removeEntry(index) {
    setDraftEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function visibleDraftEntries() {
    if (typeof document === "undefined") return null;
    const nodes = Array.from(document.querySelectorAll(".projectorPlaylistEntry"));
    if (!nodes.length) return null;
    const entries = nodes.map((node) => ({
      type: node.dataset.entryType,
      refId: node.dataset.refId,
      durationSeconds: Math.max(Number(node.querySelector('input[type="number"]')?.value) || 60, 5),
    }));
    return entries.every((entry) => entry.type && entry.refId) ? entries : null;
  }

  async function savePlaylist() {
    setStatus("Saving playlist...");
    try {
      const action = selectedPlaylistId ? "update-playlist" : "create-playlist";
      const entriesToSave = visibleDraftEntries() || draftEntries;
      const response = await fetch("/api/projector/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          playlistId: selectedPlaylistId,
          name: draftName,
          loop: draftLoop,
          entries: entriesToSave,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save playlist.");
      const nextPlaylists = [payload.playlist, ...playlists.filter((playlist) => playlist.id !== payload.playlist.id)];
      updatePlaylists(nextPlaylists);
      setSelectedPlaylistId(payload.playlist.id);
      setStatus(`Saved "${payload.playlist.name}".`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deletePlaylist() {
    if (!selectedPlaylistId) return;
    setStatus("Deleting playlist...");
    try {
      const response = await fetch("/api/projector/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-playlist", playlistId: selectedPlaylistId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not delete playlist.");
      const nextPlaylists = playlists.filter((playlist) => playlist.id !== selectedPlaylistId);
      updatePlaylists(nextPlaylists);
      setSelectedPlaylistId(nextPlaylists[0]?.id || "");
      if (!nextPlaylists.length) newPlaylistDraft();
      setStatus("Playlist deleted.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  function playPlaylist(playlist) {
    window.dispatchEvent(new CustomEvent("projector:play-playlist", { detail: { playlist } }));
    setOpen(false);
  }

  async function loadScene(scene) {
    setStatus(`Loading "${scene.title}"...`);
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load-scene", sceneId: scene.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load that scene.");
      window.dispatchEvent(
        new CustomEvent("projector:scene-loaded", {
          detail: {
            scene: { ...scene, title: payload.title || scene.title },
            screenStates: payload.screenStates || scene.screen_states || {},
          },
        })
      );
      setStatus(`Loaded "${payload.title || scene.title}".`);
      setOpen(false);
    } catch (error) {
      setStatus(error.message);
    }
  }

  const visibleCount = tab === "items" ? filteredItems.length : tab === "scenes" ? filteredScenes.length : playlists.length;
  const totalCount = tab === "items" ? libraryItems.length : tab === "scenes" ? scenes.length : playlists.length;
  const sceneCountLabel = loadingScenes && !scenes.length ? "..." : scenes.length;
  const playlistCountLabel = loadingPlaylists && !playlists.length ? "..." : playlists.length;

  return (
    <>
      <button className="projectorFullLibraryLauncher" type="button" onClick={() => setOpen(true)}>
        Open Full Library
      </button>
      {open ? (
        <div
          className="projectorFullLibraryOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="projectorFullLibraryModal" role="dialog" aria-modal="true" aria-labelledby="projector-full-library-title">
            <div className="projectorFullLibraryHeader">
              <div>
                <p className="eyebrow">Projector Library</p>
                <h2 id="projector-full-library-title">Full Library</h2>
                <p>Choose a saved item for the composer or load a full scene to every screen.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="projectorFullLibraryTabs" role="tablist" aria-label="Projector library sections">
              <button data-projector-library-tab="items" className={tab === "items" ? "isActive" : ""} type="button" onClick={() => setTab("items")} disabled={!hasItems}>
                Saved Items <span>{libraryItems.length}</span>
              </button>
              <button data-projector-library-tab="scenes" className={tab === "scenes" ? "isActive" : ""} type="button" onClick={() => setTab("scenes")} disabled={!hasScenes && !loadingScenes}>
                Scenes <span>{sceneCountLabel}</span>
              </button>
              {!playlistsMissing ? (
                <button data-projector-library-tab="playlists" className={tab === "playlists" ? "isActive" : ""} type="button" onClick={() => setTab("playlists")}>
                  Playlists <span>{playlistCountLabel}</span>
                </button>
              ) : null}
            </div>

            {tab !== "playlists" ? (
            <div className="projectorFullLibraryControls">
              <label>
                <span>Search</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved items or scenes..." />
              </label>
              {tab === "items" ? (
                <div className="projectorFullLibraryFilters" aria-label="Activity Type Filters">
                  <button className={category === "" ? "isActive" : ""} type="button" onClick={() => setCategory("")}>All</button>
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <button className={category === cat ? "isActive" : ""} key={cat} type="button" onClick={() => setCategory(category === cat ? "" : cat)}>{cat}</button>
                  ))}
                </div>
              ) : (
                <div className="projectorFullLibraryFilters" aria-label="Scene Folder Filters">
                  <button className={folderFilter === "all" ? "isActive" : ""} type="button" onClick={() => setFolderFilter("all")}>
                    All <span>{scenes.length}</span>
                  </button>
                  {folders.map((folder) => (
                    <button className={folderFilter === folder.id ? "isActive" : ""} key={folder.id} type="button" onClick={() => setFolderFilter(folder.id)}>
                      {folder.title} <span>{folderCounts.get(folder.id) || 0}</span>
                    </button>
                  ))}
                  {(folderCounts.get("unfiled") || 0) > 0 ? (
                    <button className={folderFilter === "unfiled" ? "isActive" : ""} type="button" onClick={() => setFolderFilter("unfiled")}>
                      Unfiled <span>{folderCounts.get("unfiled")}</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            ) : null}

            <p className="projectorFullLibrarySummary">
              {loadingScenes && tab === "scenes" && !scenes.length
                ? "Loading scenes..."
                : loadingPlaylists && tab === "playlists" && !playlists.length
                  ? "Loading playlists..."
                  : `Showing ${visibleCount} of ${totalCount} ${tab === "items" ? "saved items" : tab === "scenes" ? "scenes" : "playlists"}`}
            </p>
            {status ? <p className="projectorFullLibraryStatus">{status}</p> : null}

            {tab === "items" ? (
              <div className="projectorFullLibraryGrid">
                {filteredItems.length ? filteredItems.map((item) => (
                  <article className="projectorFullLibraryCard" key={item.id}>
                    <button type="button" onClick={() => { openSavedItemInComposer(item); setOpen(false); }}>
                      <div className="projectorFullLibraryThumb">{previewForItem(item)}</div>
                      <strong>{item.title}</strong>
                      <em>{item.category ? `${item.category} · ` : ""}{itemTypeLabel(item)}</em>
                    </button>
                  </article>
                )) : <p className="projectorFullLibraryEmpty">No saved items match your search.</p>}
              </div>
            ) : tab === "scenes" ? (
              <div className="projectorFullLibraryGrid">
                {filteredScenes.length ? filteredScenes.map((scene) => {
                  const folderTitle = folderById.get(scene.folder_id)?.title || "Unfiled";
                  const isRenaming = renamingSceneId === scene.id;
                  return (
                    <article className="projectorFullLibraryCard" key={scene.id}>
                      <button type="button" onClick={() => loadScene(scene)}>
                        <div className="projectorFullLibrarySceneThumb" aria-hidden="true">
                          {SCREEN_IDS.map((screenId) => (
                            <div key={screenId}>{previewForState(scene.screen_states?.[screenId])}</div>
                          ))}
                        </div>
                        <strong>{scene.title}</strong>
                        <em>{folderTitle} · {sceneFilledCount(scene)} of 4 screens filled</em>
                      </button>
                      {isRenaming ? (
                        <form
                          className="projectorFullLibraryRenameForm"
                          onSubmit={(event) => {
                            event.preventDefault();
                            renameScene(scene.id, renamingSceneTitle);
                          }}
                        >
                          <label>
                            <span>Scene name</span>
                            <input
                              value={renamingSceneTitle}
                              onChange={(event) => setRenamingSceneTitle(event.target.value)}
                              maxLength={80}
                              autoFocus
                            />
                          </label>
                          <div className="projectorFullLibraryCardActions">
                            <button type="submit" disabled={!renamingSceneTitle.trim()}>Save</button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingSceneId("");
                                setRenamingSceneTitle("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="projectorFullLibraryCardActions">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSceneId(scene.id);
                              setRenamingSceneTitle(scene.title || "");
                            }}
                          >
                            Rename
                          </button>
                          <button
                            className="projectorFullLibraryDelete"
                            type="button"
                            onClick={() => deleteScene(scene)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  );
                }) : (
                  <p className="projectorFullLibraryEmpty">{loadingScenes ? "Loading scenes..." : "No scenes match this folder and search."}</p>
                )}
              </div>
            ) : (
              <div className="projectorPlaylistBuilder">
                <aside className="projectorPlaylistList">
                  <button className={!selectedPlaylistId ? "isActive" : ""} type="button" onClick={newPlaylistDraft}>
                    <strong>New Playlist</strong>
                    <span>Build a timed rotation</span>
                  </button>
                  {playlists.map((playlist) => (
                    <button className={playlist.id === selectedPlaylistId ? "isActive" : ""} key={playlist.id} type="button" onClick={() => editPlaylist(playlist)}>
                      <strong>{playlist.name}</strong>
                      <span>{normalizePlaylistEntries(playlist.entries).length} entries · {playlistDurationLabel(playlist.entries)}{playlist.loop !== false ? " · loop" : ""}</span>
                    </button>
                  ))}
                </aside>

                <section className="projectorPlaylistEditor" aria-label="Playlist builder">
                  <div className="projectorPlaylistEditorHeader">
                    <label>
                      <span>Name</span>
                      <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} placeholder="Warmup loop, station rotation..." />
                    </label>
                    <label className="projectorPlaylistLoopToggle">
                      <input type="checkbox" checked={draftLoop} onChange={(event) => setDraftLoop(event.target.checked)} />
                      <span>Loop</span>
                    </label>
                    <div className="projectorPlaylistEditorActions">
                      <button type="button" onClick={savePlaylist} disabled={!draftName.trim()}>
                        Save
                      </button>
                      <button type="button" onClick={() => selectedPlaylist ? playPlaylist(selectedPlaylist) : null} disabled={!selectedPlaylist || !normalizePlaylistEntries(selectedPlaylist.entries).length}>
                        Play
                      </button>
                      <button type="button" onClick={deletePlaylist} disabled={!selectedPlaylistId}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="projectorPlaylistEntryList">
                    {draftEntries.length ? draftEntries.map((entry, index) => (
                      <article
                        className="projectorPlaylistEntry"
                        data-entry-type={entry.type}
                        data-ref-id={entry.refId}
                        key={`${entry.type}-${entry.refId}-${index}`}
                      >
                        <span className="projectorPlaylistEntryThumb" aria-hidden="true">
                          {entry.type === "item"
                            ? previewForItem(libraryItems.find((item) => item.id === entry.refId) || {})
                            : previewForState(scenes.find((scene) => scene.id === entry.refId)?.screen_states?.["1"])}
                        </span>
                        <div>
                          <strong>{playlistEntryLabel(entry, libraryItems, scenes)}</strong>
                          <em>{entry.type === "item" ? "Saved Item" : "Scene"}</em>
                        </div>
                        <label>
                          <span>Seconds</span>
                          <input
                            type="number"
                            min="5"
                            max="3600"
                            value={entry.durationSeconds}
                            onChange={(event) => updateEntry(index, { durationSeconds: Math.max(Number(event.target.value) || 60, 5) })}
                          />
                        </label>
                        <div className="projectorPlaylistEntryActions">
                          <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0}>Up</button>
                          <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === draftEntries.length - 1}>Down</button>
                          <button type="button" onClick={() => removeEntry(index)}>Remove</button>
                        </div>
                      </article>
                    )) : (
                      <p className="projectorFullLibraryEmpty">Pick saved items or scenes below to build this playlist.</p>
                    )}
                  </div>

                  <div className="projectorPlaylistPickers">
                    <section>
                      <h3>Saved Items</h3>
                      <div className="projectorPlaylistPickerGrid">
                        {libraryItems.map((item) => (
                          <button key={item.id} type="button" onClick={() => addEntry("item", item.id)}>
                            <span>{previewForItem(item)}</span>
                            <strong>{item.title}</strong>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section>
                      <h3>Scenes</h3>
                      <div className="projectorPlaylistPickerGrid">
                        {scenes.map((scene) => (
                          <button key={scene.id} type="button" onClick={() => addEntry("scene", scene.id)}>
                            <span>{previewForState(scene.screen_states?.["1"])}</span>
                            <strong>{scene.title}</strong>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      ) : null}
      <style>{`
        .projectorFullLibraryLauncher {
          position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 20;
          border: 2px solid var(--navy); border-radius: 999px; background: var(--navy); color: #fff;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2); padding: 0.65rem 0.9rem;
          font: inherit; font-size: 0.9rem; font-weight: 900; cursor: pointer;
        }
        .projectorFullLibraryOverlay {
          position: fixed; inset: 0; z-index: 40; display: grid; place-items: center;
          background: rgba(8, 18, 28, 0.58); padding: clamp(0.75rem, 2vw, 2rem);
        }
        .projectorFullLibraryModal {
          width: min(92rem, 100%); max-height: min(54rem, calc(100dvh - 2rem));
          display: grid; grid-template-rows: auto auto auto auto auto minmax(0, 1fr); gap: 0.8rem; overflow: hidden;
          border: 2px solid var(--navy); border-radius: 16px; background: #f7fafc;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32); padding: clamp(1rem, 2vw, 1.4rem);
        }
        .projectorFullLibraryHeader { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
        .projectorFullLibraryHeader h2, .projectorFullLibraryHeader p { margin: 0; }
        .projectorFullLibraryHeader p:not(.eyebrow) { margin-top: 0.25rem; }
        .projectorFullLibraryHeader p:not(.eyebrow), .projectorFullLibrarySummary, .projectorFullLibraryStatus { color: #51606d; font-weight: 800; }
        .projectorFullLibraryHeader button, .projectorFullLibraryFilters button, .projectorFullLibraryTabs button {
          border: 2px solid var(--line); border-radius: 999px; background: #fff; color: var(--navy);
          padding: 0.45rem 0.75rem; font: inherit; font-size: 0.84rem; font-weight: 900; cursor: pointer;
        }
        .projectorFullLibraryTabs, .projectorFullLibraryFilters { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .projectorFullLibraryTabs button, .projectorFullLibraryFilters button { display: inline-flex; align-items: center; gap: 0.35rem; }
        .projectorFullLibraryTabs button span, .projectorFullLibraryFilters button span {
          min-width: 1.35rem; border-radius: 999px; background: rgba(147, 165, 180, 0.18);
          padding: 0.04rem 0.32rem; text-align: center; font-size: 0.72rem;
        }
        .projectorFullLibraryTabs button.isActive, .projectorFullLibraryFilters button.isActive { border-color: var(--navy); background: var(--navy); color: #fff; }
        .projectorFullLibraryTabs button:disabled { cursor: not-allowed; opacity: 0.45; }
        .projectorFullLibraryControls { display: grid; grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr); gap: 0.75rem; align-items: end; }
        .projectorFullLibraryControls label { display: grid; gap: 0.35rem; color: var(--navy); font-weight: 800; }
        .projectorFullLibraryControls input {
          width: 100%; border: 2px solid #93a5b4; border-radius: 8px; padding: 0.6rem 0.7rem;
          font: inherit; background: #fff; color: var(--ink);
        }
        .projectorFullLibrarySummary, .projectorFullLibraryStatus { margin: 0; font-size: 0.85rem; font-weight: 900; }
        .projectorFullLibraryStatus { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; color: var(--navy); padding: 0.55rem 0.7rem; }
        .projectorFullLibraryGrid {
          min-height: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
          gap: 0.75rem; overflow: auto; padding-right: 0.2rem;
        }
        .projectorFullLibraryCard { border: 2px solid var(--line); border-radius: 12px; background: #fff; padding: 0.55rem; }
        .projectorFullLibraryCard > button:first-child {
          width: 100%; display: grid; gap: 0.45rem; border: 0; background: transparent; color: var(--ink);
          padding: 0; text-align: left; font: inherit; cursor: pointer;
        }
        .projectorFullLibraryCardActions {
          display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.55rem;
        }
        .projectorFullLibraryCardActions button {
          border: 2px solid var(--line); border-radius: 8px; background: #f5f8fb; color: var(--ink);
          padding: 0.35rem 0.55rem; font: inherit; font-size: 0.8rem; font-weight: 900; cursor: pointer;
        }
        .projectorFullLibraryCardActions button.projectorFullLibraryDelete {
          border-color: #d6b3b3; background: #fff6f6; color: #7c1f1f;
        }
        .projectorFullLibraryRenameForm {
          display: grid; gap: 0.45rem; margin-top: 0.55rem; border: 2px solid var(--line);
          border-radius: 8px; background: #f5f8fb; padding: 0.55rem;
        }
        .projectorFullLibraryRenameForm label {
          display: grid; gap: 0.25rem; color: var(--navy); font-size: 0.76rem; font-weight: 900;
        }
        .projectorFullLibraryRenameForm input {
          width: 100%; border: 2px solid #c8d6df; border-radius: 8px; background: #fff;
          color: var(--ink); padding: 0.45rem 0.55rem; font: inherit; font-weight: 800;
        }
        .projectorFullLibraryCard strong, .projectorFullLibraryCard em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .projectorFullLibraryCard strong { color: var(--navy); font-size: 1.05rem; }
        .projectorFullLibraryCard em { color: #51606d; font-size: 0.78rem; font-style: normal; font-weight: 800; }
        .projectorFullLibraryThumb, .projectorFullLibrarySceneThumb {
          aspect-ratio: 16 / 9; display: grid; overflow: hidden; border-radius: 10px; background: #0a0a0a; color: #fff;
          text-align: center; font-weight: 900; overflow-wrap: anywhere; white-space: pre-wrap;
        }
        .projectorFullLibraryThumb { place-items: center; padding: 0.5rem; }
        .projectorFullLibrarySceneThumb { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 2px; padding: 2px; }
        .projectorFullLibrarySceneThumb > div {
          min-width: 0; min-height: 0; display: grid; place-items: center; overflow: hidden;
          background: #111; padding: 0.18rem; font-size: 0.74rem;
        }
        .projectorFullLibraryLatex { width: 100%; display: grid; place-items: center; color: #fff; line-height: 1.1; }
        .projectorFullLibraryLatex .katex-display { margin: 0.05rem 0; }
        .projectorFullLibraryLatex .katex { color: #fff; font-size: clamp(0.8rem, 1.6vw, 1.18rem); }
        .projectorFullLibraryThumb img, .projectorFullLibrarySceneThumb img { width: 100%; height: 100%; object-fit: contain; }
        .projectorFullLibraryVideo {
          display: grid; place-items: center; width: 100%; height: 100%; border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px; background: #17212b; text-transform: uppercase;
        }
        .projectorFullLibraryEmptyCell { color: #5d646b; font-size: 0.65rem; font-weight: 900; text-transform: uppercase; }
        .projectorFullLibraryEmpty {
          grid-column: 1 / -1; margin: 0; border: 2px dashed #c8d6df; border-radius: 8px;
          background: #fff; color: #51606d; padding: 0.75rem; font-weight: 800; text-align: center;
        }
        .projectorPlaylistBuilder {
          min-height: 0; display: grid; grid-template-columns: minmax(14rem, 20rem) minmax(0, 1fr);
          gap: 0.9rem; overflow: hidden;
        }
        .projectorPlaylistList, .projectorPlaylistEditor, .projectorPlaylistEntryList, .projectorPlaylistPickers, .projectorPlaylistPickerGrid {
          min-width: 0; display: grid; gap: 0.65rem;
        }
        .projectorPlaylistList { align-content: start; overflow: auto; }
        .projectorPlaylistList button, .projectorPlaylistEditorActions button, .projectorPlaylistEntryActions button, .projectorPlaylistPickerGrid button {
          border: 2px solid var(--line); border-radius: 8px; background: #fff; color: var(--navy);
          padding: 0.5rem 0.65rem; font: inherit; font-size: 0.82rem; font-weight: 900; cursor: pointer;
        }
        .projectorPlaylistList button { text-align: left; }
        .projectorPlaylistList button.isActive { border-color: var(--navy); background: var(--navy); color: #fff; }
        .projectorPlaylistList strong, .projectorPlaylistList span, .projectorPlaylistPickerGrid strong {
          display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .projectorPlaylistList span { opacity: 0.82; font-size: 0.76rem; }
        .projectorPlaylistEditor { min-height: 0; overflow: auto; }
        .projectorPlaylistEditorHeader {
          display: grid; grid-template-columns: minmax(12rem, 1fr) auto auto; gap: 0.65rem; align-items: end;
          border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.7rem;
        }
        .projectorPlaylistEditorHeader label, .projectorPlaylistEntry label {
          display: grid; gap: 0.25rem; color: var(--navy); font-size: 0.78rem; font-weight: 900;
        }
        .projectorPlaylistEditorHeader input, .projectorPlaylistEntry input {
          border: 2px solid #93a5b4; border-radius: 8px; background: #fff; color: var(--ink);
          padding: 0.5rem 0.65rem; font: inherit; font-weight: 800;
        }
        .projectorPlaylistLoopToggle { align-items: center; grid-auto-flow: column; }
        .projectorPlaylistEditorActions, .projectorPlaylistEntryActions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .projectorPlaylistEntry {
          display: grid; grid-template-columns: 5rem minmax(0, 1fr) 6rem auto; gap: 0.65rem; align-items: center;
          border: 2px solid var(--line); border-radius: 8px; background: #fff; padding: 0.55rem;
        }
        .projectorPlaylistEntryThumb, .projectorPlaylistPickerGrid span {
          aspect-ratio: 16 / 9; display: grid; place-items: center; overflow: hidden; border-radius: 6px;
          background: #111; color: #fff; padding: 0.25rem; text-align: center; font-size: 0.7rem; font-weight: 900;
        }
        .projectorPlaylistEntryThumb img, .projectorPlaylistPickerGrid img { width: 100%; height: 100%; object-fit: contain; }
        .projectorPlaylistEntry strong, .projectorPlaylistEntry em {
          display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .projectorPlaylistEntry strong { color: var(--navy); }
        .projectorPlaylistEntry em { color: #51606d; font-size: 0.74rem; font-style: normal; font-weight: 800; }
        .projectorPlaylistPickers { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
        .projectorPlaylistPickers h3 { margin: 0; color: var(--navy); }
        .projectorPlaylistPickerGrid {
          grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); max-height: 18rem; overflow: auto;
        }
        .projectorPlaylistPickerGrid button { display: grid; gap: 0.35rem; text-align: left; }
        @media (max-width: 720px) {
          .projectorFullLibraryLauncher { right: 0.75rem; bottom: 0.75rem; }
          .projectorFullLibraryControls { grid-template-columns: 1fr; }
          .projectorPlaylistBuilder, .projectorPlaylistEditorHeader, .projectorPlaylistPickers, .projectorPlaylistEntry {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
