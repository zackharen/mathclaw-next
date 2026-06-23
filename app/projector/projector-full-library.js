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

function sceneSearchText(scene) {
  const screenText = SCREEN_IDS.map((screenId) => searchableContentForState(scene?.screen_states?.[screenId])).join(" ");
  return [scene.title, screenText].filter(Boolean).join(" ").toLowerCase();
}

async function fetchSceneItems() {
  const response = await fetch("/api/projector?action=scenes", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load scenes.");
  return Array.isArray(payload.scenes) ? payload.scenes : [];
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

export default function ProjectorFullLibrary({ libraryItems = [], sceneItems = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tab, setTab] = useState(libraryItems.length ? "items" : "scenes");
  const [status, setStatus] = useState("");
  const [loadedScenes, setLoadedScenes] = useState(sceneItems);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const scenes = sceneItems.length ? sceneItems : loadedScenes;
  const hasItems = libraryItems.length > 0;
  const hasScenes = scenes.length > 0;

  useEffect(() => {
    if (sceneItems.length) setLoadedScenes(sceneItems);
  }, [sceneItems]);

  useEffect(() => {
    if (!open || sceneItems.length || loadedScenes.length || loadingScenes) return undefined;
    let cancelled = false;
    setLoadingScenes(true);
    fetchSceneItems()
      .then((nextScenes) => {
        if (!cancelled) setLoadedScenes(nextScenes);
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
    if (!search.trim()) return scenes;
    const query = search.trim().toLowerCase();
    return scenes.filter((scene) => sceneSearchText(scene).includes(query));
  }, [scenes, search]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!hasItems && !hasScenes && !loadingScenes) return null;

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
      setStatus(`Loaded "${payload.title || scene.title}".`);
      setOpen(false);
      window.setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      setStatus(error.message);
    }
  }

  const visibleCount = tab === "items" ? filteredItems.length : filteredScenes.length;
  const totalCount = tab === "items" ? libraryItems.length : scenes.length;
  const sceneCountLabel = loadingScenes && !scenes.length ? "..." : scenes.length;

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
          <section
            className="projectorFullLibraryModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projector-full-library-title"
          >
            <div className="projectorFullLibraryHeader">
              <div>
                <p className="eyebrow">Projector Library</p>
                <h2 id="projector-full-library-title">Full Library</h2>
                <p>Choose a saved item for the composer or load a full scene to every screen.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className="projectorFullLibraryTabs" role="tablist" aria-label="Projector library sections">
              <button className={tab === "items" ? "isActive" : ""} type="button" onClick={() => setTab("items")} disabled={!hasItems}>
                Saved Items <span>{libraryItems.length}</span>
              </button>
              <button
                className={tab === "scenes" ? "isActive" : ""}
                type="button"
                onClick={() => setTab("scenes")}
                disabled={!hasScenes && !loadingScenes}
              >
                Scenes <span>{sceneCountLabel}</span>
              </button>
            </div>

            <div className="projectorFullLibraryControls">
              <label>
                <span>Search</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved items or scenes..." />
              </label>
              {tab === "items" ? (
                <div className="projectorFullLibraryFilters" aria-label="Activity Type Filters">
                  <button className={category === "" ? "isActive" : ""} type="button" onClick={() => setCategory("")}>
                    All
                  </button>
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <button
                      className={category === cat ? "isActive" : ""}
                      key={cat}
                      type="button"
                      onClick={() => setCategory(category === cat ? "" : cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="projectorFullLibraryHint">Scenes load the whole room setup to all screens.</p>
              )}
            </div>

            <p className="projectorFullLibrarySummary">
              {loadingScenes && tab === "scenes" && !scenes.length
                ? "Loading scenes..."
                : `Showing ${visibleCount} of ${totalCount} ${tab === "items" ? "saved items" : "scenes"}`}
            </p>

            {status ? <p className="projectorFullLibraryStatus">{status}</p> : null}

            {tab === "items" ? (
              <div className="projectorFullLibraryGrid">
                {filteredItems.length ? (
                  filteredItems.map((item) => (
                    <article className="projectorFullLibraryCard" key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openSavedItemInComposer(item);
                          setOpen(false);
                        }}
                      >
                        <span className="projectorFullLibraryThumb">{previewForItem(item)}</span>
                        <strong>{item.title}</strong>
                        <em>
                          {item.category ? `${item.category} · ` : ""}
                          {itemTypeLabel(item)}
                        </em>
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="projectorFullLibraryEmpty">No saved items match your search.</p>
                )}
              </div>
            ) : (
              <div className="projectorFullLibraryGrid">
                {filteredScenes.length ? (
                  filteredScenes.map((scene) => (
                    <article className="projectorFullLibraryCard" key={scene.id}>
                      <button type="button" onClick={() => loadScene(scene)}>
                        <span className="projectorFullLibrarySceneThumb" aria-hidden="true">
                          {SCREEN_IDS.map((screenId) => (
                            <span key={screenId}>{previewForState(scene.screen_states?.[screenId])}</span>
                          ))}
                        </span>
                        <strong>{scene.title}</strong>
                        <em>{sceneFilledCount(scene)} of 4 screens filled</em>
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="projectorFullLibraryEmpty">
                    {loadingScenes ? "Loading scenes..." : "No scenes match your search."}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}
      <style>{`
        .projectorFullLibraryLauncher {
          position: fixed;
          right: 1.25rem;
          bottom: 1.25rem;
          z-index: 20;
          border: 2px solid var(--navy);
          border-radius: 999px;
          background: var(--navy);
          color: #fff;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
          padding: 0.65rem 0.9rem;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 900;
          cursor: pointer;
        }

        .projectorFullLibraryOverlay {
          position: fixed;
          inset: 0;
          z-index: 40;
          display: grid;
          place-items: center;
          background: rgba(8, 18, 28, 0.58);
          padding: clamp(0.75rem, 2vw, 2rem);
        }

        .projectorFullLibraryModal {
          width: min(92rem, 100%);
          max-height: min(54rem, calc(100dvh - 2rem));
          display: grid;
          grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
          gap: 0.8rem;
          overflow: hidden;
          border: 2px solid var(--navy);
          border-radius: 16px;
          background: #f7fafc;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
          padding: clamp(1rem, 2vw, 1.4rem);
        }

        .projectorFullLibraryHeader {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 1rem;
        }

        .projectorFullLibraryHeader h2,
        .projectorFullLibraryHeader p {
          margin: 0;
        }

        .projectorFullLibraryHeader p:not(.eyebrow),
        .projectorFullLibrarySummary,
        .projectorFullLibraryHint,
        .projectorFullLibraryStatus {
          color: #51606d;
          font-weight: 800;
        }

        .projectorFullLibraryHeader p:not(.eyebrow) {
          margin-top: 0.25rem;
        }

        .projectorFullLibraryHeader button,
        .projectorFullLibraryFilters button,
        .projectorFullLibraryTabs button {
          border: 2px solid var(--line);
          border-radius: 999px;
          background: #fff;
          color: var(--navy);
          padding: 0.45rem 0.75rem;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 900;
          cursor: pointer;
        }

        .projectorFullLibraryTabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .projectorFullLibraryTabs button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .projectorFullLibraryTabs button span {
          min-width: 1.4rem;
          border-radius: 999px;
          background: rgba(147, 165, 180, 0.18);
          padding: 0.04rem 0.35rem;
          text-align: center;
          font-size: 0.75rem;
        }

        .projectorFullLibraryTabs button.isActive,
        .projectorFullLibraryFilters button.isActive {
          border-color: var(--navy);
          background: var(--navy);
          color: #fff;
        }

        .projectorFullLibraryTabs button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .projectorFullLibraryControls {
          display: grid;
          grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
          gap: 0.75rem;
          align-items: end;
        }

        .projectorFullLibraryControls label {
          display: grid;
          gap: 0.35rem;
          color: var(--navy);
          font-weight: 800;
        }

        .projectorFullLibraryControls input {
          width: 100%;
          border: 2px solid #93a5b4;
          border-radius: 8px;
          padding: 0.6rem 0.7rem;
          font: inherit;
          background: #fff;
          color: var(--ink);
        }

        .projectorFullLibraryFilters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .projectorFullLibrarySummary,
        .projectorFullLibraryHint,
        .projectorFullLibraryStatus {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 900;
        }

        .projectorFullLibraryStatus {
          border: 2px solid #d3dee7;
          border-radius: 8px;
          background: #fff;
          color: var(--navy);
          padding: 0.55rem 0.7rem;
        }

        .projectorFullLibraryGrid {
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
          gap: 0.75rem;
          overflow: auto;
          padding-right: 0.2rem;
        }

        .projectorFullLibraryCard {
          border: 2px solid var(--line);
          border-radius: 12px;
          background: #fff;
          padding: 0.55rem;
        }

        .projectorFullLibraryCard button {
          width: 100%;
          display: grid;
          gap: 0.45rem;
          border: 0;
          background: transparent;
          color: var(--ink);
          padding: 0;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }

        .projectorFullLibraryCard strong,
        .projectorFullLibraryCard em {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .projectorFullLibraryCard strong {
          color: var(--navy);
          font-size: 1.05rem;
        }

        .projectorFullLibraryCard em {
          color: #51606d;
          font-size: 0.78rem;
          font-style: normal;
          font-weight: 800;
        }

        .projectorFullLibraryThumb,
        .projectorFullLibrarySceneThumb {
          aspect-ratio: 16 / 9;
          display: grid;
          overflow: hidden;
          border-radius: 10px;
          background: #0a0a0a;
          color: #fff;
          text-align: center;
          font-weight: 900;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .projectorFullLibraryThumb {
          place-items: center;
          padding: 0.5rem;
        }

        .projectorFullLibrarySceneThumb {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 2px;
          padding: 2px;
        }

        .projectorFullLibrarySceneThumb > span {
          min-width: 0;
          min-height: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #111;
          padding: 0.18rem;
          font-size: 0.74rem;
        }

        .projectorFullLibraryLatex {
          width: 100%;
          display: grid;
          place-items: center;
          color: #fff;
          line-height: 1.1;
        }

        .projectorFullLibraryLatex .katex-display {
          margin: 0.05rem 0;
        }

        .projectorFullLibraryLatex .katex {
          color: #fff;
          font-size: clamp(0.8rem, 1.6vw, 1.18rem);
        }

        .projectorFullLibraryThumb img,
        .projectorFullLibrarySceneThumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .projectorFullLibraryVideo {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px;
          background: #17212b;
          text-transform: uppercase;
        }

        .projectorFullLibraryEmptyCell {
          color: #5d646b;
          font-size: 0.65rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .projectorFullLibraryEmpty {
          grid-column: 1 / -1;
          margin: 0;
          border: 2px dashed #c8d6df;
          border-radius: 8px;
          background: #fff;
          color: #51606d;
          padding: 0.75rem;
          font-weight: 800;
          text-align: center;
        }

        @media (max-width: 720px) {
          .projectorFullLibraryLauncher {
            right: 0.75rem;
            bottom: 0.75rem;
          }

          .projectorFullLibraryControls {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
