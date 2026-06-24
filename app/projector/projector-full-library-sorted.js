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
    </>
  );
}
