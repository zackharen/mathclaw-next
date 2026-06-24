"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProjectorFullLibrary from "./projector-full-library";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "alphabetical", label: "Alphabetical" },
];

function itemTime(item) {
  const value = item?.created_at || item?.updated_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortItems(items, sort) {
  return [...items].sort((left, right) => {
    if (sort === "alphabetical") {
      return String(left?.title || "").localeCompare(String(right?.title || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    const difference = itemTime(left) - itemTime(right);
    if (difference) return sort === "oldest" ? difference : -difference;
    return String(left?.title || "").localeCompare(String(right?.title || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function SortControl({ sort, onChange }) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setLibraryOpen(Boolean(document.querySelector(".projectorFullLibraryModal")));
    }

    updateVisibility();
    const observer = new MutationObserver(updateVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!libraryOpen) return null;

  return createPortal(
    <label className="projectorFullLibrarySort">
      <span>Sort</span>
      <select value={sort} onChange={(event) => onChange(event.target.value)}>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <style>{`
        .projectorFullLibrarySort {
          position: fixed;
          top: max(8.5rem, calc((100dvh - min(54rem, calc(100dvh - 2rem))) * 0.5 + 8.5rem));
          right: max(2rem, calc((100vw - min(92rem, calc(100vw - 2rem))) * 0.5 + 1.4rem));
          z-index: 50;
          display: grid;
          gap: 0.25rem;
          color: var(--navy);
          font: inherit;
          font-size: 0.78rem;
          font-weight: 900;
        }
        .projectorFullLibrarySort select {
          min-width: 8.5rem;
          border: 2px solid #93a5b4;
          border-radius: 8px;
          background: #fff;
          color: var(--ink);
          padding: 0.48rem 2rem 0.48rem 0.65rem;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }
        @media (max-width: 720px) {
          .projectorFullLibrarySort {
            top: auto;
            right: 1.25rem;
            bottom: 1.25rem;
          }
        }
      `}</style>
    </label>,
    document.body
  );
}

function LibraryPanelLaunchers() {
  useEffect(() => {
    const connectedButtons = new WeakSet();
    const panels = [
      { ariaLabel: "Saved Room Setups", tabIndex: 1, title: "Scenes" },
      { ariaLabel: "Saved Projector Items", tabIndex: 0, title: "Items" },
    ];

    function connectPanel({ ariaLabel, tabIndex, title }) {
      const section = document.querySelector(`section[aria-label="${ariaLabel}"]`);
      const button = section?.querySelector(".projectorPanelToggle");
      if (!button) return;

      const heading = button.querySelector("h2");
      if (heading && heading.textContent !== title) heading.textContent = title;
      button.setAttribute("aria-label", `Open ${title}`);

      if (connectedButtons.has(button)) return;
      connectedButtons.add(button);
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          document.querySelector(".projectorFullLibraryLauncher")?.click();
          window.setTimeout(() => {
            document.querySelectorAll(".projectorFullLibraryTabs button")[tabIndex]?.click();
          }, 40);
        },
        true
      );
    }

    function connectPanels() {
      panels.forEach(connectPanel);
    }

    connectPanels();
    const observer = new MutationObserver(connectPanels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      .projectorFullLibraryLauncher {
        display: none !important;
      }
      section[aria-label="Saved Room Setups"] .projectorLibraryHeader,
      section[aria-label="Saved Projector Items"] .projectorLibraryHeader {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
      }
      section[aria-label="Saved Room Setups"] .projectorLibraryHeader .eyebrow,
      section[aria-label="Saved Projector Items"] .projectorLibraryHeader .eyebrow,
      section[aria-label="Saved Room Setups"] .projectorPanelChevron,
      section[aria-label="Saved Projector Items"] .projectorPanelChevron {
        display: none;
      }
      section[aria-label="Saved Room Setups"] .projectorLibraryHeader > div,
      section[aria-label="Saved Projector Items"] .projectorLibraryHeader > div {
        grid-column: 1;
      }
      section[aria-label="Saved Room Setups"] .projectorPanelCount,
      section[aria-label="Saved Projector Items"] .projectorPanelCount {
        grid-column: 2;
        align-self: center;
        justify-self: center;
      }
    `}</style>
  );
}

export default function ProjectorFullLibrarySorted(props) {
  const [sort, setSort] = useState("newest");
  const sortedLibraryItems = useMemo(
    () => sortItems(props.libraryItems || [], sort),
    [props.libraryItems, sort]
  );
  const sortedSceneItems = useMemo(
    () => sortItems(props.sceneItems || [], sort),
    [props.sceneItems, sort]
  );

  return (
    <>
      <ProjectorFullLibrary
        {...props}
        libraryItems={sortedLibraryItems}
        sceneItems={sortedSceneItems}
      />
      <SortControl sort={sort} onChange={setSort} />
      <LibraryPanelLaunchers />
    </>
  );
}
