"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProjectorScreenContent, ProjectorScreenInactiveState, ProjectorTimerOverlay, displayContent, questionForState } from "../projector-screen-renderer";
import "../styles.css";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const WORK_NAME_STORAGE_KEY = "mathclaw.projector.submitWorkName";

// Capability -> controls matrix, keyed by the screen's inputType.
// THIS is the extension point where future per-screen student tools
// (future #10 calculators, future #11 stylus/drawing) register and gate
// themselves by capability.
const SCREEN_TOOLS = {
  display_only: { interactive: false },
  touch: { interactive: true, submitWork: true, polls: true, draw: true },
  keyboard_mouse: { interactive: true, draw: true },
};

const DRAW_COLORS = ["#ffffff", "#ffd166", "#ef4444", "#38bdf8"];

function toolsForInputType(inputType) {
  return SCREEN_TOOLS[inputType] || SCREEN_TOOLS.display_only;
}

// Results pushed by the teacher carry the poll they were snapshotted from, so a
// stale snapshot from an earlier poll cannot suppress a newly launched one.
function pollResultsPollId(content) {
  try {
    const parsed = JSON.parse(String(content || "{}"));
    return parsed?.pollId ? String(parsed.pollId) : "";
  } catch {
    return "";
  }
}

function timerForScreen(timer, screenNumber) {
  if (!timer || !Array.isArray(timer.screenIds)) return null;
  return timer.screenIds.map(String).includes(String(screenNumber)) ? timer : null;
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

function drawStrokePath(context, canvas, stroke) {
  const points = stroke.points;
  if (!points.length) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = stroke.color;
  context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
  context.lineWidth = Math.max(2, canvas.width * (stroke.erase ? 0.03 : 0.006));
  context.beginPath();
  context.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x * canvas.width, points[index].y * canvas.height);
  }
  if (points.length === 1) {
    context.lineTo(points[0].x * canvas.width + 0.1, points[0].y * canvas.height);
  }
  context.stroke();
  context.restore();
}

function drawWrappedSnapshotText(context, text, { width, y, font, color, lineHeight, maxLines = 14 }) {
  context.save();
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "top";
  const maxWidth = width * 0.88;
  const lines = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((rawLine) => {
      let line = "";
      rawLine.split(/\s+/).forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      lines.push(line);
    });
  lines.slice(0, maxLines).forEach((line, index) => {
    context.fillText(line, width / 2, y + index * lineHeight, maxWidth);
  });
  context.restore();
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function drawContainedImage(context, source, sourceWidth, sourceHeight, width, height, offsetY = 0) {
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, (width - drawWidth) / 2, offsetY + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function currentScreenVideo() {
  return document.querySelector(".projectorScreenStage video.projectorScreenMedia");
}

// Flattens the screen's current content into the snapshot background. Media is
// redrawn from its source URL; text-like content is approximated with plain
// canvas text (KaTeX DOM cannot be rasterized without heavy libraries).
async function drawSnapshotBackground(context, width, height, state, includeVideo) {
  if (!state) return;
  const content = displayContent(state.content);
  const question = questionForState(state);
  let cursorY = height * 0.06;
  if (state.topText) {
    cursorY = drawWrappedSnapshotText(context, state.topText, {
      width,
      y: cursorY,
      font: `700 ${Math.round(height * 0.05)}px system-ui, sans-serif`,
      color: "#ffffff",
      lineHeight: Math.round(height * 0.065),
      maxLines: 3,
    }) + height * 0.02;
  }
  if (state.type === "image" || /^data:image\/gif/i.test(content) || /\.gif(\?|#|$)/i.test(content)) {
    await new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          drawContainedImage(context, image, image.naturalWidth, image.naturalHeight, width, height);
        } catch {
          // A tainted or broken frame just leaves the dark background.
        }
        resolve();
      };
      image.onerror = resolve;
      image.src = content;
    });
  } else if (state.type === "video") {
    if (includeVideo) {
      const video = currentScreenVideo();
      if (video && video.videoWidth) {
        // On screen the top text stacks above the video, so the frame goes in the
        // space that is left instead of painting over the text.
        const reserved = state.topText ? cursorY : 0;
        drawContainedImage(context, video, video.videoWidth, video.videoHeight, width, height - reserved, reserved);
      }
    }
  } else if (question) {
    const promptText = question.prompt || (state.type === "text" ? content : "");
    if (promptText) {
      cursorY = drawWrappedSnapshotText(context, promptText, {
        width,
        y: cursorY,
        font: `700 ${Math.round(height * 0.055)}px system-ui, sans-serif`,
        color: "#ffffff",
        lineHeight: Math.round(height * 0.07),
        maxLines: 5,
      }) + height * 0.03;
    }
    const optionLabels = ["A", "B", "C", "D"];
    question.options.forEach((option, index) => {
      if (!String(option || "").trim()) return;
      cursorY = drawWrappedSnapshotText(context, `${optionLabels[index]}) ${option}`, {
        width,
        y: cursorY,
        font: `600 ${Math.round(height * 0.045)}px system-ui, sans-serif`,
        color: "#e2e8f0",
        lineHeight: Math.round(height * 0.06),
        maxLines: 2,
      });
    });
  } else if (state.type === "text" || state.type === "latex") {
    drawWrappedSnapshotText(context, content, {
      width,
      y: Math.max(cursorY, height * 0.18),
      font: `700 ${Math.round(height * 0.05)}px system-ui, sans-serif`,
      color: "#ffffff",
      lineHeight: Math.round(height * 0.065),
    });
  }
  if (state.caption && (state.type === "image" || state.type === "video")) {
    drawWrappedSnapshotText(context, state.caption, {
      width,
      y: height * 0.92,
      font: `600 ${Math.round(height * 0.03)}px system-ui, sans-serif`,
      color: "#e2e8f0",
      lineHeight: Math.round(height * 0.04),
      maxLines: 2,
    });
  }
}

