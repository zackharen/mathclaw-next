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
    function updateVisibility(event) {
      setLibraryOpen(Boolean(event.detail?.open));
    }

    window.addEventListener("projector:full-library-open", updateVisibility);
    return () => window.removeEventListener("projector:full-library-open", updateVisibility);
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
          gap: 0.3rem;
          color: var(--navy);
          font: inherit;
          font-size: 0.78rem;
          font-weight: 900;
        }
        .projectorFullLibrarySort select {
          min-width: 8.5rem;
          min-height: 2.65rem;
          border: 1px solid #9fb1c1;
          border-radius: 11px;
          background: #fff;
          color: var(--ink);
          padding: 0.48rem 2rem 0.48rem 0.65rem;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 14px rgba(16, 42, 67, 0.1), inset 0 1px 2px rgba(16, 42, 67, 0.05);
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
      <style>{`.projectorFullLibraryLauncher { display: none !important; }`}</style>
    </>
  );
}
