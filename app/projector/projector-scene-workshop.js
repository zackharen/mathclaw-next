"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const DIRECT_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;
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

function renderLatex(element, content) {
  if (!element) return;
  if (!window.katex) {
    element.textContent = content || "";
    return;
  }
  try {
    window.katex.render(String(content || ""), element, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    element.textContent = content || "";
  }
}

function ProjectorWorkshopLatex({ content }) {
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

  return <span ref={ref} className="projectorWorkshopLatex" />;
}

function normalizeSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return Array.from({ length: 4 }, () => ({ enabled: true }));
  return slots.slice(0, 12).map((slot) => ({ ...slot, enabled: slot?.enabled !== false }));
}

function defaultSlot() {
  return { type: "text", content: "" };
}

function makeSceneRow(slotCount = 4) {
  return {
    id: crypto.randomUUID(),
    editingSceneId: "",
    title: "",
    folderId: "__batch__",
    saveAsNew: false,
    saved: false,
    status: "",
    slots: Array.from({ length: Math.max(1, Math.min(12, slotCount)) }, () => defaultSlot()),
  };
}

function stateFromLibraryItem(item) {
  return {
    type: item.content_type,
    content: item.content,
    sourceLabel: item.title || "Saved Item",
  };
}

function stateFromPoolItem(item) {
  return {
    type: item.type,
    content: item.content,
    sourceLabel: item.title || "Upload",
  };
}

function slotFromSceneState(state) {
  if (!state?.type) return defaultSlot();
  return {
    type: state.type,
    content: state.content || "",
    sourceLabel: "",
  };
}

function isFilledSlot(slot) {
  return Boolean(slot?.type && String(slot?.content || "").trim());
}

