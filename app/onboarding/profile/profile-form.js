"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileForm({
  userId,
  initialDisplayName,
  initialSchoolName,
  initialTimezone,
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();
    const payload = {
      id: userId,
      display_name: displayName.trim(),
      school_name: schoolName.trim() || null,
      timezone,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.push("/classes/new");
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
          placeholder="Zack Arenstein"
        />
      </label>

      <label>
        School Name
        <input
          className="input"
          type="text"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
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

      <p>
        Search visibility is not yet enabled in this form. It will be added in
        the collaboration pass.
      </p>

      {error ? <p style={{ color: "#7f1d1d" }}>{error}</p> : null}

      <div className="ctaRow">
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
