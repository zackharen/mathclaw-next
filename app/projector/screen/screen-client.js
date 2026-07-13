"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProjectorScreenContent, ProjectorScreenInactiveState } from "../projector-screen-renderer";
import "../styles.css";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const WORK_NAME_STORAGE_KEY = "mathclaw.projector.submitWorkName";

// Capability -> controls matrix, keyed by the screen's inputType.
// THIS is the extension point where future per-screen student tools
// (future #10 calculators, future #11 stylus/drawing) register and gate
// themselves by capability.
const SCREEN_TOOLS = {
  display_only: { interactive: false },
  touch: { interactive: true, submitWork: true },
  keyboard_mouse: { interactive: true },
};

function toolsForInputType(inputType) {
  return SCREEN_TOOLS[inputType] || SCREEN_TOOLS.display_only;
}

function dataUrlToFile(dataUrl, fileName = "student-work.jpg") {
  const [header, data] = String(dataUrl || "").split(",");
  const match = header.match(/^data:(.+);base64$/);
  if (!match || !data) return null;
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: match[1] || "image/jpeg" });
}

async function compressImageFile(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Take a photo of the work before submitting.");
  if (file.type === "image/gif") return file;

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not read that photo. Try retaking it."));
      image.src = objectUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that photo. Try retaking it.");
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    const compressed = dataUrlToFile(dataUrl);
    if (!compressed) throw new Error("Could not prepare that photo. Try retaking it.");
    return compressed.size < file.size ? compressed : file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ScreenClient({ initialToken = null }) {
  const [token, setToken] = useState(initialToken || "");
  const [pin, setPin] = useState("");
  const [screenNumber, setScreenNumber] = useState("1");
  const [sessionId, setSessionId] = useState("");
  const [screenName, setScreenName] = useState("");
  const [inputType, setInputType] = useState("display_only");
  const [enabled, setEnabled] = useState(true);
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [workPreviewUrl, setWorkPreviewUrl] = useState("");
  const [workFile, setWorkFile] = useState(null);
  const [workStatus, setWorkStatus] = useState("idle");
  const [workStudentName, setWorkStudentName] = useState("");
  const [workLabel, setWorkLabel] = useState("");
  const workInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    };
  }, [workPreviewUrl]);

  useEffect(() => {
    if (!initialToken) {
      const params = new URLSearchParams(window.location.search);
      setToken(String(params.get("token") || "").trim());
    }
  }, [initialToken]);

  useEffect(() => {
    try {
      setWorkStudentName(window.localStorage.getItem(WORK_NAME_STORAGE_KEY) || "");
    } catch {
      // localStorage can be unavailable in locked-down browser modes; the field still works without memory.
    }
  }, []);

  const loadScreen = useCallback(async () => {
    if (!token) return;
    setStatus("connecting");
    setMessage("");
    try {
      const response = await fetch(`/api/projector/rooms?token=${encodeURIComponent(token)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not connect.");
      setSessionId(payload.sessionId);
      setScreenNumber(String(payload.screenNumber || "1"));
      setScreenName(payload.screenName || `Screen ${payload.screenNumber || 1}`);
      setInputType(payload.inputType || "display_only");
      setEnabled(payload.enabled !== false);
      setState(payload.state || null);
      setStatus("connected");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }, [token]);

  useEffect(() => {
    loadScreen();
  }, [loadScreen, reconnectKey]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    }

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !screenNumber) return undefined;
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-session-${sessionId}`)
      .on("broadcast", { event: "screen-updated" }, ({ payload }) => {
        if (String(payload?.screenId) !== String(screenNumber)) return;
        if (payload?.refetch) {
          loadScreen();
          return;
        }
        setState(
          payload?.type
            ? {
                type: payload.type,
                content: payload.content || "",
                topText: payload.topText || "",
                caption: payload.caption || "",
                revealAnswer: Boolean(payload.revealAnswer),
              }
            : null
        );
      })
      .subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED") setStatus("connected");
        if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
          setStatus("connecting");
          window.setTimeout(() => setReconnectKey((key) => key + 1), 1200);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadScreen, reconnectKey, sessionId, screenNumber]);

  async function resolvePin(event) {
    event.preventDefault();
    setStatus("connecting");
    setMessage("");
    try {
      const response = await fetch("/api/projector/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", pin, screenNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not connect.");
      const nextToken = payload.token;
      window.history.replaceState(null, "", `/projector/screen?token=${encodeURIComponent(nextToken)}`);
      setToken(nextToken);
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function toggleFullscreen() {
    setMessage("");
    try {
      // iPad Safari before 16.4 (e.g. iPad Air 2, stuck on iPadOS 15) only exposes the webkit-prefixed API.
      const root = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen();
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else {
        throw new Error("Fullscreen API unavailable");
      }
    } catch {
      setMessage("Fullscreen is not available in this browser.");
    }
  }

  async function chooseWorkPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    setWorkPreviewUrl("");
    setWorkFile(null);
    setWorkStatus("idle");
    setMessage("");
    if (!file) return;

    try {
      const compressed = await compressImageFile(file);
      if (compressed.size > 3 * 1024 * 1024) {
        throw new Error("That photo is too large. Retake it closer to the page.");
      }
      setWorkFile(compressed);
      setWorkPreviewUrl(URL.createObjectURL(compressed));
    } catch (error) {
      setMessage(error.message);
    }
  }

  function retakeWorkPhoto() {
    if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    setWorkPreviewUrl("");
    setWorkFile(null);
    setWorkStatus("idle");
    setMessage("");
    workInputRef.current?.click();
  }

  async function submitWorkPhoto() {
    if (!workFile) {
      setMessage("Take a photo before submitting.");
      return;
    }
    setWorkStatus("submitting");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("file", workFile, "student-work.jpg");
      formData.append("studentName", workStudentName);
      formData.append("label", workLabel);
      const response = await fetch("/api/projector/work-queue", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not submit that photo.");
      if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
      setWorkPreviewUrl("");
      setWorkFile(null);
      setWorkStatus("sent");
      setWorkLabel("");
      try {
        window.localStorage.setItem(WORK_NAME_STORAGE_KEY, workStudentName.trim().slice(0, 40));
      } catch {
        // Best-effort only; submitting work should not depend on browser storage.
      }
      setMessage("Sent to teacher.");
    } catch (error) {
      setWorkStatus("idle");
      setMessage(error.message);
    }
  }

  if (!token) {
    return (
      <main className="projectorScreenJoin">
        <form className="projectorJoinCard" onSubmit={resolvePin}>
          <p className="eyebrow">MathClaw Projector</p>
          <h1>Connect a screen</h1>
          <label className="field">
            <span>Room PIN</span>
            <input
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </label>
          <div className="projectorJoinScreenPicker" aria-label="Screen number">
            <span>Screen number</span>
            <div className="projectorJoinScreenButtons">
              {SCREEN_IDS.map((screenId) => (
                <button
                  className={screenNumber === screenId ? "isActive" : ""}
                  key={screenId}
                  type="button"
                  onClick={() => setScreenNumber(screenId)}
                >
                  Screen {screenId}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" type="submit">
            Connect
          </button>
          {message ? <p className="projectorMessage">{message}</p> : null}
        </form>
      </main>
    );
  }

  const tools = toolsForInputType(inputType);
  const visibleState = enabled ? state : null;

  return (
    <main
      className={`projectorScreenStage inputType-${inputType} ${
        visibleState?.type === "image" || visibleState?.type === "video" ? "hasMedia" : ""
      } ${
        enabled ? "" : "isInactive"
      }`}
      data-input-type={inputType}
      data-enabled={enabled ? "true" : "false"}
    >
      <div className={`projectorStatusDot ${status === "connected" ? "isConnected" : ""}`} title={status} />
      {/* Fullscreen is display setup, not a student tool, so it stays available on every profile. */}
      <button className="projectorFullscreenButton" type="button" onClick={toggleFullscreen}>
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
      {screenName ? <div className="projectorScreenProfileBadge">{screenName}</div> : null}
      {enabled ? (
        <ProjectorScreenContent state={state} />
      ) : (
        <ProjectorScreenInactiveState />
      )}
      {enabled && tools.interactive ? (
        <div className="projectorScreenTools" data-interactive="true">
          {tools.submitWork ? (
            <section className="projectorSubmitWork" aria-label="Submit work">
              <input
                ref={workInputRef}
                className="projectorSubmitWorkInput"
                accept="image/*"
                capture="environment"
                type="file"
                onChange={chooseWorkPhoto}
              />
              {!workPreviewUrl ? (
                <button
                  className="projectorSubmitWorkButton"
                  type="button"
                  onClick={() => workInputRef.current?.click()}
                  disabled={workStatus === "submitting"}
                >
                  {workStatus === "sent" ? "Submit Another" : "Submit work"}
                </button>
              ) : (
                <div className="projectorSubmitWorkPreview">
                  <img src={workPreviewUrl} alt="Work preview" />
                  <div className="projectorSubmitWorkFields">
                    <label>
                      <span>Your name</span>
                      <input
                        autoComplete="name"
                        maxLength={40}
                        value={workStudentName}
                        onChange={(event) => setWorkStudentName(event.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      <span>Question</span>
                      <input
                        maxLength={80}
                        value={workLabel}
                        onChange={(event) => setWorkLabel(event.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <div className="projectorSubmitWorkActions">
                    <button type="button" onClick={retakeWorkPhoto} disabled={workStatus === "submitting"}>
                      Retake
                    </button>
                    <button type="button" onClick={submitWorkPhoto} disabled={workStatus === "submitting"}>
                      {workStatus === "submitting" ? "Sending..." : "Send to teacher"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
      {message ? <div className="projectorScreenError">{message}</div> : null}
    </main>
  );
}
