"use client";

import { useRouter } from "next/navigation";

// This Class / All Classes switch in the pinned title bar. Stored in a cookie,
// like Arcade Suggestions, because the layout that owns the title bar cannot read
// search params; the choice sticks across classes and refreshes until switched.
export default function PlanViewToggle({ initialView }) {
  const router = useRouter();

  function choose(view) {
    if (view === initialView) return;
    document.cookie =
      view === "grid"
        ? "class_plan_view=grid; path=/; max-age=31536000"
        : "class_plan_view=; path=/; max-age=0";
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  return (
    <div className="planViewToggle" role="group" aria-label="Plan view">
      <button
        className={`btn${initialView === "class" ? " primary" : ""}`}
        type="button"
        aria-pressed={initialView === "class"}
        onClick={() => choose("class")}
      >
        This Class
      </button>
      <button
        className={`btn${initialView === "grid" ? " primary" : ""}`}
        type="button"
        aria-pressed={initialView === "grid"}
        onClick={() => choose("grid")}
      >
        All Classes
      </button>
    </div>
  );
}
