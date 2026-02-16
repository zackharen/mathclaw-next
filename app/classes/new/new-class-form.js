"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewClassForm({
  userId,
  timezone,
  libraries,
  defaultStart,
  defaultEnd,
}) {
  const router = useRouter();

  const libraryOptions = useMemo(
    () =>
      libraries.map((item) => ({
        id: item.id,
        classCode: item.class_code,
        className: item.class_name,
      })),
    [libraries]
  );

  const [title, setTitle] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState(
    libraryOptions[0]?.id || ""
  );
  const [scheduleModel, setScheduleModel] = useState("every_day");
  const [abStartDate, setAbStartDate] = useState(defaultStart);
  const [schoolYearStart, setSchoolYearStart] = useState(defaultStart);
  const [schoolYearEnd, setSchoolYearEnd] = useState(defaultEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedLibrary = libraryOptions.find((l) => l.id === selectedLibraryId);

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    if (!selectedLibrary) {
      setSaving(false);
      setError("Select a curriculum track.");
      return;
    }

    const supabase = createClient();

    const coursePayload = {
      owner_id: userId,
      title: title.trim() || selectedLibrary.className,
      class_name: selectedLibrary.className,
      schedule_model: scheduleModel,
      ab_pattern_start_date: scheduleModel === "ab" ? abStartDate : null,
      school_year_start: schoolYearStart,
      school_year_end: schoolYearEnd,
      timezone,
      selected_library_id: selectedLibrary.id,
      pacing_mode: "one_lesson_per_day",
    };

    const { data: newCourse, error: courseError } = await supabase
      .from("courses")
      .insert(coursePayload)
      .select("id")
      .single();

    if (courseError) {
      setSaving(false);
      setError(courseError.message);
      return;
    }

    const { error: memberError } = await supabase
      .from("course_members")
      .insert({ course_id: newCourse.id, profile_id: userId, role: "owner" });

    setSaving(false);

    if (memberError) {
      setError(memberError.message);
      return;
    }

    router.push("/classes");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="list formList" style={{ marginTop: "1rem" }}>
      <label>
        Class Title
        <input
          className="input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Algebra I - Period 2"
        />
      </label>

      <label>
        Curriculum Track (Math Medic)
        <select
          className="input"
          required
          value={selectedLibraryId}
          onChange={(e) => setSelectedLibraryId(e.target.value)}
        >
          {libraryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.classCode} - {option.className}
            </option>
          ))}
        </select>
      </label>

      <label>
        Schedule Model
        <select
          className="input"
          value={scheduleModel}
          onChange={(e) => setScheduleModel(e.target.value)}
        >
          <option value="every_day">Every Day</option>
          <option value="ab">AB Schedule</option>
        </select>
      </label>

      {scheduleModel === "ab" ? (
        <label>
          AB Pattern Start Date
          <input
            className="input"
            type="date"
            required
            value={abStartDate}
            onChange={(e) => setAbStartDate(e.target.value)}
          />
        </label>
      ) : null}

      <label>
        School Year Start
        <input
          className="input"
          type="date"
          required
          value={schoolYearStart}
          onChange={(e) => setSchoolYearStart(e.target.value)}
        />
      </label>

      <label>
        School Year End
        <input
          className="input"
          type="date"
          required
          value={schoolYearEnd}
          onChange={(e) => setSchoolYearEnd(e.target.value)}
        />
      </label>

      <p>
        Pacing mode is set to one lesson per instructional day for v1.
      </p>

      {error ? <p style={{ color: "#7f1d1d" }}>{error}</p> : null}

      <div className="ctaRow">
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Creating..." : "Create Class"}
        </button>
      </div>
    </form>
  );
}
