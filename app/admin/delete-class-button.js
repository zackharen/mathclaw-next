"use client";

export default function DeleteClassButton({ label = "Delete Class" }) {
  return (
    <button
      className="btn danger"
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Delete this class and all related student/game data?")) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
