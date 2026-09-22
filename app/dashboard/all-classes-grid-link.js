"use client";

export default function AllClassesGridLink({ courseId }) {
  function openGrid() {
    document.cookie = "class_plan_view=grid; path=/; max-age=31536000; samesite=lax";
  }

  return (
    <a className="btn secondary" href={`/classes/${courseId}/plan`} onClick={openGrid}>
      All Classes Grid
    </a>
  );
}