// Transparent annotation layer registered through SCREEN_TOOLS. Ink is
// client-side only and cleared whenever new content arrives (contentKey).
// Pen state lives in ScreenClient because the toolbar renders in the top bar
// while the canvas covers the content area below it.
const ProjectorDrawLayer = forwardRef(function ProjectorDrawLayer(
  { color, contentKey, erasing, onStrokeCountChange, penOn, suspended },
  ref
) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) => drawStrokePath(context, canvas, stroke));
    if (activeStrokeRef.current) drawStrokePath(context, canvas, activeStrokeRef.current);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // DPR capped at 1.5 to keep the canvas work light on old iPads. The canvas
    // now covers the content area under the top bar, so it is sized from its own
    // layout box. Skip degenerate sizes (browsers can report 0x0 while hidden).
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round((canvas.clientWidth || 0) * ratio);
    const height = Math.round((canvas.clientHeight || 0) * ratio);
    if (width < 8 || height < 8) return;
    canvas.width = width;
    canvas.height = height;
    redraw();
  }, [redraw]);

  useEffect(() => {
    resizeCanvas();
    const canvas = canvasRef.current;
    // Observe the canvas itself: the content area also changes when the top bar
    // wraps to a second row, which a window resize listener would miss.
    if (canvas && window.ResizeObserver) {
      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    redraw();
    // Zero-delay timeout avoids setState synchronously inside the effect body.
    const id = window.setTimeout(() => onStrokeCountChange(0), 0);
    return () => window.clearTimeout(id);
  }, [contentKey, onStrokeCountChange, redraw]);

  // While a poll overlay is up it owns the screen, so the pen is inert.
  const penActive = penOn && !suspended;

  function pointFromEvent(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function handlePointerDown(event) {
    if (!penActive || !event.isPrimary) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    try {
      canvasRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is a nicety; drawing still works without it.
    }
    activeStrokeRef.current = { color, erase: erasing, points: [point] };
    redraw();
  }

  function handlePointerMove(event) {
    const stroke = activeStrokeRef.current;
    if (!stroke || !event.isPrimary) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    stroke.points.push(point);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawStrokePath(context, canvas, { ...stroke, points: stroke.points.slice(-2) });
  }

  function handlePointerEnd(event) {
    const stroke = activeStrokeRef.current;
    if (!stroke || !event.isPrimary) return;
    activeStrokeRef.current = null;
    strokesRef.current = [...strokesRef.current, stroke];
    onStrokeCountChange(strokesRef.current.length);
  }

  useImperativeHandle(ref, () => ({
    undo() {
      strokesRef.current = strokesRef.current.slice(0, -1);
      onStrokeCountChange(strokesRef.current.length);
      redraw();
    },
    clear() {
      strokesRef.current = [];
      activeStrokeRef.current = null;
      onStrokeCountChange(0);
      redraw();
    },
    async capture(state) {
      const source = canvasRef.current;
      // Snapshots cover the content area, not the whole window, so the aspect
      // comes from the canvas box. Hidden pages can report 0x0; the canvas keeps
      // the last real backing size, so prefer it as the fallback aspect source.
      let viewportWidth = Math.round(source?.clientWidth || 0);
      let viewportHeight = Math.round(source?.clientHeight || 0);
      if (viewportWidth < 8 || viewportHeight < 8) {
        viewportWidth = source?.width >= 8 ? source.width : 1280;
        viewportHeight = source?.height >= 8 ? source.height : 720;
      }
      const encode = async (maxSide, includeVideo) => {
        const scale = Math.min(1, maxSide / Math.max(viewportWidth, viewportHeight));
        const width = Math.max(1, Math.round(viewportWidth * scale));
        const height = Math.max(1, Math.round(viewportHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.fillStyle = "#0a0a0a";
        context.fillRect(0, 0, width, height);
        await drawSnapshotBackground(context, width, height, state, includeVideo);
        if (source) context.drawImage(source, 0, 0, width, height);
        // Quality ladder keeps the payload inside realtime broadcast limits.
        let smallest = null;
        for (const quality of [0.72, 0.55, 0.4]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length <= 180000) return dataUrl;
          smallest = dataUrl;
        }
        return maxSide > 960 ? null : smallest;
      };
      try {
        return (await encode(1280, true)) || (await encode(960, true));
      } catch {
        // A cross-origin video frame taints the canvas; retry without it.
        try {
          return (await encode(1280, false)) || (await encode(960, false));
        } catch {
          return null;
        }
      }
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className={`projectorDrawCanvas${penActive ? "" : " isPenOff"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  );
});

export default function ScreenClient({ initialToken = null }) {
  const [token, setToken] = useState(initialToken || "");
  const [pin, setPin] = useState("");
  const [screenNumber, setScreenNumber] = useState("1");
  const [sessionId, setSessionId] = useState("");
  const [screenName, setScreenName] = useState("");
  const [inputType, setInputType] = useState("display_only");
  const [enabled, setEnabled] = useState(true);
  const [roomScreens, setRoomScreens] = useState([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherMessage, setSwitcherMessage] = useState("");
  const [switching, setSwitching] = useState(false);
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [workPreviewUrl, setWorkPreviewUrl] = useState("");
  const [workFile, setWorkFile] = useState(null);
  const [workStatus, setWorkStatus] = useState("idle");
  const [workSource, setWorkSource] = useState("camera");
  const [workStudentName, setWorkStudentName] = useState("");
  const [workLabel, setWorkLabel] = useState("");
  const [activePoll, setActivePoll] = useState(null);
  const [pollVote, setPollVote] = useState(null);
  const [pollStudentName, setPollStudentName] = useState("");
  const [pollStatus, setPollStatus] = useState("idle");
  const [screenTimer, setScreenTimer] = useState(null);
  const [timerOffsetMs, setTimerOffsetMs] = useState(0);
  const [drawPenOn, setDrawPenOn] = useState(false);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawErasing, setDrawErasing] = useState(false);
  const [drawStrokeCount, setDrawStrokeCount] = useState(0);
  const workInputRef = useRef(null);
  const drawLayerRef = useRef(null);
  const snapshotRequestRef = useRef(null);
  const pausedForDrawingRef = useRef(false);

  // Only changes when the receiver's <video> is actually replaced, so the pause
  // effect below does not re-run on every polled state refresh.
  const videoSourceKey = state?.type === "video" ? String(state?.content || "") : "";

  // Turning the pen on freezes playback so the ink stays lined up with the frame
  // underneath it, and the submitted snapshot shows that same frame. Local to this
  // device by design — other screens playing the same video are untouched. A poll
  // overlay unmounts the content, so there is simply no video to pause until it ends.
  useEffect(() => {
    const video = currentScreenVideo();
    if (!video) {
      pausedForDrawingRef.current = false;
      return;
    }
    if (drawPenOn) {
      video.pause();
      pausedForDrawingRef.current = true;
    } else if (pausedForDrawingRef.current) {
      pausedForDrawingRef.current = false;
      video.play()?.catch?.(() => {});
    }
  }, [activePoll, drawPenOn, enabled, videoSourceKey]);

  // Kept in a ref so the realtime channel handler always sees current
  // enabled/inputType/state without re-subscribing on every change.
  useEffect(() => {
    snapshotRequestRef.current = async () => {
      if (!enabled || !toolsForInputType(inputType).draw) {
        return { error: "This screen does not support drawing." };
      }
      const image = await drawLayerRef.current?.capture(state);
      return image ? { image } : { error: "Could not capture this screen." };
    };
  }, [enabled, inputType, state]);

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
      const savedName = window.localStorage.getItem(WORK_NAME_STORAGE_KEY) || "";
      setWorkStudentName(savedName);
      setPollStudentName(savedName);
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
      setRoomScreens(Array.isArray(payload.screens) ? payload.screens : []);
      setState(payload.state || null);
      setScreenTimer(timerForScreen(payload.timer, payload.screenNumber));
      if (payload.serverNow) setTimerOffsetMs(payload.serverNow - Date.now());
      setStatus("connected");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }, [token]);

  const loadActivePoll = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/projector/polls?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load poll.");
      setActivePoll(payload.poll || null);
      setPollVote(payload.vote || null);
      setPollStatus("idle");
    } catch (error) {
      setPollStatus("error");
      setMessage(error.message);
    }
  }, [token]);

  useEffect(() => {
    loadScreen();
    loadActivePoll();
  }, [loadActivePoll, loadScreen, reconnectKey]);

  useEffect(() => {
    if (!token) return undefined;
    const id = window.setInterval(loadActivePoll, 2000);
    return () => window.clearInterval(id);
  }, [loadActivePoll, token]);

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
      .on("broadcast", { event: "poll-updated" }, () => {
        loadActivePoll();
      })
      .on("broadcast", { event: "timer-updated" }, ({ payload }) => {
        setScreenTimer(timerForScreen(payload?.timer, screenNumber));
        if (payload?.serverNow) setTimerOffsetMs(payload.serverNow - Date.now());
      })
      .on("broadcast", { event: "snapshot-request" }, async ({ payload }) => {
        if (String(payload?.screenId) !== String(screenNumber)) return;
        let result;
        try {
          const respond = snapshotRequestRef.current;
          result = respond ? await respond() : { error: "Screen is not ready." };
        } catch {
          result = { error: "Could not capture this screen." };
        }
        channel.send({
          type: "broadcast",
          event: "snapshot-response",
          payload: { requestId: payload?.requestId || "", screenId: screenNumber, ...result },
        });
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
  }, [loadActivePoll, loadScreen, reconnectKey, sessionId, screenNumber]);

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

  // Any half-finished submission belongs to the screen it was started on.
  function discardPendingWork() {
    if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    setWorkPreviewUrl("");
    setWorkFile(null);
    setWorkStatus("idle");
    setWorkSource("camera");
  }

  // Moves this device to another screen in the same Room. The current token is
  // the proof of membership, so there is nothing to retype on a projector remote.
  async function switchToScreen(nextScreenNumber) {
    if (String(nextScreenNumber) === String(screenNumber)) {
      setSwitcherOpen(false);
      return;
    }
    setSwitching(true);
    setSwitcherMessage("");
    try {
      const response = await fetch("/api/projector/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-screen", token, screenNumber: nextScreenNumber }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not switch screens.");
      window.history.replaceState(null, "", `/projector/screen?token=${encodeURIComponent(payload.token)}`);
      discardPendingWork();
      setMessage("");
      setSwitcherOpen(false);
      setToken(payload.token);
    } catch (error) {
      setSwitcherMessage(error.message);
    } finally {
      setSwitching(false);
    }
  }

  function leaveRoom() {
    window.history.replaceState(null, "", "/projector/screen");
    discardPendingWork();
    setSwitcherOpen(false);
    setSwitcherMessage("");
    setMessage("");
    setStatus("idle");
    setToken("");
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
    setWorkSource("camera");
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

  // Drops the pending capture and hands the screen back so the ink can be edited.
  // Nothing is discarded but the snapshot itself: the strokes are still on the
  // canvas and the video is still parked on the frame they were drawn over, so
  // Send Drawing captures the edited version.
  function resumeDrawing() {
    if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    setWorkPreviewUrl("");
    setWorkFile(null);
    setWorkStatus("idle");
    setMessage("");
    setDrawPenOn(true);
  }

  // Files the current screen (content + ink) into the same submit-work flow a
  // camera photo uses; the ink intentionally stays on screen after sending.
  async function captureDrawingForSubmit() {
    setMessage("");
    setWorkStatus("idle");
    const image = await drawLayerRef.current?.capture(state);
    const file = image ? dataUrlToFile(image, "student-drawing.jpg") : null;
    if (!file) {
      setMessage("Could not capture this screen. Try again.");
      return;
    }
    if (workPreviewUrl) URL.revokeObjectURL(workPreviewUrl);
    setWorkSource("drawing");
    setWorkFile(file);
    setWorkPreviewUrl(URL.createObjectURL(file));
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

  async function submitPollVote(choice) {
    if (!activePoll) return;
    setPollStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/projector/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vote",
          token,
          pollId: activePoll.id,
          choice,
          studentName: pollStudentName,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not record your vote.");
      setPollVote(payload.vote || { choice, studentName: pollStudentName });
      setPollStatus("sent");
      try {
        window.localStorage.setItem(WORK_NAME_STORAGE_KEY, pollStudentName.trim().slice(0, 40));
      } catch {
        // Best-effort only; voting should not depend on browser storage.
      }
    } catch (error) {
      setPollStatus("error");
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
  // "Show results" pushes a poll_results snapshot to the targeted screens. When it
  // is the open poll's own snapshot the teacher has chosen results over voting on
  // this screen, so the overlay steps aside and lets the content through.
  const showingResultsForActivePoll = Boolean(
    state?.type === "poll_results" &&
      activePoll?.id &&
      pollResultsPollId(state.content) === String(activePoll.id)
  );
  const pollActive = Boolean(enabled && tools.polls && activePoll && !showingResultsForActivePoll);
  const pollChoiceLabel = activePoll?.choices?.find((choice) => String(choice.id) === String(pollVote?.choice))?.label || pollVote?.choice || "";

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
      {/* Every chrome element lives in this one minimal bar so the content area
          below it is never covered by the timer, the badge, or the tools. */}
      <header className="projectorScreenTopBar">
        <div className="projectorScreenTopBarGroup projectorScreenTopBarStart">
          <span className={`projectorStatusDot ${status === "connected" ? "isConnected" : ""}`} title={status} />
          {screenName ? (
            <button
              className="projectorScreenProfileBadge"
              type="button"
              title="Change which screen this device is"
              onClick={() => {
                setSwitcherMessage("");
                setSwitcherOpen(true);
              }}
            >
              {screenName}
            </button>
          ) : null}
        </div>
        <div className="projectorScreenTopBarGroup projectorScreenTopBarCenter">
          {enabled ? <ProjectorTimerOverlay timer={screenTimer} serverOffsetMs={timerOffsetMs} /> : null}
        </div>
        <div className="projectorScreenTopBarGroup projectorScreenTopBarEnd">
          {enabled && tools.draw && !pollActive ? (
            <div className="projectorDrawToolbar" aria-label="Drawing tools">
              <button
                className={drawPenOn ? "isActive" : ""}
                type="button"
                onClick={() => setDrawPenOn((current) => !current)}
              >
                {drawPenOn ? "Done" : "Draw"}
              </button>
              {drawPenOn ? (
                <>
                  {DRAW_COLORS.map((swatch) => (
                    <button
                      aria-label={`Pen color ${swatch}`}
                      className={`projectorDrawSwatch${!drawErasing && drawColor === swatch ? " isActive" : ""}`}
                      key={swatch}
                      style={{ background: swatch }}
                      type="button"
                      onClick={() => {
                        setDrawColor(swatch);
                        setDrawErasing(false);
                      }}
                    />
                  ))}
                  <button
                    className={drawErasing ? "isActive" : ""}
                    type="button"
                    onClick={() => setDrawErasing((current) => !current)}
                  >
                    Eraser
                  </button>
                  <button type="button" onClick={() => drawLayerRef.current?.undo()} disabled={!drawStrokeCount}>
                    Undo
                  </button>
                  <button type="button" onClick={() => drawLayerRef.current?.clear()} disabled={!drawStrokeCount}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
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
                    <div className="projectorSubmitWorkChoices">
                      {tools.draw ? (
                        <button
                          className="projectorSubmitWorkButton projectorSubmitDrawingButton"
                          type="button"
                          onClick={captureDrawingForSubmit}
                          disabled={workStatus === "submitting"}
                        >
                          Send Drawing
                        </button>
                      ) : null}
                      <button
                        className="projectorSubmitWorkButton"
                        type="button"
                        onClick={() => workInputRef.current?.click()}
                        disabled={workStatus === "submitting"}
                      >
                        {workStatus === "sent" ? "Submit Another" : "Submit work"}
                      </button>
                    </div>
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
                        {workSource === "drawing" ? (
                          <button type="button" onClick={resumeDrawing} disabled={workStatus === "submitting"}>
                            Keep drawing
                          </button>
                        ) : (
                          <button type="button" onClick={retakeWorkPhoto} disabled={workStatus === "submitting"}>
                            Retake
                          </button>
                        )}
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
          {/* Fullscreen is display setup, not a student tool, so it stays available on every profile. */}
          <button className="projectorFullscreenButton" type="button" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>
      <div className="projectorScreenViewport">
        {pollActive ? (
          <section className="projectorPollOverlay" aria-label="Live poll">
            <div className="projectorPollQuestion">
              <p className="eyebrow">Live Poll</p>
              {activePoll.questionType === "latex" ? (
                <ProjectorScreenContent state={{ type: "latex", content: activePoll.question }} />
              ) : (
                <h1>{activePoll.question}</h1>
              )}
            </div>
            <label className="projectorPollNameField">
              <span>Your name</span>
              <input
                autoComplete="name"
                maxLength={40}
                value={pollStudentName}
                onChange={(event) => setPollStudentName(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <div className={`projectorPollChoices projectorPollChoices-${activePoll.type || "multiple_choice"}`}>
              {(activePoll.choices || []).map((choice) => (
                <button
                  className={String(pollVote?.choice) === String(choice.id) ? "isSelected" : ""}
                  key={choice.id}
                  type="button"
                  onClick={() => submitPollVote(choice.id)}
                  disabled={pollStatus === "submitting"}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            {pollVote?.choice ? (
              <p className="projectorPollRecorded">
                Answer recorded: <strong>{pollChoiceLabel}</strong>. Tap another choice to change your vote.
              </p>
            ) : null}
          </section>
        ) : enabled ? (
          <ProjectorScreenContent state={state} />
        ) : (
          <ProjectorScreenInactiveState />
        )}
        {enabled && tools.draw ? (
          <ProjectorDrawLayer
            ref={drawLayerRef}
            color={drawColor}
            contentKey={`${state?.type || ""} ${state?.content || ""} ${state?.topText || ""}`}
            erasing={drawErasing}
            onStrokeCountChange={setDrawStrokeCount}
            penOn={drawPenOn}
            suspended={pollActive}
          />
        ) : null}
      </div>
      {switcherOpen ? (
        <div className="projectorScreenSwitcher" role="dialog" aria-modal="true" aria-label="Choose a screen">
          <div className="projectorScreenSwitcherCard">
            <p className="eyebrow">This device is</p>
            <h1>{screenName}</h1>
            <p className="projectorScreenSwitcherHint">Tap a screen to make this device that screen instead.</p>
            <div className="projectorScreenSwitcherButtons">
              {(roomScreens.length
                ? roomScreens
                : [{ screenNumber, name: screenName, enabled }]
              ).map((screen) => (
                <button
                  className={String(screen.screenNumber) === String(screenNumber) ? "isActive" : ""}
                  key={screen.screenNumber}
                  type="button"
                  disabled={switching}
                  onClick={() => switchToScreen(screen.screenNumber)}
                >
                  <span className="projectorScreenSwitcherName">{screen.name}</span>
                  <span className="projectorScreenSwitcherMeta">
                    Screen {screen.screenNumber}
                    {screen.enabled === false ? " · off" : ""}
                  </span>
                </button>
              ))}
            </div>
            {switcherMessage ? <p className="projectorMessage">{switcherMessage}</p> : null}
            <div className="projectorScreenSwitcherActions">
              <button type="button" disabled={switching} onClick={() => setSwitcherOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={switching} onClick={leaveRoom}>
                Different room PIN
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <div className="projectorScreenError">{message}</div> : null}
    </main>
  );
}