function previewLabel(slot) {
  if (!isFilledSlot(slot)) return "Empty";
  if (slot.sourceLabel) return slot.sourceLabel;
  if (slot.type === "latex") return "LaTeX";
  if (slot.type === "image") return "Image";
  if (slot.type === "video") return /\.gif(\?|#|$)/i.test(slot.content || "") ? "GIF" : "Video";
  return "Text";
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text().catch(() => "");
  const cleanText = text.replace(/\s+/g, " ").trim();
  return { error: cleanText ? `${fallbackMessage} ${cleanText.slice(0, 120)}` : fallbackMessage };
}

function scenePayload(row, batchFolderId) {
  const screenIds = row.slots.map((_, index) => String(index + 1));
  return {
    title: row.title,
    folderId: row.folderId === "__batch__" ? batchFolderId : row.folderId,
    screenIds,
    screenStates: row.slots.reduce((states, slot, index) => {
      states[String(index + 1)] = isFilledSlot(slot) ? { type: slot.type, content: slot.content } : null;
      return states;
    }, {}),
  };
}

function sceneRowFromExisting(scene, defaultSlotCount = 4) {
  const states = scene?.screen_states && typeof scene.screen_states === "object" ? scene.screen_states : {};
  const filledIds = Object.keys(states)
    .filter((screenId) => states[screenId]?.type)
    .sort((left, right) => Number(left) - Number(right));
  const slotCount = Math.max(
    1,
    Math.min(12, filledIds.length ? Number(filledIds[filledIds.length - 1]) : defaultSlotCount)
  );
  return {
    id: crypto.randomUUID(),
    editingSceneId: scene.id,
    title: scene.title || "Saved room setup",
    folderId: scene.folder_id || "",
    saveAsNew: false,
    saved: false,
    status: "Editing existing scene",
    slots: Array.from({ length: slotCount }, (_, index) => slotFromSceneState(states[String(index + 1)])),
  };
}

function renderMiniPreview(slot) {
  if (!isFilledSlot(slot)) return <span className="projectorWorkshopEmpty">Empty</span>;
  if (slot.type === "image") return <img src={slot.content} alt="" />;
  if (slot.type === "video") {
    if (/\.gif(\?|#|$)/i.test(slot.content || "")) return <img src={slot.content} alt="" />;
    return <span className="projectorWorkshopVideo">Video</span>;
  }
  if (slot.type === "latex") return <ProjectorWorkshopLatex content={slot.content} />;
  return <span>{slot.content}</span>;
}

export default function ProjectorSceneWorkshop({
  activeRoom = null,
  folders = [],
  libraryItems = [],
  sceneItems = [],
  onFoldersChanged,
  onScenesSaved,
  onSceneUpdated,
}) {
  const activeRoomSlots = normalizeSlots(activeRoom?.slots);
  const defaultSlotCount = Math.max(1, activeRoomSlots.filter((slot) => slot.enabled !== false).length || activeRoomSlots.length || 4);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => [makeSceneRow(defaultSlotCount)]);
  const [poolItems, setPoolItems] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [sceneSearch, setSceneSearch] = useState("");
  const [batchFolderId, setBatchFolderId] = useState("");
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setRows((current) => current.length ? current : [makeSceneRow(defaultSlotCount)]);
  }, [defaultSlotCount, open]);

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    const source = libraryItems || [];
    if (!query) return source.slice(0, 40);
    return source
      .filter((item) => String(item.title || "").toLowerCase().includes(query))
      .slice(0, 40);
  }, [libraryItems, librarySearch]);

  const filteredScenes = useMemo(() => {
    const query = sceneSearch.trim().toLowerCase();
    const source = sceneItems || [];
    if (!query) return source.slice(0, 40);
    return source
      .filter((scene) => String(scene.title || "").toLowerCase().includes(query))
      .slice(0, 40);
  }, [sceneItems, sceneSearch]);

  function updateRow(rowId, updater, options = {}) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        const next = typeof updater === "function" ? updater(row) : { ...row, ...updater };
        return options.preserveSaved ? next : { ...next, saved: false, status: "" };
      })
    );
  }

  function updateSlot(rowId, slotIndex, nextSlot) {
    updateRow(rowId, (row) => ({
      ...row,
      slots: row.slots.map((slot, index) => (index === slotIndex ? { ...slot, ...nextSlot } : slot)),
    }));
  }

  function addScene() {
    setRows((current) => [...current, makeSceneRow(defaultSlotCount)]);
  }

  function editExistingScene(scene) {
    setRows((current) => [sceneRowFromExisting(scene, defaultSlotCount), ...current]);
    setStatus(`Opened "${scene.title}" for Workshop editing.`);
  }

  function setSlotCount(rowId, nextCount) {
    updateRow(rowId, (row) => {
      const safeCount = Math.max(1, Math.min(12, nextCount));
      const nextSlots = row.slots.slice(0, safeCount);
      while (nextSlots.length < safeCount) nextSlots.push(defaultSlot());
      return { ...row, slots: nextSlots };
    });
  }

  function placeSelectedAsset(rowId, slotIndex) {
    if (!selectedAsset) {
      setStatus("Pick an upload or saved item first.");
      return;
    }
    updateSlot(
      rowId,
      slotIndex,
      selectedAsset.kind === "library"
        ? stateFromLibraryItem(selectedAsset.item)
        : stateFromPoolItem(selectedAsset.item)
    );
  }

  function readImageFile(file) {
    if (!file.type?.startsWith("image/")) {
      setStatus(`${file.name} is not an image.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus(`${file.name} is too large for an image slot. Use an image under 5MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const item = {
        id: crypto.randomUUID(),
        title: file.name || "Image upload",
        type: "image",
        content: String(reader.result || ""),
      };
      setPoolItems((current) => [item, ...current]);
      setSelectedAsset({ kind: "pool", item });
      setStatus(`Added ${file.name} to the Workshop pool.`);
    };
    reader.readAsDataURL(file);
  }

  async function uploadVideoFile(file) {
    if (file.size > MAX_VIDEO_BYTES) {
      setStatus("Choose a screen recording under 75MB.");
      return;
    }
    setUploading(true);
    setStatus("Uploading video...");
    try {
      let url = "";
      if (file.size <= DIRECT_VIDEO_UPLOAD_BYTES) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/projector/upload-video", { method: "POST", body: formData });
        const payload = await readJsonResponse(response, "Could not upload the recording.");
        if (!response.ok) throw new Error(payload.error || "Could not upload the recording.");
        url = payload.url;
      } else {
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
        if (!prepareResponse.ok) throw new Error(preparePayload.error || "Could not prepare the recording upload.");

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(preparePayload.bucket)
          .uploadToSignedUrl(preparePayload.path, preparePayload.token, file, {
            contentType: file.type || "video/quicktime",
          });
        if (uploadError) throw new Error(uploadError.message);

        const convertResponse = await fetch("/api/projector/upload-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "convert", path: preparePayload.path }),
        });
        const convertPayload = await readJsonResponse(convertResponse, "Could not convert the recording.");
        if (!convertResponse.ok) throw new Error(convertPayload.error || "Could not convert the recording.");
        url = convertPayload.url;
      }

      const item = { id: crypto.randomUUID(), title: file.name || "Video upload", type: "video", content: url };
      setPoolItems((current) => [item, ...current]);
      setSelectedAsset({ kind: "pool", item });
      setStatus(`Added ${file.name} to the Workshop pool.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function onFilesChosen(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    for (const file of files) {
      if (file.type?.startsWith("video/")) {
        await uploadVideoFile(file);
      } else {
        readImageFile(file);
      }
    }
  }

  async function createFolder() {
    const title = newFolderTitle.trim();
    if (!title) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-scene-folder", title }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create that folder.");
      const nextFolders = [payload.folder, ...folders.filter((folder) => folder.id !== payload.folder.id)];
      onFoldersChanged?.(nextFolders);
      setBatchFolderId(payload.folder.id);
      setNewFolderTitle("");
      setStatus(`Created folder "${payload.folder.title}".`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function validateRows(rowsToSave) {
    for (const row of rowsToSave) {
      const hasContent = row.slots.some(isFilledSlot);
      if (hasContent && !row.title.trim()) return `Name "${row.slots.map(previewLabel).join(", ")}" before saving.`;
    }
    return "";
  }

  async function persistRow(row, batchFolderId) {
    const payload = scenePayload(row, batchFolderId);
    const isUpdate = row.editingSceneId && !row.saveAsNew;
    const response = await fetch("/api/projector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isUpdate
          ? { action: "update-scene", sceneId: row.editingSceneId, ...payload }
          : { action: "save-workshop-scene", ...payload }
      ),
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responsePayload.error || "Could not save that scene.");
    return { scene: responsePayload.scene, isUpdate };
  }

  async function saveRow(rowId) {
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    if (!row.slots.some(isFilledSlot)) {
      setStatus("Add content to at least one slot before saving.");
      return;
    }
    const validationError = validateRows([row]);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const { scene, isUpdate } = await persistRow(row, batchFolderId);
      if (isUpdate) {
        onSceneUpdated?.(scene);
      } else {
        onScenesSaved?.([scene]);
      }
      updateRow(rowId, { ...row, saved: true, status: isUpdate ? "Updated" : "Saved" }, { preserveSaved: true });
      setStatus(`${isUpdate ? "Updated" : "Saved"} "${scene.title}".`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const rowsToSave = rows.filter((row) => !row.saved && row.slots.some(isFilledSlot));
    if (!rowsToSave.length) {
      setStatus("Add at least one unsaved scene with content.");
      return;
    }
    const validationError = validateRows(rowsToSave);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const createdScenes = [];
      const updatedScenes = [];
      for (const row of rowsToSave) {
        const { scene, isUpdate } = await persistRow(row, batchFolderId);
        if (isUpdate) updatedScenes.push(scene);
        else createdScenes.push(scene);
      }
      if (createdScenes.length) onScenesSaved?.(createdScenes);
      updatedScenes.forEach((scene) => onSceneUpdated?.(scene));
      const savedIds = new Set(rowsToSave.map((row) => row.id));
      setRows((current) =>
        current.map((row) => (savedIds.has(row.id) ? { ...row, saved: true, status: row.editingSceneId && !row.saveAsNew ? "Updated" : "Saved" } : row))
      );
      setStatus(`Saved ${createdScenes.length} new scenes and updated ${updatedScenes.length} scenes.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  const launcher = (
    <section className="projectorLibrary projectorWorkshopLauncher" aria-label="Projector Scene Workshop">
      <button className="projectorLibraryHeader projectorPanelToggle" type="button" onClick={() => setOpen(true)}>
        <div className="projectorPlaylistsLauncherSummary">
          <h2>Scene Workshop</h2>
          <p className="projectorRoomsActive">Build scenes off live</p>
        </div>
      </button>
    </section>
  );

  if (!open) return launcher;

  return (
    <>
      {launcher}
      <div className="projectorWorkshopOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section className="projectorWorkshopModal" role="dialog" aria-modal="true" aria-labelledby="projector-workshop-title">
          <header className="projectorWorkshopHeader">
            <div>
              <p className="eyebrow">Quick Setup Mode</p>
              <h2 id="projector-workshop-title">Scene Workshop</h2>
              <p>Compose saved scenes without changing the live projector screens.</p>
            </div>
            <div className="projectorWorkshopHeaderActions">
              <button className="btn secondary" type="button" onClick={addScene}>+ Add Scene</button>
              <button className="btn" type="button" onClick={saveAll} disabled={saving}>Save All</button>
              <button className="projectorAssignmentClose" type="button" onClick={() => setOpen(false)} disabled={saving}>Close</button>
            </div>
          </header>

          <div className="projectorWorkshopDefaults">
            <label className="field">
              <span>Batch Folder</span>
              <select value={batchFolderId} onChange={(event) => setBatchFolderId(event.target.value)}>
                <option value="">Uncategorized</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
              </select>
            </label>
            <div className="projectorSceneSaveFolderCreator">
              <label className="field">
                <span>New Folder</span>
                <input value={newFolderTitle} onChange={(event) => setNewFolderTitle(event.target.value)} maxLength={60} placeholder="Warmups, Week 3..." />
              </label>
              <button className="btn secondary" type="button" onClick={createFolder} disabled={saving || !newFolderTitle.trim()}>Add Folder</button>
            </div>
            {status ? <p className="projectorWorkshopStatus">{status}</p> : null}
          </div>

          <div className="projectorWorkshopBody">
            <aside className="projectorWorkshopPool">
              <label className="field">
                <span>Edit Existing Scene</span>
                <input value={sceneSearch} onChange={(event) => setSceneSearch(event.target.value)} placeholder="Search saved scenes..." />
              </label>
              <div className="projectorWorkshopPoolList">
                {filteredScenes.length ? filteredScenes.map((scene) => (
                  <button key={scene.id} type="button" onClick={() => editExistingScene(scene)}>
                    <span className="projectorWorkshopAssetThumb">
                      {renderMiniPreview(slotFromSceneState(scene.screen_states?.["1"]))}
                    </span>
                    <strong>{scene.title}</strong>
                    <em>Open in Workshop</em>
                  </button>
                )) : <p className="projectorWorkshopEmptyNote">No saved scenes match that search.</p>}
              </div>

              <div className="projectorWorkshopPoolHeader">
                <strong>Upload Pool</strong>
                <button className="btn secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading..." : "Add Files"}
                </button>
                <input ref={fileInputRef} hidden multiple accept="image/*,video/*,.mov,.m4v,.webm" type="file" onChange={onFilesChosen} />
              </div>
              <div className="projectorWorkshopPoolList">
                {poolItems.length ? poolItems.map((item) => (
                  <button
                    className={selectedAsset?.kind === "pool" && selectedAsset.item.id === item.id ? "isActive" : ""}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAsset({ kind: "pool", item })}
                  >
                    <span className="projectorWorkshopAssetThumb">{renderMiniPreview(item)}</span>
                    <strong>{item.title}</strong>
                    <em>{item.type === "image" ? "Image" : "Video"}</em>
                  </button>
                )) : <p className="projectorWorkshopEmptyNote">Uploaded files will appear here.</p>}
              </div>

              <label className="field">
                <span>Saved Items</span>
                <input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search saved items..." />
              </label>
              <div className="projectorWorkshopPoolList">
                {filteredLibrary.length ? filteredLibrary.map((item) => (
                  <button
                    className={selectedAsset?.kind === "library" && selectedAsset.item.id === item.id ? "isActive" : ""}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAsset({ kind: "library", item })}
                  >
                    <span className="projectorWorkshopAssetThumb">{renderMiniPreview(stateFromLibraryItem(item))}</span>
                    <strong>{item.title}</strong>
                    <em>{item.content_type === "latex" ? "LaTeX" : item.content_type}</em>
                  </button>
                )) : <p className="projectorWorkshopEmptyNote">No saved items match that search.</p>}
              </div>
            </aside>

            <main className="projectorWorkshopScenes">
              {rows.map((row, rowIndex) => (
                <article className={`projectorWorkshopRow${row.saved ? " isSaved" : ""}`} key={row.id}>
                  <div className="projectorWorkshopRowHeader">
                    <strong>Scene {rowIndex + 1}</strong>
                    {row.editingSceneId && !row.saveAsNew ? (
                      <span className="projectorWorkshopEditTag">Editing existing</span>
                    ) : null}
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={row.title}
                        onChange={(event) => updateRow(row.id, { title: event.target.value })}
                        maxLength={80}
                        placeholder="Warmup, Exit Ticket..."
                        disabled={Boolean(row.editingSceneId && !row.saveAsNew)}
                      />
                    </label>
                    <label className="field">
                      <span>Folder</span>
                      <select
                        value={row.folderId}
                        onChange={(event) => updateRow(row.id, { folderId: event.target.value })}
                        disabled={Boolean(row.editingSceneId && !row.saveAsNew)}
                      >
                        <option value="__batch__">Use batch folder</option>
                        <option value="">Uncategorized</option>
                        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
                      </select>
                    </label>
                    <div className="projectorWorkshopSlotControls">
                      <button type="button" onClick={() => setSlotCount(row.id, row.slots.length - 1)} disabled={row.slots.length <= 1}>-</button>
                      <span>{row.slots.length} slots</span>
                      <button type="button" onClick={() => setSlotCount(row.id, row.slots.length + 1)} disabled={row.slots.length >= 12}>+</button>
                    </div>
                    <button className="btn secondary" type="button" onClick={() => saveRow(row.id)} disabled={saving || row.saved}>
                      {row.saved ? row.status || "Saved" : row.editingSceneId && !row.saveAsNew ? "Update" : "Save"}
                    </button>
                    {row.editingSceneId && !row.saveAsNew ? (
                      <button className="btn secondary" type="button" onClick={() => updateRow(row.id, { saveAsNew: true, saved: false, status: "" })} disabled={saving}>
                        Save as new instead
                      </button>
                    ) : null}
                  </div>

                  <div className="projectorWorkshopSlots">
                    {row.slots.map((slot, slotIndex) => (
                      <section className="projectorWorkshopSlot" key={`${row.id}-${slotIndex}`}>
                        <div className="projectorWorkshopSlotTop">
                          <strong>Screen {slotIndex + 1}</strong>
                          <select value={slot.type} onChange={(event) => updateSlot(row.id, slotIndex, { type: event.target.value, content: "", sourceLabel: "" })}>
                            <option value="text">Text</option>
                            <option value="latex">LaTeX</option>
                          </select>
                        </div>
                        <div className="projectorWorkshopSlotPreview">{renderMiniPreview(slot)}</div>
                        {slot.type === "text" || slot.type === "latex" ? (
                          <textarea
                            value={slot.content}
                            onChange={(event) => updateSlot(row.id, slotIndex, { content: event.target.value, sourceLabel: "" })}
                            placeholder={slot.type === "latex" ? "\\frac{3}{4}+\\frac{1}{8}" : "Type text for this screen..."}
                            rows={3}
                          />
                        ) : null}
                        <div className="projectorWorkshopSlotActions">
                          <button type="button" onClick={() => placeSelectedAsset(row.id, slotIndex)} disabled={!selectedAsset}>Use Selected</button>
                          <button type="button" onClick={() => updateSlot(row.id, slotIndex, defaultSlot())}>Clear</button>
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </main>
          </div>
        </section>
      </div>
    </>
  );
}
