"use client";

import { useEffect, useMemo, useState } from "react";

const LIBRARY_CATEGORIES = ["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"];
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";

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

function previewForItem(item) {
  const content = displayContent(item.content);
  if (item.content_type === "image") return <img src={content} alt="" />;
  if (item.content_type === "video") return <span className="projectorFullLibraryVideo">Video</span>;
  if (parseQuestionContent(item.content)) return <span>{content || "Question"}</span>;
  return <span>{content || itemTypeLabel(item)}</span>;
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

export default function ProjectorFullLibrary({ libraryItems = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const filteredItems = useMemo(() => {
    let items = libraryItems;
    if (category) items = items.filter((item) => item.category === category);
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      items = items.filter((item) =>
        [item.title, item.category, itemTypeLabel(item), displayContent(item.content)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }
    return items;
  }, [category, libraryItems, search]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!libraryItems.length) return null;

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
                <h2 id="projector-full-library-title">Saved Items</h2>
                <p>Single reusable items for questions, word walls, images, videos, and announcements.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className="projectorFullLibraryControls">
              <label>
                <span>Search</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved items..." />
              </label>
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
            </div>

            <p className="projectorFullLibrarySummary">
              Showing {filteredItems.length} of {libraryItems.length} saved items
            </p>

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
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 0.9rem;
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
        .projectorFullLibrarySummary {
          color: #51606d;
          font-weight: 800;
        }

        .projectorFullLibraryHeader p:not(.eyebrow) {
          margin-top: 0.25rem;
        }

        .projectorFullLibraryHeader button,
        .projectorFullLibraryFilters button {
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

        .projectorFullLibraryFilters button.isActive {
          border-color: var(--navy);
          background: var(--navy);
          color: #fff;
        }

        .projectorFullLibrarySummary {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 900;
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

        .projectorFullLibraryThumb {
          aspect-ratio: 16 / 9;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 10px;
          background: #0a0a0a;
          color: #fff;
          padding: 0.5rem;
          text-align: center;
          font-weight: 900;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .projectorFullLibraryThumb img {
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
