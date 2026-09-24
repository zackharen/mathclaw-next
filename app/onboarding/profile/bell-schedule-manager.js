"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatTime(value) {
  const [hourString, minuteString] = String(value || "").split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value || "";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

const EMPTY_BLOCK_DRAFT = { id: null, courseId: "", startTime: "", endTime: "", label: "" };

export default function BellScheduleManager({ courses }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleTypes, setScheduleTypes] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [status, setStatus] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [blockDraft, setBlockDraft] = useState(EMPTY_BLOCK_DRAFT);

  const courseTitleById = new Map((courses || []).map((course) => [course.id, course.title || "Untitled class"]));
  const blocksForSelectedType = blocks
    .filter((block) => block.schedule_type_id === selectedTypeId)
    .slice()
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const selectedType = scheduleTypes.find((type) => type.id === selectedTypeId) || null;

  async function load(successMessage = "") {
    setLoading(true);
    setStatus(successMessage);
    try {
      const response = await fetch("/api/bell-schedules", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Bell schedules could not be loaded.");
      const nextTypes = data.scheduleTypes || [];
      setScheduleTypes(nextTypes);
      setBlocks(data.blocks || []);
      setLoaded(true);
      setSelectedTypeId((current) => (current && nextTypes.some((type) => type.id === current) ? current : nextTypes[0]?.id || ""));
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function post(body) {
    const response = await fetch("/api/bell-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Bell schedules could not be updated.");
    return data;
  }

  function resetBlockDraft() {
    setBlockDraft(EMPTY_BLOCK_DRAFT);
  }

  async function createType(event) {
    event.preventDefault();
    const name = newTypeName.trim();
    if (!name) return;
    setSaving(true);
    setStatus("Adding schedule…");
    try {
      const data = await post({ action: "create-type", name });
      setNewTypeName("");
      setSelectedTypeId(data.scheduleType.id);
      await load(`Added "${data.scheduleType.name}".`);
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function renameType(id) {
    const name = renameValue.trim();
    if (!name) return;
    setSaving(true);
    try {
      await post({ action: "rename-type", id, name });
      setRenamingId(null);
      await load("Schedule renamed.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(id, name) {
    if (!window.confirm(`Delete "${name}" and all its periods? This can't be undone.`)) return;
    setSaving(true);
    try {
      await post({ action: "delete-type", id });
      if (selectedTypeId === id) setSelectedTypeId("");
      await load("Schedule removed.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBlock(event) {
    event.preventDefault();
    if (!selectedTypeId) return;
    setSaving(true);
    setStatus(blockDraft.id ? "Saving period…" : "Adding period…");
    try {
      await post({
        action: blockDraft.id ? "update-block" : "create-block",
        id: blockDraft.id || undefined,
        scheduleTypeId: selectedTypeId,
        courseId: blockDraft.courseId,
        startTime: blockDraft.startTime,
        endTime: blockDraft.endTime,
        label: blockDraft.label,
      });
      resetBlockDraft();
      await load("Period saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function editBlock(block) {
    setBlockDraft({
      id: block.id,
      courseId: block.course_id,
      startTime: String(block.start_time || "").slice(0, 5),
      endTime: String(block.end_time || "").slice(0, 5),
      label: block.label || "",
    });
  }

  async function deleteBlock(id) {
    if (!window.confirm("Remove this period?")) return;
    setSaving(true);
    try {
      await post({ action: "delete-block", id });
      if (blockDraft.id === id) resetBlockDraft();
      await load("Period removed.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      className="allClassesBulkResources manageBellSchedules"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) load();
      }}
    >
      <summary>Manage Bell Schedules</summary>
      <div className="manageVocabularyBody">
        <p>
          Create named schedules (Full Day, Half Day, Delayed Opening, Activity Schedule, or anything else your
          school uses), then give each one the class periods it runs. Tag calendar days with a schedule above, and
          a screen with the &ldquo;Class Schedule Vocabulary&rdquo; Autopilot mode (set from the Projector dashboard)
          will automatically show whichever class is currently in session.
        </p>
        {loading && !loaded ? <p>Loading…</p> : null}
        {loaded ? (
          <div className="manageBellSchedulesLayout">
            <div className="manageBellSchedulesTypes">
              <form className="manageBellSchedulesNewType" onSubmit={createType}>
                <input
                  className="input"
                  value={newTypeName}
                  onChange={(event) => setNewTypeName(event.target.value)}
                  placeholder="e.g. Full Day"
                  maxLength={80}
                  aria-label="New schedule name"
                />
                <button className="btn" type="submit" disabled={saving || !newTypeName.trim()}>
                  Add Schedule
                </button>
              </form>
              <ul className="manageBellSchedulesTypeList">
                {scheduleTypes.map((type) => (
                  <li key={type.id} className={type.id === selectedTypeId ? "isActive" : ""}>
                    {renamingId === type.id ? (
                      <>
                        <input
                          className="input"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          maxLength={80}
                          aria-label={`Rename ${type.name}`}
                        />
                        <button className="btn" type="button" onClick={() => renameType(type.id)} disabled={saving}>
                          Save
                        </button>
                        <button className="btn" type="button" onClick={() => setRenamingId(null)} disabled={saving}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn" type="button" onClick={() => setSelectedTypeId(type.id)}>
                          {type.name}
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setRenamingId(type.id);
                            setRenameValue(type.name);
                          }}
                          disabled={saving}
                        >
                          Rename
                        </button>
                        <button className="btn" type="button" onClick={() => deleteType(type.id, type.name)} disabled={saving}>
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {scheduleTypes.length === 0 ? <li>No schedules yet — add one above.</li> : null}
              </ul>
            </div>
            <div className="manageBellSchedulesBlocks">
              {selectedType ? (
                <>
                  <h3>{selectedType.name} periods</h3>
                  <ul className="manageBellSchedulesBlockList">
                    {blocksForSelectedType.map((block) => (
                      <li key={block.id}>
                        <span>
                          {formatTime(block.start_time)}–{formatTime(block.end_time)}
                        </span>
                        <span>
                          {block.label ? `${block.label} · ` : ""}
                          {courseTitleById.get(block.course_id) || "Unknown class"}
                        </span>
                        <button className="btn" type="button" onClick={() => editBlock(block)} disabled={saving}>
                          Edit
                        </button>
                        <button className="btn" type="button" onClick={() => deleteBlock(block.id)} disabled={saving}>
                          Remove
                        </button>
                      </li>
                    ))}
                    {blocksForSelectedType.length === 0 ? <li>No periods yet.</li> : null}
                  </ul>
                  <form className="manageBellSchedulesBlockForm" onSubmit={saveBlock}>
                    <label>
                      <span>Class</span>
                      <select
                        className="input"
                        value={blockDraft.courseId}
                        onChange={(event) => setBlockDraft((current) => ({ ...current, courseId: event.target.value }))}
                      >
                        <option value="">Choose a class</option>
                        {(courses || []).map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Start</span>
                      <input
                        className="input"
                        type="time"
                        value={blockDraft.startTime}
                        onChange={(event) => setBlockDraft((current) => ({ ...current, startTime: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        className="input"
                        type="time"
                        value={blockDraft.endTime}
                        onChange={(event) => setBlockDraft((current) => ({ ...current, endTime: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Label <small>Optional, e.g. &ldquo;Period 3&rdquo;</small></span>
                      <input
                        className="input"
                        value={blockDraft.label}
                        onChange={(event) => setBlockDraft((current) => ({ ...current, label: event.target.value }))}
                        maxLength={80}
                      />
                    </label>
                    <div className="ctaRow">
                      <button
                        className="btn primary"
                        type="submit"
                        disabled={saving || !blockDraft.courseId || !blockDraft.startTime || !blockDraft.endTime}
                      >
                        {blockDraft.id ? "Save Period" : "Add Period"}
                      </button>
                      {blockDraft.id ? (
                        <button className="btn" type="button" onClick={resetBlockDraft} disabled={saving}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </>
              ) : (
                <p>Add a schedule on the left, then choose it here to add periods.</p>
              )}
            </div>
          </div>
        ) : null}
        {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
      </div>
    </details>
  );
}
