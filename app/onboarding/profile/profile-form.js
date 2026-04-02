"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileForm({
  userId,
  initialDisplayName,
  initialSchoolName,
  schoolOptions = [],
  initialTimezone,
  initialDiscoverable = true,
  accountType = "teacher",
}) {
  const isTeacher = accountType !== "student";
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const initialKnownSchool = schoolOptions.includes(initialSchoolName) ? initialSchoolName : "";
  const [selectedSchoolName, setSelectedSchoolName] = useState(initialKnownSchool);
  const [newSchoolName, setNewSchoolName] = useState(
    initialSchoolName && !initialKnownSchool ? initialSchoolName : ""
  );
  const [timezone, setTimezone] = useState(initialTimezone);
  const [discoverable, setDiscoverable] = useState(Boolean(initialDiscoverable));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    const supabase = createClient();
    const resolvedSchoolName = newSchoolName.trim() || selectedSchoolName || "";
    const payload = {
      id: userId,
      display_name: displayName.trim(),
      school_name: resolvedSchoolName || null,
      timezone,
      discoverable: isTeacher ? discoverable : false,
      account_type: accountType,
      updated_at: new Date().toISOString(),
    };

    let { error: upsertError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (
      upsertError &&
      typeof upsertError.message === "string" &&
      upsertError.message.includes("account_type")
    ) {
      const retry = await supabase.from("profiles").upsert(
        {
          id: userId,
          display_name: displayName.trim(),
          school_name: resolvedSchoolName || null,
          timezone,
          discoverable: isTeacher ? discoverable : false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      upsertError = retry.error;
    }

    // Backward compatibility if DB migration for discoverable has not been run yet.
    if (
      upsertError &&
      typeof upsertError.message === "string" &&
      upsertError.message.includes("discoverable")
    ) {
      const legacyPayload = {
        id: userId,
        display_name: displayName.trim(),
        school_name: resolvedSchoolName || null,
        timezone,
        updated_at: new Date().toISOString(),
      };
      const retry = await supabase
        .from("profiles")
        .upsert(legacyPayload, { onConflict: "id" });
      upsertError = retry.error;
    }

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="list formList" style={{ marginTop: "1rem" }}>
      <label>
        Display Name
        <input
          className="input"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={isTeacher ? "Zack Arenstein" : "Student name"}
        />
      </label>

      <label>
        Existing School
        <select
          className="input"
          value={selectedSchoolName}
          onChange={(e) => setSelectedSchoolName(e.target.value)}
        >
          <option value="">Choose a school</option>
          {schoolOptions.map((schoolName) => (
            <option key={schoolName} value={schoolName}>
              {schoolName}
            </option>
          ))}
        </select>
      </label>

      <label>
        Or Add A New School
        <input
          className="input"
          type="text"
          value={newSchoolName}
          onChange={(e) => setNewSchoolName(e.target.value)}
          placeholder="Optional"
        />
      </label>

      <label>
        Timezone
        <select
          className="input"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          <option value="America/New_York">America/New_York</option>
          <option value="America/Chicago">America/Chicago</option>
          <option value="America/Denver">America/Denver</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
        </select>
      </label>

      {isTeacher ? (
        <label style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => setDiscoverable(e.target.checked)}
          />
          Allow other teachers to find me in search
        </label>
      ) : null}

      {error ? <p style={{ color: "#7f1d1d" }}>{error}</p> : null}
      {!error && saved ? <p className="statusNote">Profile Updated!</p> : null}

      <div className="ctaRow">
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
