"use client";

import Link from "next/link";
import { useState } from "react";

async function postLessonResource(body) {
  const response = await fetch("/api/lesson-resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Resource sharing could not be updated.");
  return data;
}

export default function LessonResourceLibrarySharing({ connectedTeachers, initialTeacherIds }) {
  const [selectedIds, setSelectedIds] = useState(initialTeacherIds || []);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleTeacher(teacherId) {
    setSelectedIds((current) =>
      current.includes(teacherId)
        ? current.filter((id) => id !== teacherId)
        : [...current, teacherId]
    );
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      await postLessonResource({ action: "update-library-shares", teacherIds: selectedIds });
      setStatus("Library sharing updated.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="classPlanResourceSharing">
      <summary className="btn">Resource Sharing</summary>
      <div className="classPlanResourceSharingPanel">
        <strong>Share your full resource library</strong>
        <p>
          Selected teachers can view and download every resource you add. Your library stays read-only for them.
        </p>
        {connectedTeachers.length > 0 ? (
          <>
            <div className="classPlanTeacherChecklist">
              {connectedTeachers.map((teacher) => (
                <label key={teacher.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(teacher.id)}
                    onChange={() => toggleTeacher(teacher.id)}
                  />
                  <span>
                    <strong>{teacher.display_name}</strong>
                    {teacher.school_name ? <small>{teacher.school_name}</small> : null}
                  </span>
                </label>
              ))}
            </div>
            <button className="btn" type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Library Sharing"}
            </button>
          </>
        ) : (
          <p>
            Connect with a teacher on the <Link href="/teachers">Teachers page</Link> before sharing resources.
          </p>
        )}
        <span className="statusNote" aria-live="polite">{status}</span>
      </div>
    </details>
  );
}
