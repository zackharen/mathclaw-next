"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const INPUT_TYPES = [
  { value: "display_only", label: "Display Only" },
  { value: "touch", label: "Touch" },
  { value: "keyboard_mouse", label: "Keyboard + Mouse" },
];
const DEFAULT_SLOTS = Array.from({ length: 4 }, (_, index) => ({
  name: `Screen ${index + 1}`,
  inputType: "display_only",
}));
const MATHCLAW_ORIGIN = "https://mathclaw.com";

function normalizeSlots(slots) {
  const source = Array.isArray(slots) && slots.length ? slots : DEFAULT_SLOTS;
  return source.slice(0, 12).map((slot, index) => ({
    name: String(slot?.name || `Screen ${index + 1}`),
    inputType: INPUT_TYPES.some((type) => type.value === slot?.inputType) ? slot.inputType : "display_only",
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
  }

  async function postRoom(body) {
    setSaving(true);
    setStatus("");
    try {
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
    const payload = await postRoom({
      action: "update-room",
      roomId: selectedRoom.id,
      name: draftName,
      slots: draftSlots,
    });
    if (payload?.room) setStatus(`Saved "${payload.room.name}".`);
  }

  async function activateRoom(roomId = selectedRoom.id) {
    const payload = await postRoom({ action: "set-active-room", roomId });
    if (payload?.room) {
      setActiveRoomId(payload.room.id);
      setStatus(`Active Room: ${payload.room.name}.`);
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
      { name: `Screen ${current.length + 1}`, inputType: "display_only" },
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

        <div className="projectorRoomsBody">
          <aside className="projectorRoomsList">
            {rooms.map((room) => (
              <button
                className={room.id === selectedRoom.id ? "isActive" : ""}
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
              >
                <strong>{room.name}</strong>
                <span>{normalizeSlots(room.slots).length} screens{room.id === activeRoom.id ? " · active" : ""}</span>
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
                return (
                  <article className="projectorRoomSlot" key={`${screenId}-${index}`}>
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
                    <div className="projectorRoomSlotActions">
                      <button type="button" onClick={() => moveSlot(index, -1)} disabled={index === 0}>Up</button>
                      <button type="button" onClick={() => moveSlot(index, 1)} disabled={index === draftSlots.length - 1}>Down</button>
                      <button type="button" onClick={() => copyUrl(screenId)}>Copy URL</button>
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
                  Screen {index + 1}: {slot.name} · {inputTypeLabel(slot.inputType)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {status ? <p className="projectorRoomsStatus">{status}</p> : null}
      </section>
      <style>{`
        .projectorRoomsOverlay { position: fixed; inset: 0; z-index: 45; display: grid; align-items: start; justify-items: center; overflow: auto; background: rgba(8, 18, 28, 0.58); padding: clamp(0.75rem, 2vw, 2rem); }
        .projectorRoomsModal { width: min(76rem, 100%); display: grid; gap: 0.85rem; border: 2px solid var(--navy); border-radius: 12px; background: #f7fafc; padding: clamp(1rem, 2vw, 1.4rem); }
        .projectorRoomsHeader, .projectorRoomsEditorHeader, .projectorRoomsFooter { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
        .projectorRoomsHeader h2, .projectorRoomsHeader p, .projectorRoomsFooter p, .projectorRoomsStatus { margin: 0; }
        .projectorRoomsHeader button, .projectorRoomSlotActions button, .projectorRoomsList button { border: 2px solid var(--line); border-radius: 8px; background: #fff; color: var(--navy); padding: 0.45rem 0.65rem; font: inherit; font-size: 0.82rem; font-weight: 900; cursor: pointer; }
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
        .projectorRoomSlot { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) minmax(0, 12rem); gap: 0.6rem; align-items: end; border: 2px solid var(--line); border-radius: 8px; background: #fff; padding: 0.7rem; }
        .projectorRoomSlot > strong { align-self: center; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; background: var(--navy); color: #fff; }
        .projectorRoomSlotActions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; }
        .projectorRoomSlotActions button:disabled, .projectorRoomsEditorActions button:disabled { cursor: not-allowed; opacity: 0.45; }
        .projectorRoomsActive { margin: 0.2rem 0 0; color: #51606d; font-size: 0.78rem; font-weight: 900; }
        .projectorRoomsActivePreview { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.7rem; }
        .projectorRoomsActivePreview button { border: 1px solid #c8d6df; border-radius: 8px; background: #f7fafc; color: var(--navy); padding: 0.45rem 0.55rem; text-align: left; font: inherit; font-size: 0.82rem; font-weight: 900; cursor: pointer; }
        .projectorRoomsFooter { align-items: center; }
        .projectorRoomsFooter p, .projectorRoomsStatus { color: #51606d; font-weight: 800; }
        .projectorRoomsStatus { border: 2px solid #d3dee7; border-radius: 8px; background: #fff; padding: 0.55rem 0.7rem; }
        @media (max-width: 820px) { .projectorRoomsBody, .projectorRoomSlot { grid-template-columns: 1fr; } .projectorRoomsEditorHeader, .projectorRoomsFooter { display: grid; } }
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
