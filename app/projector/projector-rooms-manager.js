"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const INPUT_TYPES = [
  { value: "display_only", label: "Display Only" },
  { value: "touch", label: "Touch" },
  { value: "keyboard_mouse", label: "Keyboard + Mouse" },
];
const DEFAULT_SLOTS = Array.from({ length: 4 }, (_, index) => ({
  name: `Screen ${index + 1}`,
  inputType: "display_only",
  enabled: true,
}));
const MATHCLAW_ORIGIN = "https://mathclaw.com";
const DAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
];

function normalizeSlots(slots) {
  const source = Array.isArray(slots) && slots.length ? slots : DEFAULT_SLOTS;
  return source.slice(0, 12).map((slot, index) => ({
    name: String(slot?.name || `Screen ${index + 1}`),
    inputType: INPUT_TYPES.some((type) => type.value === slot?.inputType) ? slot.inputType : "display_only",
    enabled: slot?.enabled !== false,
    ...(slot?.autopilot && typeof slot.autopilot === "object" ? { autopilot: slot.autopilot } : {}),
  }));
}

function defaultRoom() {
  return {
    id: "default",
    name: "Default Room",
    slots: DEFAULT_SLOTS,
    is_default: true,
    is_active: true,
  };
}

function inputTypeLabel(value) {
  return INPUT_TYPES.find((type) => type.value === value)?.label || "Display Only";
}

function enabledSlotCount(slots) {
  return normalizeSlots(slots).filter((slot) => slot.enabled !== false).length;
}

function notifyActiveRoomChanged(room) {
  if (!room) return;
  window.dispatchEvent(new CustomEvent("projector:active-room-changed", { detail: { room } }));
}

function defaultScheduleDraft(activeRoomId = "") {
  return {
    blockId: "",
    dayValues: [1],
    startTime: "08:00",
    endTime: "08:45",
    roomId: activeRoomId,
    courseId: "",
    label: "",
    attachmentType: "",
    attachmentId: "",
  };
}

function dayLabel(dayOfWeek) {
  return DAYS.find((day) => day.value === Number(dayOfWeek))?.short || "Day";
}

function blockTitle(block) {
  return block.label || block.courseName || "Schedule block";
}

function attachmentLabel(block) {
  if (!block?.attachmentType || !block?.attachmentName) return "";
  return `${block.attachmentType === "scene" ? "Scene" : "Playlist"}: ${block.attachmentName}`;
}

function formatBlockTime(block) {
  return `${String(block.startTime || "").slice(0, 5)}-${String(block.endTime || "").slice(0, 5)}`;
}

async function endProjectorTakeover() {
  const response = await fetch("/api/projector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "end-takeover" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not end the screen takeover.");
  return payload;
}

export default function ProjectorRoomsManager({ session, initialActiveRoom = null, initialRooms = [] }) {
  const [rooms, setRooms] = useState(initialRooms.length ? initialRooms : [defaultRoom()]);
  const [activeRoomId, setActiveRoomId] = useState(initialActiveRoom?.id || rooms.find((room) => room.is_active)?.id || "default");
  const [open, setOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(activeRoomId);
  const [draftName, setDraftName] = useState("");
  const [draftSlots, setDraftSlots] = useState(DEFAULT_SLOTS);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCount, setNewRoomCount] = useState(4);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [sidebarRoot, setSidebarRoot] = useState(null);
  const [tab, setTab] = useState("rooms");
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [scheduleCourses, setScheduleCourses] = useState([]);
  const [scheduleScenes, setScheduleScenes] = useState([]);
  const [schedulePlaylists, setSchedulePlaylists] = useState([]);
  const [scheduleSetupMissing, setScheduleSetupMissing] = useState(false);
  const [scheduleAttachmentSetupMissing, setScheduleAttachmentSetupMissing] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(() => defaultScheduleDraft(activeRoomId));

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || rooms.find((room) => room.is_active) || rooms[0] || defaultRoom(),
    [activeRoomId, rooms]
  );
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || activeRoom,
    [activeRoom, rooms, selectedRoomId]
  );

  useEffect(() => {
    setSelectedRoomId(activeRoom.id);
  }, [activeRoom.id]);

  useEffect(() => {
    function handleExternalActiveRoomChange(event) {
      const room = event.detail?.room;
      if (!room?.id) return;
      setRooms((current) => current.map((candidate) => ({ ...candidate, is_active: candidate.id === room.id })));
      setActiveRoomId(room.id);
      setSelectedRoomId(room.id);
    }

    window.addEventListener("projector:active-room-changed", handleExternalActiveRoomChange);
    return () => window.removeEventListener("projector:active-room-changed", handleExternalActiveRoomChange);
  }, []);

  useEffect(() => {
    setScheduleDraft((current) => (current.roomId ? current : { ...current, roomId: activeRoom.id }));
  }, [activeRoom.id]);

  useEffect(() => {
    setDraftName(selectedRoom?.name || "");
    setDraftSlots(normalizeSlots(selectedRoom?.slots));
  }, [selectedRoom]);

  useEffect(() => {
    function findSidebar() {
      setSidebarRoot(document.querySelector(".projectorComposer"));
    }

    findSidebar();
    const timer = window.setInterval(findSidebar, 250);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshRooms() {
    const response = await fetch("/api/projector/rooms", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load Rooms.");
    setRooms(payload.rooms || [defaultRoom()]);
    setActiveRoomId(payload.activeRoom?.id || payload.rooms?.find((room) => room.is_active)?.id || "default");
    notifyActiveRoomChanged(payload.activeRoom);
    return payload;
  }

  const refreshSchedule = useCallback(async () => {
    const response = await fetch("/api/projector/schedule", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load Schedule.");
    setScheduleBlocks(payload.blocks || []);
    setScheduleCourses(payload.courses || []);
    setScheduleScenes(payload.scenes || []);
    setSchedulePlaylists(payload.playlists || []);
    setScheduleSetupMissing(Boolean(payload.setupMissing));
    setScheduleAttachmentSetupMissing(Boolean(payload.attachmentSetupMissing));
    if (payload.rooms?.length) {
      setRooms(payload.rooms);
      setActiveRoomId(payload.rooms.find((room) => room.is_active)?.id || activeRoomId);
    }
    setScheduleLoaded(true);
    return payload;
  }, [activeRoomId]);

  useEffect(() => {
    if (!open || tab !== "schedule" || scheduleLoaded) return;
    refreshSchedule().catch((error) => {
      setScheduleSetupMissing(true);
      setStatus(error.message);
    });
  }, [open, refreshSchedule, scheduleLoaded, tab]);

  async function postRoom(body) {
    setSaving(true);
    setStatus("");
    try {
      await endProjectorTakeover();
      const response = await fetch("/api/projector/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save Rooms.");
      await refreshRooms();
      return payload;
    } catch (error) {
      setStatus(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function postSchedule(body) {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/projector/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save Schedule.");
      await refreshSchedule();
      return payload;
    } catch (error) {
      setStatus(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createRoom() {
    const payload = await postRoom({ action: "create-room", name: newRoomName, screenCount: newRoomCount });
    if (!payload?.room) return;
    setNewRoomName("");
    setNewRoomCount(4);
    setSelectedRoomId(payload.room.id);
    setStatus(`Created "${payload.room.name}".`);
  }

  async function saveRoom() {
    const names = new Set();
    for (const slot of draftSlots) {
      const key = slot.name.trim().toLowerCase();
      if (!key) {
        setStatus("Every screen needs a name.");
        return;
      }
      if (names.has(key)) {
        setStatus("Screen names must be unique inside a Room.");
        return;
      }
      names.add(key);
    }
    if (!enabledSlotCount(draftSlots)) {
      setStatus("A Room needs at least one active screen.");
      return;
    }
    const payload = await postRoom({
      action: "update-room",
      roomId: selectedRoom.id,
      name: draftName,
      slots: draftSlots,
    });
    if (payload?.room) {
      if (payload.room.id === activeRoom.id) notifyActiveRoomChanged(payload.room);
      setStatus(`Saved "${payload.room.name}".`);
    }
  }

  async function activateRoom(roomId = selectedRoom.id) {
    const payload = await postRoom({ action: "set-active-room", roomId });
    if (payload?.room) {
      setActiveRoomId(payload.room.id);
      notifyActiveRoomChanged(payload.room);
      setStatus(`Active Room: ${payload.room.name}.`);
    }
  }

  function updateScheduleDraft(patch) {
    setScheduleDraft((current) => ({ ...current, ...patch }));
  }

  function toggleScheduleDraftDay(dayValue) {
    setScheduleDraft((current) => {
      const nextDays = current.dayValues.includes(dayValue)
        ? current.dayValues.filter((day) => day !== dayValue)
        : [...current.dayValues, dayValue].sort((left, right) => DAYS.findIndex((day) => day.value === left) - DAYS.findIndex((day) => day.value === right));
      return { ...current, dayValues: nextDays.length ? nextDays : current.dayValues };
    });
  }

  function editScheduleBlock(block) {
    setScheduleDraft({
      blockId: block.id,
      dayValues: [block.dayOfWeek],
      startTime: block.startTime,
      endTime: block.endTime,
      roomId: block.roomId,
      courseId: block.courseId || "",
      label: block.label || "",
      attachmentType: block.attachmentType || "",
      attachmentId: block.attachmentId || "",
    });
    setStatus(`Editing ${dayLabel(block.dayOfWeek)} ${formatBlockTime(block)}.`);
  }

  function resetScheduleDraft() {
    setScheduleDraft(defaultScheduleDraft(activeRoom.id));
  }

  async function saveScheduleBlock() {
    if (!scheduleDraft.dayValues.length) {
      setStatus("Choose at least one day.");
      return;
    }
    if (!scheduleDraft.roomId) {
      setStatus("Choose a Room for this schedule block.");
      return;
    }
    const action = scheduleDraft.blockId ? "update-block" : "create-block";
    const daysToSave = scheduleDraft.blockId ? [scheduleDraft.dayValues[0]] : scheduleDraft.dayValues;
    let savedCount = 0;
    for (const dayValue of daysToSave) {
      const payload = await postSchedule({
        action,
        blockId: scheduleDraft.blockId,
        dayOfWeek: dayValue,
        startTime: scheduleDraft.startTime,
        endTime: scheduleDraft.endTime,
        roomId: scheduleDraft.roomId,
        courseId: scheduleDraft.courseId,
        label: scheduleDraft.label,
        attachmentType: scheduleDraft.attachmentType,
        attachmentId: scheduleDraft.attachmentId,
      });
      if (!payload?.block) return;
      savedCount += 1;
    }
    setStatus(scheduleDraft.blockId ? "Schedule block updated." : `${savedCount} schedule block${savedCount === 1 ? "" : "s"} added.`);
    resetScheduleDraft();
  }

  async function deleteScheduleBlock(blockId) {
    const payload = await postSchedule({ action: "delete-block", blockId });
    if (payload) {
      setStatus("Schedule block deleted.");
      if (scheduleDraft.blockId === blockId) resetScheduleDraft();
    }
  }

  async function toggleActiveScreen(screenId, enabled) {
    if (!selectedRoom?.id || selectedRoom.id === "default") return;
    const payload = await postRoom({
      action: "toggle-screen",
      roomId: selectedRoom.id,
      screenId,
      enabled,
    });
    if (payload?.room) {
      setRooms((current) => current.map((room) => (room.id === payload.room.id ? payload.room : room)));
      if (payload.room.id === activeRoom.id) notifyActiveRoomChanged(payload.room);
      setStatus(`${payload.room.slots[Number(screenId) - 1]?.name || `Screen ${screenId}`} is ${enabled ? "active" : "inactive"}.`);
    }
  }

  async function deleteRoom() {
    if (!selectedRoom || selectedRoom.is_default) return;
    const payload = await postRoom({ action: "delete-room", roomId: selectedRoom.id });
    if (payload) setStatus("Room deleted.");
  }

  function updateSlot(index, patch) {
    setDraftSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
  }

  function moveSlot(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftSlots.length) return;
    setDraftSlots((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addSlot() {
    if (draftSlots.length >= 12) return;
    setDraftSlots((current) => [
      ...current,
      { name: `Screen ${current.length + 1}`, inputType: "display_only", enabled: true },
    ]);
  }

  function removeSlot(index) {
    if (draftSlots.length <= 1) return;
    setDraftSlots((current) => current.filter((_, slotIndex) => slotIndex !== index));
  }

  async function copyUrl(screenId) {
    const screenUrl = `${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`;
    await navigator.clipboard.writeText(screenUrl);
    setStatus(`Screen ${screenId} URL copied.`);
  }

  const card = (
    <section className="projectorLibrary projectorRoomsLauncher" aria-label="Projector Rooms">
      <button className="projectorLibraryHeader projectorPanelToggle" type="button" onClick={() => setOpen(true)}>
        <div className="projectorRoomsLauncherSummary">
          <h2>
            Rooms <span className="projectorLibraryLaunchCount">{rooms.length}</span>
          </h2>
          <p className="projectorRoomsActive">Active: {activeRoom.name}</p>
        </div>
      </button>
      <style>{`
        .projectorRoomsLauncher .projectorLibraryHeader { justify-content: center; text-align: center; }
        .projectorRoomsLauncherSummary { display: grid; justify-items: center; gap: 0.2rem; width: 100%; }
        .projectorRoomsLauncherSummary h2 { display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem; margin: 0; }
      `}</style>
    </section>
  );

  const modal = open ? (
    <div className="projectorRoomsOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="projectorRoomsModal" role="dialog" aria-modal="true" aria-labelledby="projector-rooms-title">
        <div className="projectorRoomsHeader">
          <div>
            <p className="eyebrow">Projector</p>
            <h2 id="projector-rooms-title">Manage Rooms</h2>
            <p>Choose your active classroom setup and manage each screen in priority order.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)}>Close</button>
        </div>

        <div className="projectorRoomsTabs" role="tablist" aria-label="Room manager sections">
          <button className={tab === "rooms" ? "isActive" : ""} type="button" onClick={() => setTab("rooms")}>
            Rooms
          </button>
          <button className={tab === "schedule" ? "isActive" : ""} type="button" onClick={() => setTab("schedule")}>
            Schedule
          </button>
        </div>

        {tab === "rooms" ? <div className="projectorRoomsBody">
          <aside className="projectorRoomsList">
            {rooms.map((room) => (
              <button
                className={room.id === selectedRoom.id ? "isActive" : ""}
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
              >
                <strong>{room.name}</strong>
                <span>{enabledSlotCount(room.slots)}/{normalizeSlots(room.slots).length} active{room.id === activeRoom.id ? " · current" : ""}</span>
              </button>
            ))}
            <div className="projectorRoomsNew">
              <label className="field">
                <span>New Room</span>
                <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Room 214" maxLength={80} />
              </label>
              <label className="field">
                <span>Screens</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={newRoomCount}
                  onChange={(event) => setNewRoomCount(Math.min(Math.max(Number(event.target.value) || 4, 1), 12))}
                />
              </label>
              <button className="btn secondary" type="button" onClick={createRoom} disabled={saving || !newRoomName.trim()}>
                New Room
              </button>
            </div>
          </aside>

          <div className="projectorRoomsEditor">
            <div className="projectorRoomsEditorHeader">
              <label className="field">
                <span>Room Name</span>
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} />
              </label>
              <div className="projectorRoomsEditorActions">
                <button className="btn" type="button" onClick={() => activateRoom()} disabled={saving || selectedRoom.id === activeRoom.id}>
                  Make Active
                </button>
                <button className="btn secondary" type="button" onClick={saveRoom} disabled={saving}>
                  Save Room
                </button>
                <button className="projectorLibraryDelete" type="button" onClick={deleteRoom} disabled={saving || selectedRoom.is_default}>
                  Delete
                </button>
              </div>
            </div>

            <div className="projectorRoomSlots">
              {draftSlots.map((slot, index) => {
                const screenId = String(index + 1);
                const isEnabled = slot.enabled !== false;
                return (
                  <article className={`projectorRoomSlot${isEnabled ? "" : " isInactive"}`} key={`${screenId}-${index}`}>
                    <strong>{screenId}</strong>
                    <label className="field">
                      <span>Name</span>
                      <input value={slot.name} onChange={(event) => updateSlot(index, { name: event.target.value })} maxLength={60} />
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <select value={slot.inputType} onChange={(event) => updateSlot(index, { inputType: event.target.value })}>
                        {INPUT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="projectorRoomSlotToggle">
                      <span>Active</span>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(event) => updateSlot(index, { enabled: event.target.checked })}
                      />
                    </label>
                    <div className="projectorRoomSlotActions">
                      <button type="button" onClick={() => moveSlot(index, -1)} disabled={index === 0}>Up</button>
                      <button type="button" onClick={() => moveSlot(index, 1)} disabled={index === draftSlots.length - 1}>Down</button>
                      <button type="button" onClick={() => copyUrl(screenId)}>Copy URL</button>
                      {selectedRoom.id !== "default" ? (
                        <button type="button" onClick={() => toggleActiveScreen(screenId, !isEnabled)} disabled={saving || (isEnabled && enabledSlotCount(draftSlots) <= 1)}>
                          {isEnabled ? "Make Inactive" : "Make Active"}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => removeSlot(index)} disabled={draftSlots.length <= 1}>Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="projectorRoomsFooter">
              <button className="btn secondary" type="button" onClick={addSlot} disabled={draftSlots.length >= 12 || saving}>
                Add Screen
              </button>
              <p>{draftSlots.length} of 12 screens. Device type controls future tools; screen number controls routing.</p>
            </div>

            <div className="projectorRoomsActivePreview">
              <strong>Active Room URLs</strong>
              {normalizeSlots(activeRoom.slots).map((slot, index) => (
                <button key={`${slot.name}-${index}`} type="button" onClick={() => copyUrl(String(index + 1))}>
                  Screen {index + 1}: {slot.name} · {inputTypeLabel(slot.inputType)} · {slot.enabled === false ? "Inactive" : "Active"}
                </button>
              ))}
            </div>
          </div>
        </div> : (
          <div className="projectorScheduleEditor">
            {scheduleSetupMissing ? (
              <p className="projectorScheduleMissing">Schedule setup is not live yet.</p>
            ) : (
              <>
                <section className="projectorScheduleForm" aria-label="Schedule block editor">
                  <div className="projectorScheduleDays" aria-label="Days">
                    {DAYS.map((day) => (
                      <button
                        className={scheduleDraft.dayValues.includes(day.value) ? "isActive" : ""}
                        key={day.value}
                        type="button"
                        onClick={() => toggleScheduleDraftDay(day.value)}
                        disabled={Boolean(scheduleDraft.blockId)}
                        title={scheduleDraft.blockId ? "Edit one day at a time" : day.label}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>Start</span>
                    <input type="time" value={scheduleDraft.startTime} onChange={(event) => updateScheduleDraft({ startTime: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>End</span>
                    <input type="time" value={scheduleDraft.endTime} onChange={(event) => updateScheduleDraft({ endTime: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Room</span>
                    <select value={scheduleDraft.roomId} onChange={(event) => updateScheduleDraft({ roomId: event.target.value })}>
                      <option value="">Choose Room</option>
                      {rooms.filter((room) => room.id !== "default").map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Class</span>
                    <select value={scheduleDraft.courseId} onChange={(event) => updateScheduleDraft({ courseId: event.target.value })}>
                      <option value="">No class link</option>
                      {scheduleCourses.map((course) => (
                        <option key={course.id} value={course.id}>{course.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Label</span>
                    <input
                      value={scheduleDraft.label}
                      onChange={(event) => updateScheduleDraft({ label: event.target.value })}
                      maxLength={80}
                      placeholder="Period 3"
                    />
                  </label>
                  {!scheduleAttachmentSetupMissing ? (
                    <>
                      <label className="field">
                        <span>Display</span>
                        <select
                          value={scheduleDraft.attachmentType}
                          onChange={(event) => updateScheduleDraft({ attachmentType: event.target.value, attachmentId: "" })}
                        >
                          <option value="">No content</option>
                          <option value="scene">Scene</option>
                          <option value="playlist">Playlist</option>
                        </select>
                      </label>
                      {scheduleDraft.attachmentType === "scene" ? (
                        <label className="field">
                          <span>Scene</span>
                          <select value={scheduleDraft.attachmentId} onChange={(event) => updateScheduleDraft({ attachmentId: event.target.value })}>
                            <option value="">Choose scene</option>
                            {scheduleScenes.map((scene) => (
                              <option key={scene.id} value={scene.id}>{scene.title}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {scheduleDraft.attachmentType === "playlist" ? (
                        <label className="field">
                          <span>Playlist</span>
                          <select value={scheduleDraft.attachmentId} onChange={(event) => updateScheduleDraft({ attachmentId: event.target.value })}>
                            <option value="">Choose playlist</option>
                            {schedulePlaylists.map((playlist) => (
                              <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  <div className="projectorScheduleActions">
                    <button className="btn" type="button" onClick={saveScheduleBlock} disabled={saving || !scheduleDraft.roomId}>
                      {scheduleDraft.blockId ? "Update Block" : "Add Block"}
                    </button>
                    {scheduleDraft.blockId ? (
                      <button className="btn secondary" type="button" onClick={resetScheduleDraft} disabled={saving}>
                        New Block
                      </button>
                    ) : null}
                  </div>
                </section>

                <div className="projectorScheduleGrid">
                  {DAYS.map((day) => {
                    const blocksForDay = scheduleBlocks.filter((block) => Number(block.dayOfWeek) === day.value);
                    return (
                      <section className={`projectorScheduleDay day-${day.value}`} key={day.value}>
                        <h3>{day.label}</h3>
                        {blocksForDay.length ? blocksForDay.map((block) => (
                          <article className="projectorScheduleBlock" key={block.id}>
                            <div>
                              <strong>{blockTitle(block)}</strong>
                              <span>{formatBlockTime(block)} · {block.roomName}</span>
                              {block.courseName ? <span>{block.courseName}</span> : null}
                              {attachmentLabel(block) ? <span>{attachmentLabel(block)}</span> : null}
                            </div>
                            <div className="projectorScheduleBlockActions">
                              <button type="button" onClick={() => editScheduleBlock(block)} disabled={saving}>Edit</button>
                              <button type="button" onClick={() => deleteScheduleBlock(block.id)} disabled={saving}>Delete</button>
                            </div>
                          </article>
                        )) : <p>No blocks.</p>}
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {status ? <p className="projectorRoomsStatus">{status}</p> : null}
      </section>
      <style>{`
        .projectorRoomsOverlay { position: fixed; inset: 0; z-index: 45; display: grid; align-items: start; justify-items: center; overflow: auto; background: rgba(8, 18, 28, 0.58); padding: clamp(0.75rem, 2vw, 2rem); }
        .projectorRoomsModal { width: min(76rem, 100%); display: grid; gap: 0.85rem; border: 2px solid var(--navy); border-radius: 12px; background: #f7fafc; padding: clamp(1rem, 2vw, 1.4rem); }
        .projectorRoomsHeader, .projectorRoomsEditorHeader, .projectorRoomsFooter { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
        .projectorRoomsHeader h2, .projectorRoomsHeader p, .projectorRoomsFooter p, .projectorRoomsStatus { margin: 0; }
        .projectorRoomsHeader button, .projectorRoomSlotActions button, .projectorRoomsList button, .projectorRoomsTabs button, .projectorScheduleDays button, .projectorScheduleBlockActions button { border: 2px solid var(--line); border-radius: 8px; background: #fff; color: var(--navy); padding: 0.45rem 0.65rem; font: inherit; font-size: 0.82rem; font-weight: 900; cursor: pointer; }
        .projectorRoomsTabs { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .projectorRoomsTabs button.isActive, .projectorScheduleDays button.isActive { border-color: var(--navy); background: var(--navy); color: #fff; }
        .projectorRoomsBody { display: grid; grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr); gap: 1rem; align-items: start; }
        .projectorRoomsList, .projectorRoomsEditor, .projectorRoomSlots, .projectorRoomsNew, .projectorRoomsActivePreview { display: grid; gap: 0.65rem; min-width: 0; }
        .projectorRoomsList { align-content: start; overflow: auto; }
        .projectorRoomsList button { text-align: left; }
        .projectorRoomsList button.isActive { border-color: var(--navy); background: var(--navy); color: #fff; }
        .projectorRoomsList strong, .projectorRoomsList span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .projectorRoomsNew { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.7rem; }
        .projectorRoomsEditor { min-height: 0; }
        .projectorRoomsEditorHeader { align-items: end; }
        .projectorRoomsEditorActions { display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: flex-end; }
        .projectorRoomSlots { padding-right: 0.25rem; }
        .projectorRoomSlot { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) minmax(0, 12rem) minmax(5.5rem, 7rem); gap: 0.6rem; align-items: end; border: 2px solid var(--line); border-radius: 8px; background: #fff; padding: 0.7rem; }
        .projectorRoomSlot.isInactive { border-color: #94a3b8; background: #f1f5f9; }
        .projectorRoomSlot > strong { align-self: center; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; background: var(--navy); color: #fff; }
        .projectorRoomSlotToggle { display: grid; gap: 0.35rem; color: var(--navy); font-size: 0.82rem; font-weight: 900; }
        .projectorRoomSlotToggle input { width: 1.25rem; height: 1.25rem; accent-color: var(--navy); }
        .projectorRoomSlotActions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; }
        .projectorRoomSlotActions button:disabled, .projectorRoomsEditorActions button:disabled { cursor: not-allowed; opacity: 0.45; }
        .projectorRoomsActive { margin: 0.2rem 0 0; color: #51606d; font-size: 0.78rem; font-weight: 900; }
        .projectorRoomsActivePreview { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.7rem; }
        .projectorRoomsActivePreview button { border: 1px solid #c8d6df; border-radius: 8px; background: #f7fafc; color: var(--navy); padding: 0.45rem 0.55rem; text-align: left; font: inherit; font-size: 0.82rem; font-weight: 900; cursor: pointer; }
        .projectorRoomsFooter { align-items: center; }
        .projectorRoomsFooter p, .projectorRoomsStatus { color: #51606d; font-weight: 800; }
        .projectorRoomsStatus { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.55rem 0.7rem; }
        .projectorScheduleEditor { display: grid; gap: 0.85rem; }
        .projectorScheduleMissing { margin: 0; border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.75rem; color: #51606d; font-weight: 900; }
        .projectorScheduleForm { display: grid; grid-template-columns: minmax(12rem, 1.4fr) repeat(2, minmax(7rem, 0.75fr)) minmax(12rem, 1fr) minmax(12rem, 1.2fr); gap: 0.65rem; align-items: end; border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.75rem; }
        .projectorScheduleDays { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .projectorScheduleActions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
        .projectorScheduleGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.65rem; }
        .projectorScheduleDay { display: grid; gap: 0.5rem; align-content: start; border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.7rem; min-width: 0; }
        .projectorScheduleDay.day-6, .projectorScheduleDay.day-0 { background: #f8fafc; }
        .projectorScheduleDay h3, .projectorScheduleDay p { margin: 0; }
        .projectorScheduleDay h3 { color: var(--navy); font-size: 0.95rem; }
        .projectorScheduleDay p { color: #64748b; font-size: 0.82rem; font-weight: 800; }
        .projectorScheduleBlock { display: grid; gap: 0.5rem; border: 1px solid #c8d6df; border-radius: 8px; background: #f7fafc; padding: 0.55rem; }
        .projectorScheduleBlock strong, .projectorScheduleBlock span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .projectorScheduleBlock strong { color: var(--navy); }
        .projectorScheduleBlock span { color: #51606d; font-size: 0.78rem; font-weight: 850; }
        .projectorScheduleBlockActions { display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: flex-end; }
        .projectorScheduleBlockActions button:disabled, .projectorScheduleDays button:disabled { cursor: not-allowed; opacity: 0.45; }
        @media (max-width: 1020px) { .projectorScheduleGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .projectorScheduleForm { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 820px) { .projectorRoomsBody, .projectorRoomSlot, .projectorScheduleGrid, .projectorScheduleForm { grid-template-columns: 1fr; } .projectorRoomsEditorHeader, .projectorRoomsFooter { display: grid; } }
      `}</style>
    </div>
  ) : null;

  return (
    <>
      {sidebarRoot ? createPortal(card, sidebarRoot) : card}
      {modal}
    </>
  );
}
