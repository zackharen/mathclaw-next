"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProjectorSceneWorkshop from "./projector-scene-workshop";
import { ProjectorScreenContent, ProjectorScreenInactiveState } from "./projector-screen-renderer";
import "./styles.css";

const ALL_SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const DEFAULT_SCREEN_IDS = ["1", "2", "3", "4"];
const LIBRARY_CATEGORIES = ["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"];
const MATHCLAW_ORIGIN = "https://mathclaw.com";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const DIRECT_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const QUESTION_OPTION_LABELS = ["A", "B", "C", "D"];
const TAKEOVER_STATE_KEY = "__mathclaw_projector_takeover_v1__";
const PREVIEW_REFERENCE_WIDTH = 1280;

function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function occurrenceKeyForBlock(block, date = new Date()) {
  if (!block?.id) return "";
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${stamp}:${block.id}:${block.startTime}-${block.endTime}`;
}

function findCurrentScheduleBlock(blocks, date = new Date()) {
  const day = date.getDay();
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  return (blocks || []).find((block) => {
    if (Number(block.dayOfWeek) !== day) return false;
    const start = minutesFromTime(block.startTime);
    const end = minutesFromTime(block.endTime);
    return start != null && end != null && start <= nowMinutes && nowMinutes < end;
  }) || null;
}

function scheduleBlockName(block) {
  return block?.label || block?.courseName || "Current class";
}

function takeoverStateFrom(screenStates) {
  const takeover = screenStates?.[TAKEOVER_STATE_KEY];
  if (!takeover || typeof takeover !== "object") return null;
  const sourceScreenId = ALL_SCREEN_IDS.includes(String(takeover.sourceScreenId || ""))
    ? String(takeover.sourceScreenId)
    : null;
  const activeScreenIds = Array.isArray(takeover.activeScreenIds)
    ? takeover.activeScreenIds.map(String).filter((screenId) => ALL_SCREEN_IDS.includes(screenId))
    : [];
  if (!sourceScreenId || !activeScreenIds.length) return null;
  return { ...takeover, sourceScreenId, activeScreenIds };
}

function formatQueueTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function workEntryCaption(entry) {
  return [entry?.studentName, entry?.label]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function ensureKatexAssets() {
  if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = KATEX_CSS;
    document.head.appendChild(link);
  }

  if (window.katex || document.querySelector(`script[src="${KATEX_JS}"]`)) return;
  const script = document.createElement("script");
  script.src = KATEX_JS;
  script.async = true;
  document.head.appendChild(script);
}

function isEscapedLatexCharacter(source, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function isExponentStart(character) {
  return Boolean(character && /[A-Za-z0-9{\\]/.test(character));
}

function isArrowTokenStart(source, index) {
  return (
    source.startsWith("\\uparrow", index) ||
    source.startsWith("\\downarrow", index) ||
    source[index] === "↑" ||
    source[index] === "↓" ||
    (source[index] === "^" && !isExponentStart(source[index + 1]))
  );
}

function visibleLatexSpaces(count) {
  return "\\;".repeat(Math.min(count, 4));
}

function normalizeLatexLineForDisplay(line) {
  let normalized = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === " ") {
      let end = index;
      while (line[end] === " ") end += 1;
      normalized += isArrowTokenStart(line, end) ? visibleLatexSpaces(end - index) : line.slice(index, end);
      index = end - 1;
    } else if (line.startsWith("\\uparrow", index) || line.startsWith("\\downarrow", index)) {
      const command = line.startsWith("\\uparrow", index) ? "\\uparrow" : "\\downarrow";
      let end = index + command.length;
      while (line[end] === " ") end += 1;
      normalized += `${command}${visibleLatexSpaces(end - index - command.length)}`;
      index = end - 1;
    } else if (character === "%" && !isEscapedLatexCharacter(line, index)) {
      normalized += "\\%";
    } else if (character === "↑") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "↓") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\downarrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "^" && !isExponentStart(line[index + 1])) {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else {
      normalized += character;
    }
  }
  return normalized;
}

function renderLatex(element, content) {
  if (!element) return;
  const lines = String(content || "").split(/\r?\n/);
  if (!window.katex) {
    element.textContent = content || "";
    return;
  }
  try {
    element.replaceChildren();
    lines.forEach((line) => {
      const row = document.createElement("div");
      row.className = "projectorLatexLine";
      if (line.trim()) {
        window.katex.render(normalizeLatexLineForDisplay(line), row, {
          throwOnError: false,
          displayMode: true,
        });
      } else {
        row.appendChild(document.createElement("br"));
      }
      element.appendChild(row);
    });
  } catch {
    element.textContent = content || "";
  }
}

function ProjectorLatex({ content, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureKatexAssets();
    const id = window.setInterval(() => {
      if (window.katex) {
        renderLatex(ref.current, content);
        window.clearInterval(id);
      }
    }, 80);
    renderLatex(ref.current, content);
    return () => window.clearInterval(id);
  }, [content]);

  return <div ref={ref} className={className} />;
}

function normalizeQuestionPayload(parsed) {
  const prompt = String(parsed.prompt || "");
  const promptType = parsed.promptType === "latex" ? "latex" : "text";
  const mode = parsed.mode === "fill_blank" ? "fill_blank" : "multiple_choice";
  const answerType = parsed.answerType === "latex" ? "latex" : "text";
  const options = Array.isArray(parsed.options)
    ? parsed.options.slice(0, 4).map((option) => String(option || ""))
    : [];
  const correctIndex = Number.isInteger(parsed.correctIndex) ? parsed.correctIndex : null;
  const question = {
    answerType,
    fillBlankAnswer: String(parsed.fillBlankAnswer || ""),
    mode,
    prompt,
    promptType,
    options,
    correctIndex: correctIndex >= 0 && correctIndex < 4 ? correctIndex : null,
  };
  const hasQuestion = Boolean(mode === "fill_blank" || prompt.trim() || options.some((option) => option.trim()));
  return hasQuestion ? question : null;
}

function parseQuestionPayload(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    const question = normalizeQuestionPayload(parsed.question || parsed);
    if (!question) return null;
    return {
      content: typeof parsed.content === "string" ? parsed.content : "",
      question,
    };
  } catch {
    return null;
  }
}

function parseQuestionContent(content) {
  return parseQuestionPayload(content)?.question || null;
}

function displayContent(content) {
  const payload = parseQuestionPayload(content);
  return payload ? payload.content : String(content || "");
}

function questionForState(state) {
  return state?.question || parseQuestionContent(state?.content);
}

function buildQuestionContent({
  answerType,
  content = "",
  correctIndex,
  fillBlankAnswer,
  mode,
  options,
  prompt,
  promptType,
}) {
  const safeMode = mode === "fill_blank" ? "fill_blank" : "multiple_choice";
  const safeAnswerType = answerType === "latex" ? "latex" : "text";
  const safeOptions = options.slice(0, 4).map((option) => String(option || "").trim());
  const safeCorrectIndex =
    safeMode === "multiple_choice" && Number.isInteger(correctIndex) && safeOptions[correctIndex]
      ? correctIndex
      : null;
  return `${QUESTION_CONTENT_PREFIX}${JSON.stringify({
    content: String(content || ""),
    question: {
      answerType: safeAnswerType,
      fillBlankAnswer: safeMode === "fill_blank" ? String(fillBlankAnswer || "").trim() : "",
      mode: safeMode,
      prompt: String(prompt || "").trim(),
      promptType: promptType === "latex" ? "latex" : "text",
      options: safeMode === "multiple_choice" ? safeOptions : [],
      correctIndex: safeCorrectIndex,
    },
  })}`;
}

function QuestionAnswer({ children, latex }) {
  if (latex) return <ProjectorLatex content={children} className="projectorQuestionAnswerLatex" />;
  return <span>{children}</span>;
}

function QuestionDisplay({ promptContent = "", promptType = "text", question, compact = false, revealAnswer = false }) {
  if (!question) return null;
  const filledOptions = question.options
    .map((option, index) => ({ index, option }))
    .filter((item) => item.option.trim());
  const prompt = String(promptContent || question.prompt || "");
  const safePromptType = promptType === "latex" ? "latex" : question.promptType;
  return (
    <div
      className={[
        compact ? "projectorQuestionCard isCompact" : "projectorQuestionCard",
        question.mode === "fill_blank" ? "isFillBlank" : "",
      ].filter(Boolean).join(" ")}
    >
      {prompt.trim() ? (
        <div className="projectorQuestionPrompt">
          {safePromptType === "latex" ? (
            <ProjectorLatex content={prompt} />
          ) : (
            <span>{prompt}</span>
          )}
        </div>
      ) : null}
      {question.mode === "fill_blank" ? <div className="projectorFillBlankLine" aria-hidden="true" /> : null}
      {question.mode !== "fill_blank" && filledOptions.length ? (
        <div className="projectorQuestionOptions">
          {filledOptions.map(({ index, option }) => (
            <div
              className={question.correctIndex === index ? "projectorQuestionOption isCorrect" : "projectorQuestionOption"}
              key={index}
            >
              <strong>{QUESTION_OPTION_LABELS[index]}</strong>
              <QuestionAnswer latex={question.answerType === "latex"}>{option}</QuestionAnswer>
              {revealAnswer && question.correctIndex === index ? <em>Answer</em> : null}
            </div>
          ))}
        </div>
      ) : null}
      {revealAnswer && question.mode === "fill_blank" && question.fillBlankAnswer.trim() ? (
        <div className="projectorFillBlankAnswer">
          <QuestionAnswer latex={question.answerType === "latex"}>{question.fillBlankAnswer}</QuestionAnswer>
        </div>
      ) : null}
    </div>
  );
}

function renderTopText(state, compact = false) {
  if (!state?.topText || (state.type === "text" && !questionForState(state))) return null;
  return <div className={compact ? "projectorTopTextThumb" : "projectorTopTextDisplay"}>{state.topText}</div>;
}

function renderContentBody(state, compact = false, options = {}) {
  if (!state) return <span className="projectorEmpty">empty</span>;
  const content = displayContent(state.content);
  if (state.type === "text") {
    return <div className={compact ? "projectorTextThumb" : "projectorTextDisplay"}>{content}</div>;
  }
  if (state.type === "latex") {
    return <ProjectorLatex content={content} className={compact ? "projectorLatexThumb" : ""} />;
  }
  if (state.type === "image") {
    return <img src={content} alt="" className="projectorThumbMedia" />;
  }
  if (state.type === "video") {
    if (compact && !options.playCompactVideo) {
      return (
        <span className="projectorVideoThumb">
          {/\.gif(\?|#|$)/i.test(content || "") ? "GIF" : "Video"}
        </span>
      );
    }
    if (/\.gif(\?|#|$)/i.test(content || "")) {
      return <img src={content} alt="" className="projectorThumbMedia" />;
    }
    return (
      <video className="projectorThumbMedia" src={content} autoPlay loop muted playsInline />
    );
  }
  return <span className="projectorEmpty">empty</span>;
}

function renderContent(state, compact = false, options = {}) {
  const topText = renderTopText(state, compact);
  const body = renderContentBody(state, compact, options);
  const question = questionForState(state);
  const promptContent = displayContent(state?.content);
  const hasBodyContent = Boolean(promptContent.trim()) && !(question && state?.type === "text");
  if (!topText && !question) return body;
  if (question && !topText && !hasBodyContent) {
    return (
      <QuestionDisplay
        promptContent={state?.type === "text" ? promptContent : ""}
        promptType={state?.type}
        question={question}
        compact={compact}
        revealAnswer={Boolean(state?.revealAnswer)}
      />
    );
  }
  return (
    <div className={compact ? "projectorContentStack isCompact" : "projectorContentStack"}>
      {topText}
      {hasBodyContent ? <div className="projectorContentBody">{body}</div> : null}
      {question ? (
        <QuestionDisplay
          promptContent={state?.type === "text" ? promptContent : ""}
          promptType={state?.type}
          question={question}
          compact={compact}
          revealAnswer={Boolean(state?.revealAnswer)}
        />
      ) : null}
    </div>
  );
}

function ProjectorReceiverPreview({ enabled, state }) {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const updateScale = () => {
      const width = frame.getBoundingClientRect().width || PREVIEW_REFERENCE_WIDTH;
      setScale(Math.min(1, width / PREVIEW_REFERENCE_WIDTH));
    };

    updateScale();
    if (!window.ResizeObserver) {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const hasMedia = enabled && (state?.type === "image" || state?.type === "video");

  return (
    <div className="projectorScreenPreview" ref={frameRef}>
      <div
        className="projectorScreenPreviewScaler"
        style={{ transform: `scale(${scale})` }}
      >
        <div
          className={`projectorScreenPreviewStage${hasMedia ? " hasMedia" : ""}${enabled ? "" : " isInactive"}`}
        >
          {enabled ? <ProjectorScreenContent state={state} /> : <ProjectorScreenInactiveState />}
        </div>
      </div>
    </div>
  );
}

function normalizeRoomSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return null;
  return slots.slice(0, 12).map((slot, index) => ({
    name: String(slot?.name || `Screen ${index + 1}`),
    inputType: ["touch", "keyboard_mouse", "display_only"].includes(slot?.inputType)
      ? slot.inputType
      : "display_only",
    enabled: slot?.enabled !== false,
  }));
}

function screenIdsForRoom(room) {
  const slots = normalizeRoomSlots(room?.slots);
  return slots ? slots.map((_, index) => String(index + 1)) : DEFAULT_SCREEN_IDS;
}

function enabledScreenIdsForRoom(room) {
  const slots = normalizeRoomSlots(room?.slots);
  if (!slots) return DEFAULT_SCREEN_IDS;
  return slots
    .map((slot, index) => (slot.enabled === false ? null : String(index + 1)))
    .filter(Boolean);
}

function slotForScreen(room, screenId) {
  const slots = normalizeRoomSlots(room?.slots);
  return slots?.[Number(screenId) - 1] || null;
}

function libraryTypeLabel(item) {
  if (item?.category === "Questions" && parseQuestionContent(item.content)) return "Question";
  const type = item?.content_type || item?.type || "";
  return type === "latex" ? "LaTeX" : type ? type[0].toUpperCase() + type.slice(1) : "Item";
}

function toLibraryState(item) {
  return {
    type: item.content_type,
    content: item.content,
  };
}

function playlistEntryLabel(entry, library, scenes) {
  if (entry?.type === "item") {
    return library.find((item) => item.id === entry.refId)?.title || "Saved Item";
  }
  if (entry?.type === "scene") {
    return scenes.find((scene) => scene.id === entry.refId)?.title || "Scene";
  }
  return "Entry";
}

function playlistEntryMeta(entry, library, scenes) {
  if (entry?.type === "item") {
    const item = library.find((candidate) => candidate.id === entry.refId);
    return item ? libraryTypeLabel(item) : "Missing Item";
  }
  if (entry?.type === "scene") {
    const scene = scenes.find((candidate) => candidate.id === entry.refId);
    return scene ? "Scene" : "Missing Scene";
  }
  return "Entry";
}

function sceneSavedScreenIds(scene) {
  const source = scene?.screen_states && typeof scene.screen_states === "object" ? scene.screen_states : {};
  return Object.keys(source)
    .filter((screenId) => ALL_SCREEN_IDS.includes(screenId))
    .sort((left, right) => Number(left) - Number(right));
}

function normalizePlaylistEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        type: entry?.type === "scene" ? "scene" : "item",
        refId: String(entry?.refId || ""),
        durationSeconds: Math.max(Number.parseInt(entry?.durationSeconds, 10) || 60, 5),
      }))
    : [];
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text().catch(() => "");
  const cleanText = text.replace(/\s+/g, " ").trim();
  return {
    error: cleanText ? `${fallbackMessage} ${cleanText.slice(0, 120)}` : fallbackMessage,
  };
}

function sceneFilledCount(scene, screenIds) {
  return screenIds.filter((screenId) => scene?.screen_states?.[screenId]).length;
}

function sceneFolderLabel(scene, folders) {
  if (!scene?.folder_id) return "Uncategorized";
  return folders.find((folder) => folder.id === scene.folder_id)?.title || "Folder";
}

function describeScreenTargets(targetScreenIds, targetMode = "custom") {
  if (targetMode === "all") return "all screens";
  if (targetScreenIds.length === 1) return `screen ${targetScreenIds[0]}`;
  return `screens ${targetScreenIds.join(", ")}`;
}

function screenTargetSummary(targetScreenIds, targetMode = "custom") {
  if (targetMode === "all") return "All";
  if (targetScreenIds.length <= 3) return targetScreenIds.join(",");
  return `${targetScreenIds.length} selected`;
}

function SidebarPanel({ ariaLabel, children, className = "", count, eyebrow, onToggle, open, title }) {
  return (
    <section className={`projectorLibrary ${className}`} aria-label={ariaLabel || title}>
      <button
        className="projectorLibraryHeader projectorPanelToggle"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        <span className="projectorPanelCount">{count}</span>
        <strong className="projectorPanelChevron">{open ? "Hide" : "Show"}</strong>
      </button>
      {open ? <div className="projectorPanelBody">{children}</div> : null}
    </section>
  );
}

export default function ProjectorClient({
  activeRoom: initialActiveRoom = null,
  session,
  libraryItems = [],
  sceneItems = [],
  sceneFolders = [],
  playlistItems = [],
  playlistsSetupMissing = false,
}) {
  const [screenStates, setScreenStates] = useState(session.screen_states || {});
  const [takeoverState, setTakeoverState] = useState(() => takeoverStateFrom(session.screen_states || {}));
  const [activeRoom, setActiveRoom] = useState(initialActiveRoom);
  const [library, setLibrary] = useState(libraryItems);
  const [scenes, setScenes] = useState(sceneItems);
  const [folders, setFolders] = useState(sceneFolders);
  const [playlists, setPlaylists] = useState(playlistItems);
  const [openFolderIds, setOpenFolderIds] = useState(new Set());
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [showSceneSaveFolderForm, setShowSceneSaveFolderForm] = useState(false);
  const [openPanels, setOpenPanels] = useState({ workQueue: true, screens: true, scenes: false, library: false });
  const [targetMode, setTargetMode] = useState("all");
  const [selectedTargetScreens, setSelectedTargetScreens] = useState([]);
  const [type, setType] = useState("text");
  const [text, setText] = useState("Welcome to class");
  const [latex, setLatex] = useState("\\frac{3}{4} + \\frac{1}{8}");
  const [questionAnswerType, setQuestionAnswerType] = useState("text");
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  const [questionOptions, setQuestionOptions] = useState(["3x + 12", "3x + 4", "x + 12", "7x"]);
  const [questionCorrectIndex, setQuestionCorrectIndex] = useState("");
  const [questionMode, setQuestionMode] = useState("");
  const [showTopText, setShowTopText] = useState(false);
  const [topText, setTopText] = useState("");
  const [url, setUrl] = useState("");
  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [renamingItemId, setRenamingItemId] = useState(null);
  const [renamingItemTitle, setRenamingItemTitle] = useState("");
  const [renamingItemCategory, setRenamingItemCategory] = useState("");
  const [renamingSceneId, setRenamingSceneId] = useState(null);
  const [renamingSceneTitle, setRenamingSceneTitle] = useState("");
  const [loadedScene, setLoadedScene] = useState(null);
  const [sceneTitle, setSceneTitle] = useState("");
  const [sceneFolderId, setSceneFolderId] = useState("");
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [videoUploadUrl, setVideoUploadUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [savingScene, setSavingScene] = useState(false);
  const [assignmentPrompt, setAssignmentPrompt] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [playlistStartPrompt, setPlaylistStartPrompt] = useState(null);
  const [playlistTargetScreens, setPlaylistTargetScreens] = useState([]);
  const [playlistState, setPlaylistState] = useState({
    status: "idle",
    playlistId: null,
    index: 0,
    remainingSeconds: 0,
    loop: false,
    assignmentsBySceneId: {},
    targetScreens: [],
  });
  const [rotationPromptOpen, setRotationPromptOpen] = useState(false);
  const [rotationIntervalSeconds, setRotationIntervalSeconds] = useState(15);
  const [rotationDirection, setRotationDirection] = useState("forward");
  const [timedRotation, setTimedRotation] = useState({
    status: "idle",
    intervalSeconds: 15,
    remainingSeconds: 0,
    direction: "forward",
  });
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [workQueue, setWorkQueue] = useState([]);
  const [workQueueSetupMissing, setWorkQueueSetupMissing] = useState(false);
  const [workQueueBusy, setWorkQueueBusy] = useState(false);
  const [previewWorkEntry, setPreviewWorkEntry] = useState(null);
  const [showWorkCaption, setShowWorkCaption] = useState(false);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [scheduleSetupMissing, setScheduleSetupMissing] = useState(false);
  const [dismissedScheduleKey, setDismissedScheduleKey] = useState("");
  const [schedulePrompt, setSchedulePrompt] = useState(null);
  const latexTextareaRef = useRef(null);
  const imageDragDepthRef = useRef(0);
  const playlistTimeoutRef = useRef(null);
  const playlistCountdownRef = useRef(null);
  const timedRotationIntervalRef = useRef(null);
  const timedRotationCountdownRef = useRef(null);
  const playlistActionRef = useRef(false);
  const playlistStateRef = useRef(playlistState);
  const assignmentResolverRef = useRef(null);

  const screenTokens = session.screen_tokens || {};
  const roomScreenIds = useMemo(() => screenIdsForRoom(activeRoom), [activeRoom]);
  const activeScreenIds = useMemo(() => enabledScreenIdsForRoom(activeRoom), [activeRoom]);
  const targetScreenIds = useMemo(
    () =>
      targetMode === "all"
        ? activeScreenIds
        : selectedTargetScreens.filter((screenId) => activeScreenIds.includes(screenId)),
    [activeScreenIds, selectedTargetScreens, targetMode]
  );
  const targetSummary = screenTargetSummary(targetScreenIds, targetMode);
  const targetDescription = describeScreenTargets(targetScreenIds, targetMode);
  const currentPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === playlistState.playlistId) || null,
    [playlistState.playlistId, playlists]
  );
  const currentPlaylistEntries = normalizePlaylistEntries(currentPlaylist?.entries);
  const currentPlaylistEntry = currentPlaylistEntries[playlistState.index] || null;
  const schedulePromptKey = schedulePrompt ? occurrenceKeyForBlock(schedulePrompt) : "";
  const sortedFolders = useMemo(
    () =>
      [...folders].sort((left, right) =>
        String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" })
      ),
    [folders]
  );
  const filteredLibrary = useMemo(() => {
    let items = library;
    if (libraryCategoryFilter) items = items.filter((item) => item.category === libraryCategoryFilter);
    if (librarySearch.trim()) {
      const query = librarySearch.trim().toLowerCase();
      items = items.filter((item) => item.title.toLowerCase().includes(query));
    }
    return items;
  }, [library, libraryCategoryFilter, librarySearch]);
  const newWorkCount = workQueue.filter((entry) => entry.status !== "sent").length;

  function toggleFolder(folderId) {
    setOpenFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  async function refetchScreenState(screenId) {
    const token = screenTokens[screenId];
    if (!token) return;
    const response = await fetch(`/api/projector?token=${encodeURIComponent(token)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setScreenStates((current) => ({
      ...current,
      [screenId]: payload.state || null,
    }));
  }

  function togglePanel(panelName) {
    setOpenPanels((current) => ({ ...current, [panelName]: !current[panelName] }));
  }

  function syncSceneLibrary(nextScenes, nextFolders = folders) {
    window.dispatchEvent(
      new CustomEvent("projector:scene-library-updated", {
        detail: { scenes: nextScenes, folders: nextFolders, source: "projector-client" },
      })
    );
  }

  function updateScenesAndSync(updater, nextFolders = folders) {
    const nextScenes = typeof updater === "function" ? updater(scenes) : updater;
    setScenes(nextScenes);
    syncSceneLibrary(nextScenes, nextFolders);
  }

  function updateFoldersAndSync(nextFolders) {
    setFolders(nextFolders);
    syncSceneLibrary(scenes, nextFolders);
  }

  function addWorkshopScenes(savedScenes) {
    if (!Array.isArray(savedScenes) || !savedScenes.length) return;
    updateScenesAndSync((current) => [
      ...savedScenes,
      ...current.filter((scene) => !savedScenes.some((savedScene) => savedScene.id === scene.id)),
    ]);
  }

  function addAutoSavedItems(items) {
    if (!Array.isArray(items) || !items.length) return;
    setLibrary((current) => [
      ...items.filter((item) => item?.id && !current.some((existing) => existing.id === item.id)),
      ...current,
    ]);
  }

  function updateSceneInLibrary(updatedScene) {
    if (!updatedScene?.id) return;
    updateScenesAndSync((current) => [
      updatedScene,
      ...current.filter((scene) => scene.id !== updatedScene.id),
    ]);
    setLoadedScene((current) =>
      current?.id === updatedScene.id
        ? { id: updatedScene.id, title: updatedScene.title || current.title }
        : current
    );
  }

  function scenePayloadFromStates(sourceStates, screenIds) {
    const safeStates = sourceStates && typeof sourceStates === "object" ? sourceStates : {};
    return {
      screenIds,
      screenStates: screenIds.reduce((states, screenId) => {
        const state = safeStates[screenId];
        states[screenId] = state?.type
          ? {
              type: state.type,
              content: state.content || "",
              topText: state.topText || "",
              revealAnswer: Boolean(state.revealAnswer),
            }
          : null;
        return states;
      }, {}),
    };
  }

  function applyScreenStates(nextScreenStates) {
    const safeStates = nextScreenStates && typeof nextScreenStates === "object" ? nextScreenStates : {};
    setScreenStates(safeStates);
    setTakeoverState(takeoverStateFrom(safeStates));
  }

  function screenStateForDisplay(screenId) {
    if (takeoverState?.activeScreenIds.includes(screenId)) {
      return screenStates?.[takeoverState.sourceScreenId] || null;
    }
    return screenStates?.[screenId] || null;
  }

  async function endTakeover(options = {}) {
    const { silent = false } = options;
    const response = await fetch("/api/projector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end-takeover" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not end the screen takeover.");
    applyScreenStates(payload.screenStates || {});
    if (!silent) setMessage(payload.ended ? "Screen takeover ended." : "No screen takeover is running.");
    return Boolean(payload.ended);
  }

  async function endTakeoverForManualAction() {
    if (!takeoverState) return false;
    return endTakeover({ silent: true });
  }

  useEffect(() => {
    function updateSceneLibrary(event) {
      if (event.detail?.source === "projector-client") return;
      if (Array.isArray(event.detail?.scenes)) {
        setScenes(event.detail.scenes);
        setLoadedScene((current) => {
          if (!current) return current;
          const nextScene = event.detail.scenes.find((scene) => scene.id === current.id);
          return nextScene ? { id: nextScene.id, title: nextScene.title || current.title } : null;
        });
      }
      if (Array.isArray(event.detail?.folders)) setFolders(event.detail.folders);
    }

    window.addEventListener("projector:scene-library-updated", updateSceneLibrary);
    return () => window.removeEventListener("projector:scene-library-updated", updateSceneLibrary);
  }, []);

  async function loadWorkQueue({ silent = false } = {}) {
    try {
      const response = await fetch("/api/projector/work-queue");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load submitted work.");
      setWorkQueue(Array.isArray(payload.entries) ? payload.entries : []);
      setWorkQueueSetupMissing(Boolean(payload.setupMissing));
    } catch (error) {
      if (!silent) setMessage(error.message);
    }
  }

  useEffect(() => {
    loadWorkQueue({ silent: true });
    const id = window.setInterval(() => loadWorkQueue({ silent: true }), 12000);
    return () => window.clearInterval(id);
  }, []);

  async function loadProjectorSchedule({ silent = false } = {}) {
    try {
      const response = await fetch("/api/projector/schedule", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load projector schedule.");
      setScheduleBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);
      setScheduleSetupMissing(Boolean(payload.setupMissing));
    } catch (error) {
      if (!silent) setMessage(error.message);
    }
  }

  useEffect(() => {
    loadProjectorSchedule({ silent: true });
    const id = window.setInterval(() => loadProjectorSchedule({ silent: true }), 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (scheduleSetupMissing) {
      setSchedulePrompt(null);
      return;
    }

    function checkCurrentScheduleBlock() {
      const block = findCurrentScheduleBlock(scheduleBlocks);
      const key = occurrenceKeyForBlock(block);
      if (!block || !key || block.roomId === activeRoom?.id || key === dismissedScheduleKey) {
        setSchedulePrompt(null);
        return;
      }
      setSchedulePrompt(block);
    }

    checkCurrentScheduleBlock();
    const id = window.setInterval(checkCurrentScheduleBlock, 60000);
    return () => window.clearInterval(id);
  }, [activeRoom?.id, dismissedScheduleKey, scheduleBlocks, scheduleSetupMissing]);

  function clearPlaylistTimers() {
    if (playlistTimeoutRef.current) {
      window.clearTimeout(playlistTimeoutRef.current);
      playlistTimeoutRef.current = null;
    }
    if (playlistCountdownRef.current) {
      window.clearInterval(playlistCountdownRef.current);
      playlistCountdownRef.current = null;
    }
  }

  function stopPlaylist(reason = "") {
    clearPlaylistTimers();
    setPlaylistState((current) => ({
      ...current,
      status: "idle",
      playlistId: null,
      index: 0,
      remainingSeconds: 0,
      assignmentsBySceneId: {},
      targetScreens: [],
    }));
    if (reason) setMessage(reason);
  }

  function clearTimedRotationTimer() {
    if (timedRotationIntervalRef.current) {
      window.clearInterval(timedRotationIntervalRef.current);
      timedRotationIntervalRef.current = null;
    }
    if (timedRotationCountdownRef.current) {
      window.clearInterval(timedRotationCountdownRef.current);
      timedRotationCountdownRef.current = null;
    }
  }

  function stopTimedRotation(reason = "") {
    clearTimedRotationTimer();
    setTimedRotation((current) => ({ ...current, status: "idle", remainingSeconds: 0 }));
    if (reason) setMessage(reason);
  }

  function stopTimedRotationForManualAction() {
    stopTimedRotation("Timed screen rotation stopped for your manual change.");
  }

  function pausePlaylist(reason = "Playlist paused.") {
    setPlaylistState((current) => {
      if (current.status !== "running") return current;
      clearPlaylistTimers();
      if (reason) setMessage(reason);
      return { ...current, status: "paused", remainingSeconds: 0 };
    });
  }

  function pausePlaylistForManualAction() {
    if (playlistActionRef.current) return;
    pausePlaylist("Playlist paused for your manual change.");
  }

  useEffect(() => {
    ensureKatexAssets();
  }, []);

  useEffect(() => {
    function updateActiveRoom(event) {
      if (event.detail?.room) {
        setActiveRoom(event.detail.room);
        setLoadedScene(null);
        setTakeoverState(null);
        if (playlistTimeoutRef.current) {
          window.clearTimeout(playlistTimeoutRef.current);
          playlistTimeoutRef.current = null;
        }
        if (playlistCountdownRef.current) {
          window.clearInterval(playlistCountdownRef.current);
          playlistCountdownRef.current = null;
        }
        clearTimedRotationTimer();
        setPlaylistState((current) => ({
          ...current,
          status: "idle",
          playlistId: null,
          index: 0,
          remainingSeconds: 0,
          assignmentsBySceneId: {},
          targetScreens: [],
        }));
        setTimedRotation((current) => ({ ...current, status: "idle", remainingSeconds: 0 }));
        setMessage("Playlist stopped because the active Room changed.");
      }
    }

    window.addEventListener("projector:active-room-changed", updateActiveRoom);
    return () => window.removeEventListener("projector:active-room-changed", updateActiveRoom);
  }, []);

  useEffect(() => {
    function applyLoadedScene(event) {
      const scene = event.detail?.scene;
      if (!scene?.id) return;
      if (event.detail?.screenStates) applyScreenStates(event.detail.screenStates);
      setLoadedScene({ id: scene.id, title: scene.title || "Saved room setup" });
      setMessage(`Loaded "${scene.title || "Saved room setup"}" to all screens.`);
    }

    window.addEventListener("projector:scene-loaded", applyLoadedScene);
    return () => window.removeEventListener("projector:scene-loaded", applyLoadedScene);
  }, []);

  useEffect(() => () => {
    clearPlaylistTimers();
    clearTimedRotationTimer();
  }, []);

  useEffect(() => {
    playlistStateRef.current = playlistState;
  }, [playlistState]);

  useEffect(() => {
    function updatePlaylists(event) {
      if (Array.isArray(event.detail?.playlists)) setPlaylists(event.detail.playlists);
    }

    function openPlaylists() {
      document.querySelector(".projectorFullLibraryLauncher")?.click();
      window.setTimeout(() => {
        document.querySelector('[data-projector-library-tab="playlists"]')?.click();
      }, 40);
    }

    function playPlaylistFromLibrary(event) {
      const playlist = event.detail?.playlist;
      if (!playlist) return;
      const entries = normalizePlaylistEntries(playlist.entries);
      if (!entries.length) {
        setMessage(`Add entries to "${playlist.name}" before playing it.`);
        return;
      }
      setPlaylistStartPrompt(playlist);
      setPlaylistTargetScreens(activeScreenIds);
    }

    window.addEventListener("projector:playlists-updated", updatePlaylists);
    window.addEventListener("projector:open-playlists", openPlaylists);
    window.addEventListener("projector:play-playlist", playPlaylistFromLibrary);
    return () => {
      window.removeEventListener("projector:playlists-updated", updatePlaylists);
      window.removeEventListener("projector:open-playlists", openPlaylists);
      window.removeEventListener("projector:play-playlist", playPlaylistFromLibrary);
    };
  }, [activeScreenIds]);

  useEffect(() => {
    if (targetMode === "all") return;
    const next = selectedTargetScreens.filter((screenId) => activeScreenIds.includes(screenId));
    if (!next.length) {
      setSelectedTargetScreens([]);
      setTargetMode("all");
    } else if (next.length !== selectedTargetScreens.length) {
      setSelectedTargetScreens(next);
    }
  }, [activeScreenIds, selectedTargetScreens, targetMode]);

  useEffect(() => {
    setPlaylistTargetScreens((current) => {
      const next = current.filter((screenId) => activeScreenIds.includes(screenId));
      return next.length === current.length ? current : next;
    });
  }, [activeScreenIds]);

  useEffect(() => {
    if (timedRotation.status === "running" && activeScreenIds.length < 2) {
      clearTimedRotationTimer();
      setTimedRotation((current) => ({ ...current, status: "idle", remainingSeconds: 0 }));
      setMessage("Timed screen rotation stopped because fewer than two screens are active.");
    }
  }, [activeScreenIds.length, timedRotation.status]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-session-${session.id}`)
      .on("broadcast", { event: "screen-updated" }, ({ payload }) => {
        const screenId = String(payload?.screenId || "");
        if (!ALL_SCREEN_IDS.includes(screenId)) return;
        if (payload?.refetch) {
          refetchScreenState(screenId);
          return;
        }
        setScreenStates((current) => ({
          ...current,
          [screenId]: payload?.type
            ? {
                type: payload.type,
                content: payload.content || "",
                topText: payload.topText || "",
                revealAnswer: Boolean(payload.revealAnswer),
              }
            : null,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, screenTokens]);

  async function copyUrl(screenId) {
    const screenUrl = `${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`;
    await navigator.clipboard.writeText(screenUrl);
    setMessage(`Screen ${screenId} URL copied.`);
  }

  async function startTakeover(screenId) {
    pausePlaylist("Playlist paused because screen takeover started.");
    stopTimedRotation("Timed screen rotation stopped because screen takeover started.");
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-takeover", screenId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not start screen takeover.");
      applyScreenStates(payload.screenStates || {});
      setTakeoverState(payload.takeover || takeoverStateFrom(payload.screenStates || {}));
      setMessage(`Screen ${screenId} is showing on all active screens.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function endTakeoverFromDock() {
    setSending(true);
    setMessage("");
    try {
      await endTakeover();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleActiveRoomScreen(screenId, enabled) {
    if (!activeRoom?.id || activeRoom.id === "default") {
      setMessage("Rooms are not ready for screen toggles yet.");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      await endTakeoverForManualAction();
      const response = await fetch("/api/projector/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-screen",
          roomId: activeRoom.id,
          screenId,
          enabled,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update that screen.");
      setActiveRoom(payload.room);
      if (playlistStateRef.current.status === "running" || playlistStateRef.current.status === "paused") {
        stopPlaylist("Playlist stopped because screen availability changed.");
      }
      if (timedRotation.status === "running") {
        stopTimedRotation("Timed screen rotation stopped because screen availability changed.");
      }
      setMessage(`Screen ${screenId} is now ${enabled ? "active" : "inactive"}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function switchToScheduledRoom() {
    if (!schedulePrompt?.roomId) return;
    setSending(true);
    setMessage("");
    try {
      await endTakeoverForManualAction();
      const response = await fetch("/api/projector/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-active-room", roomId: schedulePrompt.roomId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not switch Rooms.");
      clearPlaylistTimers();
      clearTimedRotationTimer();
      setActiveRoom(payload.room);
      setLoadedScene(null);
      setTakeoverState(null);
      setPlaylistState((current) => ({
        ...current,
        status: "idle",
        playlistId: null,
        index: 0,
        remainingSeconds: 0,
        assignmentsBySceneId: {},
        targetScreens: [],
      }));
      setTimedRotation((current) => ({ ...current, status: "idle", remainingSeconds: 0 }));
      setSchedulePrompt(null);
      window.dispatchEvent(new CustomEvent("projector:active-room-changed", { detail: { room: payload.room, source: "schedule-prompt" } }));
      setMessage(`Active Room: ${payload.room?.name || schedulePrompt.roomName}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  function dismissSchedulePrompt() {
    if (schedulePromptKey) setDismissedScheduleKey(schedulePromptKey);
    setSchedulePrompt(null);
  }

  function currentComposerContent() {
    if (type === "text") return text;
    if (type === "latex") return latex;
    if (type === "image") return imageDataUrl || url;
    return videoUploadUrl || url;
  }

  function currentComposerTopText() {
    return (type !== "text" || questionMode) && showTopText ? topText : "";
  }

  function currentComposerState() {
    const rawContent = currentComposerContent();
    if (!rawContent) return null;
    const content = questionMode
      ? buildQuestionContent({
          answerType: questionAnswerType,
          content: rawContent,
          mode: questionMode,
          fillBlankAnswer,
          prompt: "",
          promptType: "text",
          options: questionOptions,
          correctIndex: questionCorrectIndex === "" ? null : Number(questionCorrectIndex),
        })
      : rawContent;
    if (!content) return null;
    const nextTopText = currentComposerTopText();
    return nextTopText ? { type, content, topText: nextTopText } : { type, content };
  }

  function updateQuestionOption(index, value) {
    setQuestionOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? value : option)));
  }

  function isQuestionState(state) {
    return Boolean(questionForState(state));
  }

  function loadQuestionContent(content) {
    const question = parseQuestionContent(content);
    if (!question) return false;
    setQuestionMode(question.mode || "multiple_choice");
    setQuestionAnswerType(question.answerType || "text");
    setFillBlankAnswer(question.fillBlankAnswer || "");
    setQuestionOptions(QUESTION_OPTION_LABELS.map((_, index) => question.options[index] || ""));
    setQuestionCorrectIndex(question.correctIndex === null ? "" : String(question.correctIndex));
    setLibraryCategory("Questions");
    return true;
  }

  function insertLatexSnippet(snippet, cursorOffset = snippet.length) {
    const textarea = latexTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? latex.length;
    const selectionEnd = textarea?.selectionEnd ?? latex.length;
    const nextLatex = `${latex.slice(0, selectionStart)}${snippet}${latex.slice(selectionEnd)}`;
    setLatex(nextLatex);
    window.requestAnimationFrame(() => {
      if (!latexTextareaRef.current) return;
      const nextCursor = selectionStart + cursorOffset;
      latexTextareaRef.current.focus();
      latexTextareaRef.current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function chooseAllTargetScreens() {
    setTargetMode("all");
    setSelectedTargetScreens([]);
  }

  function toggleTargetScreen(screenId) {
    if (!activeScreenIds.includes(screenId)) return;
    if (targetMode === "custom" && selectedTargetScreens.includes(screenId) && selectedTargetScreens.length === 1) {
      chooseAllTargetScreens();
      return;
    }
    setTargetMode("custom");
    setSelectedTargetScreens((current) => {
      return current.includes(screenId)
        ? current.filter((candidate) => candidate !== screenId)
        : [...current, screenId].sort((left, right) => Number(left) - Number(right));
    });
  }

  function editScreenContent(screenId) {
    const state = screenStates?.[screenId];
    if (!state?.type) {
      setMessage(`Screen ${screenId} is empty.`);
      return;
    }

    setTargetMode("custom");
    setSelectedTargetScreens([screenId]);
    setType(state.type);
    setShowTopText(Boolean(state.topText));
    setTopText(state.topText || "");
    setUrl("");
    setImageDataUrl("");
    setVideoUploadUrl("");
    setVideoFileName("");
    setOpenPanels((current) => ({ ...current, screens: true }));

    const rawContent = displayContent(state.content);
    const loadedQuestion = loadQuestionContent(state.content);
    if (!loadedQuestion) setQuestionMode("");
    if (state.type === "text") {
      setText(rawContent || "");
    } else if (state.type === "latex") {
      setLatex(rawContent || "");
    } else if (state.type === "image") {
      if (String(rawContent || "").startsWith("data:")) {
        setImageDataUrl(rawContent || "");
      } else {
        setUrl(rawContent || "");
      }
    } else if (state.type === "video") {
      setUrl(rawContent || "");
    }

    setMessage(`Loaded screen ${screenId} into the composer.`);
  }

  async function renameLibraryItem(itemId, title, category) {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-library-item", itemId, title, category }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rename that item.");
      setLibrary((current) => current.map((item) => (item.id === itemId ? payload.item : item)));
      setRenamingItemId(null);
      setMessage(`Renamed to "${payload.item.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  function loadLibraryItem(item) {
    const nextType = item.content_type;
    setLibraryTitle(item.title || "");
    setLibraryCategory(item.category || "");
    setUrl("");
    setImageDataUrl("");
    setVideoUploadUrl("");
    setVideoFileName("");
    setShowTopText(Boolean(item.topText));
    setTopText(item.topText || "");

    const rawContent = displayContent(item.content);
    const loadedQuestion = loadQuestionContent(item.content);
    setType(nextType);
    if (!loadedQuestion) setQuestionMode("");
    if (nextType === "text") setText(rawContent || "");
    if (nextType === "latex") setLatex(rawContent || "");
    if (nextType === "image") {
      if (String(rawContent || "").startsWith("data:")) {
        setImageDataUrl(rawContent || "");
      } else {
        setUrl(rawContent || "");
      }
    }
    if (nextType === "video") setUrl(rawContent || "");
    setMessage(`Loaded "${item.title}" into the composer.`);
  }

  async function saveLibraryItem() {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-library-item",
          title: libraryTitle,
          type,
          content: currentComposerState()?.content || "",
          category: questionMode ? "Questions" : libraryCategory,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save that item.");

      setLibrary((current) => [payload.item, ...current.filter((item) => item.id !== payload.item.id)]);
      setLibraryTitle(payload.item.title || "");
      setMessage(`Saved "${payload.item.title}" to your library.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  async function deleteLibraryItem(itemId) {
    setSavingLibrary(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-library-item", itemId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that item.");

      setLibrary((current) => current.filter((item) => item.id !== itemId));
      setMessage("Saved item deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingLibrary(false);
    }
  }

  async function saveScene() {
    if (takeoverState) {
      setMessage("End the screen takeover before saving a scene.");
      return;
    }
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-scene",
          title: sceneTitle,
          folderId: sceneFolderId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save that room setup.");

      updateScenesAndSync((current) => [payload.scene, ...current.filter((scene) => scene.id !== payload.scene.id)]);
      addAutoSavedItems(payload.autoSavedItems);
      setSceneTitle(payload.scene.title || "");
      setMessage(`Saved "${payload.scene.title}" as a room setup.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function updateLoadedScene() {
    if (!loadedScene?.id) return;
    if (takeoverState) {
      setMessage("End the screen takeover before updating a saved scene.");
      return;
    }
    if (!window.confirm(`Overwrite "${loadedScene.title}" with the current screens?`)) return;
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-scene",
          sceneId: loadedScene.id,
          ...scenePayloadFromStates(screenStates, roomScreenIds),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update that room setup.");

      updateSceneInLibrary(payload.scene);
      addAutoSavedItems(payload.autoSavedItems);
      setLoadedScene({ id: payload.scene.id, title: payload.scene.title || loadedScene.title });
      setMessage(`Updated "${payload.scene.title || loadedScene.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function createSceneFolder() {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-scene-folder", title: newFolderTitle }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create that folder.");

      setFolders((current) => {
        const nextFolders = [payload.folder, ...current.filter((folder) => folder.id !== payload.folder.id)];
        syncSceneLibrary(scenes, nextFolders);
        return nextFolders;
      });
      setOpenFolderIds((current) => new Set([...current, payload.folder.id]));
      setSceneFolderId(payload.folder.id);
      setNewFolderTitle("");
      setShowNewFolderForm(false);
      setShowSceneSaveFolderForm(false);
      setMessage(`Created folder "${payload.folder.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function deleteSceneFolder(folderId) {
    setSavingScene(true);
    setMessage("");
    try {
      const folder = folders.find((item) => item.id === folderId);
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-scene-folder", folderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that folder.");

      const nextFolders = folders.filter((item) => item.id !== folderId);
      setFolders(nextFolders);
      updateScenesAndSync(
        (current) => current.map((scene) => (scene.folder_id === folderId ? { ...scene, folder_id: null } : scene)),
        nextFolders
      );
      if (sceneFolderId === folderId) setSceneFolderId("");
      setMessage(`Deleted "${folder?.title || "Folder"}". Scenes Moved To Uncategorized.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function updateSceneFolder(sceneId, folderId) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-scene-folder", sceneId, folderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not move that room setup.");

      updateScenesAndSync((current) => current.map((scene) => (scene.id === sceneId ? payload.scene : scene)));
      setMessage(`Moved "${payload.scene.title}" to ${sceneFolderLabel(payload.scene, folders)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function renameScene(sceneId, title) {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) {
      setMessage("Enter a name for this room setup.");
      return;
    }

    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-scene", sceneId, title: nextTitle }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rename that room setup.");

      updateScenesAndSync((current) => current.map((scene) => (scene.id === sceneId ? payload.scene : scene)));
      setLoadedScene((current) =>
        current?.id === sceneId ? { id: payload.scene.id, title: payload.scene.title || current.title } : current
      );
      setRenamingSceneId(null);
      setRenamingSceneTitle("");
      setMessage(`Renamed room setup to "${payload.scene.title}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  function beginRenameScene(scene) {
    setRenamingSceneId(scene.id);
    setRenamingSceneTitle(scene.title || "");
  }

  function cancelRenameScene() {
    setRenamingSceneId(null);
    setRenamingSceneTitle("");
  }

  async function postLoadScene(scene, sceneAssignments = null) {
    const response = await fetch("/api/projector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "load-scene",
        sceneId: scene.id,
        ...(sceneAssignments ? { assignments: sceneAssignments } : {}),
      }),
    });
    const payload = await response.json();
    return { response, payload };
  }

  async function loadScene(scene) {
    pausePlaylistForManualAction();
    stopTimedRotationForManualAction();
    setSavingScene(true);
    setMessage("");
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      const { response, payload } = await postLoadScene(scene);
      // The scene has more screens than the active Room: the server returns
      // needsAssignment (HTTP 409) instead of loading. Open the chooser BEFORE
      // the ok/throw check so the non-ok status does not surface as an error.
      if (payload.needsAssignment) {
        setAssignmentPrompt({
          sceneId: scene.id,
          title: scene.title,
          sceneScreens: Array.isArray(payload.sceneScreens) ? payload.sceneScreens : [],
          roomScreens: Array.isArray(payload.roomScreens) ? payload.roomScreens : [],
        });
        setAssignments({});
        setMessage(`"${scene.title}" has more screens than your active Room. Choose where each item should go.`);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Could not load that room setup.");

      applyScreenStates(payload.screenStates || scene.screen_states || {});
      setLoadedScene({ id: scene.id, title: payload.title || scene.title });
      setMessage(`${takeoverEnded ? "Screen takeover ended. " : ""}Loaded "${payload.title || scene.title}" to all screens.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  function assignSceneScreen(sceneScreenId, roomScreenId) {
    setAssignments((current) => {
      const next = { ...current };
      if (!roomScreenId) {
        delete next[sceneScreenId];
        return next;
      }
      // A room screen can only receive one scene item — clear any other scene
      // screen already pointing at it so the UI never offers a duplicate.
      for (const key of Object.keys(next)) {
        if (next[key] === roomScreenId) delete next[key];
      }
      next[sceneScreenId] = roomScreenId;
      return next;
    });
  }

  function cancelAssignment() {
    if (assignmentResolverRef.current) {
      assignmentResolverRef.current(null);
      assignmentResolverRef.current = null;
    }
    setAssignmentPrompt(null);
    setAssignments({});
  }

  async function confirmAssignment() {
    if (!assignmentPrompt) return;
    if (assignmentPrompt.mode === "playlist") {
      const nextAssignments = { ...assignments };
      assignmentResolverRef.current?.(nextAssignments);
      assignmentResolverRef.current = null;
      setAssignmentPrompt(null);
      setAssignments({});
      return;
    }
    setSavingScene(true);
    setMessage("");
    try {
      const { response, payload } = await postLoadScene({ id: assignmentPrompt.sceneId }, assignments);
      if (!response.ok) throw new Error(payload.error || "Could not load that room setup.");

      applyScreenStates(payload.screenStates || {});
      setLoadedScene({ id: assignmentPrompt.sceneId, title: payload.title || assignmentPrompt.title });
      setMessage(`Loaded "${payload.title || assignmentPrompt.title}" to all screens.`);
      setAssignmentPrompt(null);
      setAssignments({});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function deleteScene(sceneId) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-scene", sceneId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete that room setup.");

      updateScenesAndSync((current) => current.filter((scene) => scene.id !== sceneId));
      setLoadedScene((current) => (current?.id === sceneId ? null : current));
      setMessage("Room setup deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  function renderSceneItem(scene) {
    const isRenaming = renamingSceneId === scene.id;
    return (
      <article className="projectorSceneItem" key={scene.id}>
        <button type="button" onClick={() => loadScene(scene)} disabled={savingScene}>
          <span>
            <strong>{scene.title}</strong>
            <em>{sceneFilledCount(scene, activeScreenIds)} Of {activeScreenIds.length} Screens Filled</em>
          </span>
          <span className="projectorSceneThumb" aria-hidden="true">
            {activeScreenIds.map((screenId) => (
              <span key={screenId}>{renderContent(scene.screen_states?.[screenId], true)}</span>
            ))}
          </span>
        </button>
        <div className="projectorSceneControls">
          {isRenaming ? (
            <form
              className="projectorSceneRenameForm"
              onSubmit={(event) => {
                event.preventDefault();
                renameScene(scene.id, renamingSceneTitle);
              }}
            >
              <label>
                <span>Scene name</span>
                <input
                  value={renamingSceneTitle}
                  onChange={(event) => setRenamingSceneTitle(event.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </label>
              <div className="projectorSceneRenameActions">
                <button className="projectorLibraryRename" type="submit" disabled={savingScene || !renamingSceneTitle.trim()}>
                  Save
                </button>
                <button className="projectorLibraryDelete" type="button" onClick={cancelRenameScene} disabled={savingScene}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="projectorLibraryRename"
              type="button"
              onClick={() => beginRenameScene(scene)}
              disabled={savingScene}
              aria-label={`Rename ${scene.title}`}
            >
              Rename
            </button>
          )}
          <label>
            <span>Move to folder</span>
            <select
              value={scene.folder_id || ""}
              onChange={(event) => updateSceneFolder(scene.id, event.target.value)}
              disabled={savingScene}
            >
              <option value="">Uncategorized</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.title}</option>
              ))}
            </select>
          </label>
          <button
            className="projectorLibraryDelete"
            type="button"
            onClick={() => deleteScene(scene.id)}
            disabled={savingScene}
            aria-label={`Delete ${scene.title}`}
          >
            Delete
          </button>
        </div>
      </article>
    );
  }

  function processImageFile(file) {
    setImageDataUrl("");
    if (!file) {
      setMessage("Drop an image file or choose one from your Mac.");
      return;
    }
    if (!file.type?.startsWith("image/")) {
      setMessage("That does not look like an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("That image is over 5MB. Choose a smaller image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Image ready. Heads up: images over 2MB can feel slower on classroom Wi-Fi.");
    } else {
      setMessage("Image ready to send.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ""));
      setUrl("");
    };
    reader.readAsDataURL(file);
  }

  function onImageFileChange(event) {
    processImageFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function onImageDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!hasDraggedFiles(event)) return;
    imageDragDepthRef.current += 1;
    setImageDragActive(true);
  }

  function onImageDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (hasDraggedFiles(event)) setImageDragActive(true);
  }

  function onImageDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
    if (imageDragDepthRef.current === 0) setImageDragActive(false);
  }

  function onImageDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    imageDragDepthRef.current = 0;
    setImageDragActive(false);
    const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type?.startsWith("image/"));
    processImageFile(file);
  }

  async function onVideoFileChange(event) {
    const file = event.target.files?.[0];
    setVideoUploadUrl("");
    setVideoFileName("");
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      setMessage("That recording is over 75MB. Try a shorter clip.");
      return;
    }

    setUploadingVideo(true);
    setMessage("Uploading recording...");
    try {
      if (file.size <= DIRECT_VIDEO_UPLOAD_BYTES) {
        const formData = new FormData();
        formData.append("file", file);
        setMessage("Converting recording to projector video...");
        const directResponse = await fetch("/api/projector/upload-video", {
          method: "POST",
          body: formData,
        });
        const directPayload = await readJsonResponse(directResponse, "Could not convert the recording.");
        if (!directResponse.ok) {
          throw new Error(directPayload.error || "Could not convert the recording.");
        }

        setVideoUploadUrl(directPayload.url);
        setVideoFileName(file.name);
        setUrl("");
        setMessage("Recording is ready to send.");
        return;
      }

      const prepareResponse = await fetch("/api/projector/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          fileName: file.name,
          contentType: file.type || "video/quicktime",
          size: file.size,
        }),
      });
      const preparePayload = await readJsonResponse(prepareResponse, "Could not prepare the recording upload.");
      if (!prepareResponse.ok) {
        throw new Error(preparePayload.error || "Could not prepare the recording upload.");
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(preparePayload.bucket)
        .uploadToSignedUrl(preparePayload.path, preparePayload.token, file, {
          contentType: file.type || "video/quicktime",
        });
      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setMessage("Converting recording to projector video...");
      const convertResponse = await fetch("/api/projector/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", path: preparePayload.path }),
      });
      const convertPayload = await readJsonResponse(convertResponse, "Could not convert the recording.");
      if (!convertResponse.ok) {
        throw new Error(convertPayload.error || "Could not convert the recording.");
      }

      setVideoUploadUrl(convertPayload.url);
      setVideoFileName(file.name);
      setUrl("");
      setMessage("Recording is ready to send.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploadingVideo(false);
    }
  }

  async function sendContent() {
    pausePlaylistForManualAction();
    stopTimedRotationForManualAction();
    setSending(true);
    setMessage("");
    const state = currentComposerState();
    const content = state?.content || "";
    const nextTopText = state?.topText || "";

    try {
      const takeoverEnded = await endTakeoverForManualAction();
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          screenIds: targetScreenIds,
          type,
          content,
          topText: nextTopText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not send content.");

      if (payload.screenStates) {
        applyScreenStates(payload.screenStates);
      } else {
        setScreenStates((current) => {
          const next = { ...current };
          targetScreenIds.forEach((screenId) => {
            next[screenId] = nextTopText ? { type, content, topText: nextTopText } : { type, content };
          });
          return next;
        });
      }
      setMessage(`${takeoverEnded || payload.takeoverEnded ? "Screen takeover ended. " : ""}Sent to ${targetDescription}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function sendWorkEntry(entry) {
    if (!entry?.url) return;
    const caption = showWorkCaption ? workEntryCaption(entry) : "";
    pausePlaylistForManualAction();
    stopTimedRotationForManualAction();
    setWorkQueueBusy(true);
    setMessage("");
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          screenIds: targetScreenIds,
          type: "image",
          content: entry.url,
          caption,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not send submitted work.");

      if (payload.screenStates) applyScreenStates(payload.screenStates);

      const markResponse = await fetch("/api/projector/work-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-sent", entryId: entry.id }),
      });
      const markPayload = await markResponse.json().catch(() => ({}));
      if (markResponse.ok && markPayload.entry) {
        setWorkQueue((current) => current.map((item) => (item.id === markPayload.entry.id ? markPayload.entry : item)));
      }
      setMessage(`${takeoverEnded || payload.takeoverEnded ? "Screen takeover ended. " : ""}Submitted work sent to ${targetDescription}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorkQueueBusy(false);
    }
  }

  async function saveWorkEntryToLibrary(entry) {
    if (!entry?.url) return;
    setWorkQueueBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-library-item",
          title: `${entry.screenName || "Submitted work"} ${formatQueueTime(entry.createdAt)}`,
          type: "image",
          content: entry.url,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save submitted work.");
      if (payload.item) addAutoSavedItems([payload.item]);
      setMessage("Submitted work saved to Items.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorkQueueBusy(false);
    }
  }

  async function deleteWorkEntry(entryId) {
    setWorkQueueBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projector/work-queue?entryId=${encodeURIComponent(entryId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not delete submitted work.");
      setWorkQueue((current) => current.filter((entry) => entry.id !== entryId));
      setPreviewWorkEntry((current) => (current?.id === entryId ? null : current));
      setMessage("Submitted work deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorkQueueBusy(false);
    }
  }

  async function clearWorkQueue() {
    if (!workQueue.length) return;
    if (!window.confirm("Clear all submitted work from the queue?")) return;
    setWorkQueueBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector/work-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not clear submitted work.");
      setWorkQueue([]);
      setPreviewWorkEntry(null);
      setMessage("Submitted work queue cleared.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorkQueueBusy(false);
    }
  }

  async function rotateScreens(direction = "forward", options = {}) {
    const manual = options.manual !== false;
    if (manual) {
      pausePlaylistForManualAction();
      stopTimedRotationForManualAction();
    }
    setSending(true);
    if (manual) setMessage("");
    try {
      const takeoverEnded = manual ? await endTakeoverForManualAction() : false;
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-screens", direction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rotate screens.");
      applyScreenStates(payload.screenStates || {});
      if (!manual) {
        setTimedRotation((current) =>
          current.status === "running" ? { ...current, remainingSeconds: current.intervalSeconds } : current
        );
      }
      if (manual) {
        const actionMessage = direction === "backward" ? "Screens rotated left." : "Screens rotated right.";
        setMessage(`${takeoverEnded || payload.takeoverEnded ? "Screen takeover ended. " : ""}${actionMessage}`);
      }
    } catch (error) {
      setMessage(error.message);
      if (!manual) stopTimedRotation();
    } finally {
      setSending(false);
    }
  }

  function openTimedRotationPrompt() {
    if (activeScreenIds.length < 2) {
      setMessage("Turn on at least two active screens before starting timed rotation.");
      return;
    }
    setRotationPromptOpen(true);
  }

  async function startTimedRotation() {
    const intervalSeconds = Math.min(Math.max(Number(rotationIntervalSeconds) || 15, 3), 3600);
    const direction = rotationDirection === "backward" ? "backward" : "forward";
    if (activeScreenIds.length < 2) {
      setMessage("Turn on at least two active screens before starting timed rotation.");
      return;
    }
    setSending(true);
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      stopPlaylist("Playlist stopped because timed screen rotation started.");
      clearTimedRotationTimer();
      setRotationPromptOpen(false);
      setTimedRotation({ status: "running", intervalSeconds, remainingSeconds: intervalSeconds, direction });
      setMessage(`${takeoverEnded ? "Screen takeover ended. " : ""}Timed screen rotation started: every ${intervalSeconds}s.`);
      timedRotationCountdownRef.current = window.setInterval(() => {
        setTimedRotation((current) => {
          if (current.status !== "running") return current;
          const nextRemainingSeconds = current.remainingSeconds <= 1
            ? current.intervalSeconds
            : current.remainingSeconds - 1;
          return { ...current, remainingSeconds: nextRemainingSeconds };
        });
      }, 1000);
      timedRotationIntervalRef.current = window.setInterval(() => {
        rotateScreens(direction, { manual: false });
      }, intervalSeconds * 1000);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleRevealAnswer(screenId) {
    setSending(true);
    setMessage("");
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal-answer", screenId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not reveal that answer.");
      if (payload.screenStates) {
        applyScreenStates(payload.screenStates);
      } else {
        setScreenStates((current) => ({ ...current, [screenId]: payload.state || current[screenId] || null }));
      }
      const actionMessage = payload.state?.revealAnswer ? `Screen ${screenId} answer revealed.` : `Screen ${screenId} answer hidden.`;
      setMessage(`${takeoverEnded || payload.takeoverEnded ? "Screen takeover ended. " : ""}${actionMessage}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function clearScreens() {
    pausePlaylistForManualAction();
    stopTimedRotationForManualAction();
    setSending(true);
    setMessage("");
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      let latestScreenStates = null;
      for (const screenId of targetScreenIds) {
        const response = await fetch("/api/projector", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not clear content.");
        if (payload.screenStates) latestScreenStates = payload.screenStates;
      }
      if (latestScreenStates) {
        applyScreenStates(latestScreenStates);
      } else {
        setScreenStates((current) => {
          const next = { ...current };
          targetScreenIds.forEach((screenId) => {
            next[screenId] = null;
          });
          return next;
        });
      }
      setMessage(`${takeoverEnded ? "Screen takeover ended. " : ""}Cleared ${targetDescription}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  function openPlaylistStart(playlist) {
    const entries = normalizePlaylistEntries(playlist.entries);
    if (!entries.length) {
      setMessage(`Add entries to "${playlist.name}" before playing it.`);
      return;
    }
    setPlaylistStartPrompt(playlist);
    setPlaylistTargetScreens(activeScreenIds);
  }

  function togglePlaylistTarget(screenId) {
    setPlaylistTargetScreens((current) => {
      if (current.includes(screenId)) {
        const next = current.filter((id) => id !== screenId);
        return next.length ? next : current;
      }
      return [...current, screenId];
    });
  }

  function chooseAllPlaylistTargets() {
    setPlaylistTargetScreens(activeScreenIds);
  }

  function promptForPlaylistAssignment(scene, playlistName) {
    return new Promise((resolve) => {
      assignmentResolverRef.current = resolve;
      setAssignmentPrompt({
        mode: "playlist",
        sceneId: scene.id,
        title: scene.title,
        sceneScreens: sceneSavedScreenIds(scene).map((screenId) => ({
          screenId,
          state: scene.screen_states?.[screenId] || null,
        })),
        roomScreens: activeScreenIds,
      });
      setAssignments({});
      setMessage(`"${playlistName}" needs a screen assignment for "${scene.title}" before it can play.`);
    });
  }

  async function collectPlaylistAssignments(entries, playlistName) {
    const assignmentsBySceneId = {};
    for (const entry of entries) {
      if (entry.type !== "scene" || assignmentsBySceneId[entry.refId]) continue;
      const scene = scenes.find((candidate) => candidate.id === entry.refId);
      if (!scene) throw new Error("One playlist scene is missing from your saved scenes.");
      if (sceneSavedScreenIds(scene).length <= activeScreenIds.length) continue;
      const sceneAssignments = await promptForPlaylistAssignment(scene, playlistName);
      if (!sceneAssignments) return null;
      assignmentsBySceneId[scene.id] = sceneAssignments;
    }
    return assignmentsBySceneId;
  }

  function finishPlaylist(playlist, loop, entries, assignmentsBySceneId, targetScreens, currentIndex) {
    if (loop && entries.length) {
      playPlaylistEntry(playlist, entries, assignmentsBySceneId, targetScreens, 0, loop);
      return;
    }
    clearPlaylistTimers();
    setPlaylistState((current) => ({
      ...current,
      status: "finished",
      playlistId: playlist.id,
      index: currentIndex,
      remainingSeconds: 0,
      loop,
      assignmentsBySceneId,
      targetScreens,
    }));
    setMessage(`Finished "${playlist.name}".`);
  }

  async function sendPlaylistEntry(entry, targetScreens, assignmentsBySceneId) {
    playlistActionRef.current = true;
    try {
      if (entry.type === "item") {
        const item = library.find((candidate) => candidate.id === entry.refId);
        if (!item) throw new Error("One playlist item is missing from your saved items.");
        const response = await fetch("/api/projector", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "push",
            screenIds: targetScreens,
            type: item.content_type,
            content: item.content,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not send playlist item.");
        setScreenStates((current) => {
          const next = { ...current };
          targetScreens.forEach((screenId) => {
            next[screenId] = { type: item.content_type, content: item.content };
          });
          return next;
        });
        return;
      }

      const scene = scenes.find((candidate) => candidate.id === entry.refId);
      if (!scene) throw new Error("One playlist scene is missing from your saved scenes.");
      const { response, payload } = await postLoadScene(scene, assignmentsBySceneId[scene.id] || null);
      if (payload.needsAssignment) throw new Error("This scene needs a screen assignment before the playlist can continue.");
      if (!response.ok) throw new Error(payload.error || "Could not load playlist scene.");
      setScreenStates(payload.screenStates || {});
    } finally {
      playlistActionRef.current = false;
    }
  }

  async function playPlaylistEntry(playlist, entries, assignmentsBySceneId, targetScreens, index, loop = playlist.loop === true) {
    if (!entries.length) return;
    const safeIndex = (index + entries.length) % entries.length;
    const entry = entries[safeIndex];
    clearPlaylistTimers();
    setPlaylistState({
      status: "running",
      playlistId: playlist.id,
      index: safeIndex,
      remainingSeconds: entry.durationSeconds,
      loop,
      assignmentsBySceneId,
      targetScreens,
    });
    setMessage(`Playing "${playlistEntryLabel(entry, library, scenes)}" from "${playlist.name}".`);

    try {
      await sendPlaylistEntry(entry, targetScreens, assignmentsBySceneId);
      playlistCountdownRef.current = window.setInterval(() => {
        setPlaylistState((current) => {
          if (current.status !== "running" || current.playlistId !== playlist.id) return current;
          return { ...current, remainingSeconds: Math.max(current.remainingSeconds - 1, 0) };
        });
      }, 1000);
      playlistTimeoutRef.current = window.setTimeout(() => {
        const nextIndex = safeIndex + 1;
        const shouldLoop = playlistStateRef.current.playlistId === playlist.id
          ? playlistStateRef.current.loop
          : loop;
        if (nextIndex >= entries.length) {
          finishPlaylist(playlist, shouldLoop, entries, assignmentsBySceneId, targetScreens, safeIndex);
        } else {
          playPlaylistEntry(playlist, entries, assignmentsBySceneId, targetScreens, nextIndex, shouldLoop);
        }
      }, entry.durationSeconds * 1000);
    } catch (error) {
      clearPlaylistTimers();
      setPlaylistState((current) => ({ ...current, status: "paused", remainingSeconds: 0 }));
      setMessage(error.message);
    }
  }

  async function startPlaylist(playlist = playlistStartPrompt) {
    if (!playlist) return;
    const entries = normalizePlaylistEntries(playlist.entries);
    if (!entries.length) {
      setMessage(`Add entries to "${playlist.name}" before playing it.`);
      return;
    }
    if (!playlistTargetScreens.length) {
      setMessage("Choose at least one screen for playlist items.");
      return;
    }
    setPlaylistStartPrompt(null);
    try {
      const takeoverEnded = await endTakeoverForManualAction();
      const assignmentsBySceneId = await collectPlaylistAssignments(entries, playlist.name);
      if (!assignmentsBySceneId) {
        setMessage("Playlist start cancelled.");
        return;
      }
      setSavingScene(true);
      await playPlaylistEntry(playlist, entries, assignmentsBySceneId, playlistTargetScreens, 0, playlist.loop === true);
      if (takeoverEnded) setMessage(`Screen takeover ended. Playing "${playlistEntryLabel(entries[0], library, scenes)}" from "${playlist.name}".`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  function resumePlaylist() {
    if (!currentPlaylist || playlistState.status !== "paused") return;
    const entries = normalizePlaylistEntries(currentPlaylist.entries);
    if (!entries.length) return;
    const nextIndex = playlistState.index + 1 >= entries.length ? 0 : playlistState.index + 1;
    if (playlistState.index + 1 >= entries.length && !playlistState.loop) {
      setPlaylistState((current) => ({ ...current, status: "finished", remainingSeconds: 0 }));
      setMessage(`Finished "${currentPlaylist.name}".`);
      return;
    }
    playPlaylistEntry(
      currentPlaylist,
      entries,
      playlistState.assignmentsBySceneId,
      playlistState.targetScreens,
      nextIndex,
      playlistState.loop
    );
  }

  function advancePlaylist(delta) {
    if (!currentPlaylist || !["running", "paused", "finished"].includes(playlistState.status)) return;
    const entries = normalizePlaylistEntries(currentPlaylist.entries);
    if (!entries.length) return;
    const nextIndex = (playlistState.index + delta + entries.length) % entries.length;
    playPlaylistEntry(
      currentPlaylist,
      entries,
      playlistState.assignmentsBySceneId,
      playlistState.targetScreens.length ? playlistState.targetScreens : activeScreenIds,
      nextIndex,
      playlistState.loop
    );
  }

  function toggleRunningPlaylistLoop() {
    setPlaylistState((current) => ({ ...current, loop: !current.loop }));
  }

  return (
    <div className="projectorDashboard">
      {assignmentPrompt ? (
        <div
          className="projectorAssignmentOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingScene) cancelAssignment();
          }}
        >
          <section
            className="projectorAssignmentModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projector-assignment-title"
          >
            <div className="projectorAssignmentHeader">
              <div>
                <p className="eyebrow">Assign Scene Screens</p>
                <h2 id="projector-assignment-title">{assignmentPrompt.title}</h2>
                <p className="projectorAssignmentHint">
                  This scene has more saved screens than your active Room. Choose which room screen shows
                  each item. Items left on “Skip” are not shown.
                </p>
              </div>
              <button
                className="projectorAssignmentClose"
                type="button"
                onClick={cancelAssignment}
                disabled={savingScene}
                aria-label="Close assignment chooser"
              >
                ✕
              </button>
            </div>

            <div className="projectorAssignmentList">
              {assignmentPrompt.sceneScreens.map((sceneScreen) => {
                const takenElsewhere = new Set(
                  Object.entries(assignments)
                    .filter(([key]) => key !== sceneScreen.screenId)
                    .map(([, value]) => value)
                );
                const selected = assignments[sceneScreen.screenId] || "";
                return (
                  <article className="projectorAssignmentItem" key={sceneScreen.screenId}>
                    <span className="projectorAssignmentThumb" aria-hidden="true">
                      {renderContent(sceneScreen.state, true)}
                    </span>
                    <div className="projectorAssignmentItemBody">
                      <strong>Scene Screen {sceneScreen.screenId}</strong>
                      <label>
                        <span>Show on</span>
                        <select
                          value={selected}
                          onChange={(event) => assignSceneScreen(sceneScreen.screenId, event.target.value)}
                          disabled={savingScene}
                        >
                          <option value="">Skip this item</option>
                          {assignmentPrompt.roomScreens.map((roomScreenId) => (
                            <option
                              key={roomScreenId}
                              value={roomScreenId}
                              disabled={takenElsewhere.has(roomScreenId)}
                            >
                              Screen {roomScreenId}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="projectorAssignmentFooter">
              <button className="btn secondary" type="button" onClick={cancelAssignment} disabled={savingScene}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                onClick={confirmAssignment}
                disabled={savingScene || Object.keys(assignments).length === 0}
              >
                Load Assigned Screens
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {playlistStartPrompt ? (
        <div
          className="projectorPlaylistOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingScene) setPlaylistStartPrompt(null);
          }}
        >
          <section className="projectorPlaylistTargetModal" role="dialog" aria-modal="true" aria-labelledby="projector-playlist-target-title">
            <div className="projectorAssignmentHeader">
              <div>
                <p className="eyebrow">Playlist Targets</p>
                <h2 id="projector-playlist-target-title">{playlistStartPrompt.name}</h2>
                <p className="projectorAssignmentHint">
                  Choose which active Room screens should receive saved item entries. Scene entries load the whole active Room.
                </p>
              </div>
              <button className="projectorAssignmentClose" type="button" onClick={() => setPlaylistStartPrompt(null)} disabled={savingScene}>
                ✕
              </button>
            </div>
            <div className="projectorPlaylistTargetGrid">
              {activeScreenIds.map((screenId) => (
                <button
                  className={playlistTargetScreens.includes(screenId) ? "isActive" : ""}
                  key={screenId}
                  type="button"
                  onClick={() => togglePlaylistTarget(screenId)}
                >
                  Screen {screenId}
                </button>
              ))}
            </div>
            <div className="projectorAssignmentFooter">
              <button className="btn secondary" type="button" onClick={chooseAllPlaylistTargets}>
                All Screens
              </button>
              <button className="btn secondary" type="button" onClick={() => setPlaylistStartPrompt(null)} disabled={savingScene}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => startPlaylist()} disabled={savingScene || !playlistTargetScreens.length}>
                Start Playlist
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {rotationPromptOpen ? (
        <div
          className="projectorPlaylistOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRotationPromptOpen(false);
          }}
        >
          <section className="projectorTimedRotationModal" role="dialog" aria-modal="true" aria-labelledby="projector-timed-rotation-title">
            <div className="projectorAssignmentHeader">
              <div>
                <p className="eyebrow">Screen Rotation</p>
                <h2 id="projector-timed-rotation-title">Timed Rotate</h2>
                <p className="projectorAssignmentHint">
                  Rotate the current content across active screens on a timer. Inactive screens stay untouched.
                </p>
              </div>
              <button className="projectorAssignmentClose" type="button" onClick={() => setRotationPromptOpen(false)}>
                ✕
              </button>
            </div>
            <div className="projectorTimedRotationFields">
              <label className="field">
                <span>Seconds Between Rotations</span>
                <input
                  type="number"
                  min="3"
                  max="3600"
                  value={rotationIntervalSeconds}
                  onChange={(event) => setRotationIntervalSeconds(Math.min(Math.max(Number(event.target.value) || 15, 3), 3600))}
                />
              </label>
              <label className="field">
                <span>Direction</span>
                <select value={rotationDirection} onChange={(event) => setRotationDirection(event.target.value)}>
                  <option value="forward">Rotate Right</option>
                  <option value="backward">Rotate Left</option>
                </select>
              </label>
            </div>
            <div className="projectorAssignmentFooter">
              <button className="btn secondary" type="button" onClick={() => setRotationPromptOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={startTimedRotation}>
                Start Timed Rotate
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {previewWorkEntry ? (
        <div className="projectorPlaylistOverlay" role="presentation" onClick={() => setPreviewWorkEntry(null)}>
          <section
            className="projectorWorkPreviewModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projector-work-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="projectorAssignmentHeader">
              <div>
                <p className="eyebrow">Submitted work</p>
                <h2 id="projector-work-preview-title">{previewWorkEntry.screenName}</h2>
                <p className="projectorAssignmentHint">
                  {formatQueueTime(previewWorkEntry.createdAt)} · send to {targetDescription}
                </p>
                {(previewWorkEntry.studentName || previewWorkEntry.label) ? (
                  <p className="projectorWorkPreviewMeta">
                    {previewWorkEntry.studentName ? <span>Name: {previewWorkEntry.studentName}</span> : null}
                    {previewWorkEntry.label ? <span>Question: {previewWorkEntry.label}</span> : null}
                  </p>
                ) : null}
              </div>
              <button className="projectorAssignmentClose" type="button" onClick={() => setPreviewWorkEntry(null)}>
                ✕
              </button>
            </div>
            <div className="projectorWorkPreviewImage">
              <img src={previewWorkEntry.url} alt={`Submitted work from ${previewWorkEntry.screenName}`} />
            </div>
            <label className="projectorWorkCaptionToggle">
              <input
                type="checkbox"
                checked={showWorkCaption}
                onChange={(event) => setShowWorkCaption(event.target.checked)}
              />
              <span>Show name on screens</span>
            </label>
            <div className="projectorAssignmentFooter">
              <button className="btn" type="button" onClick={() => sendWorkEntry(previewWorkEntry)} disabled={workQueueBusy}>
                Send to {targetDescription}
              </button>
              <button className="btn secondary" type="button" onClick={() => saveWorkEntryToLibrary(previewWorkEntry)} disabled={workQueueBusy}>
                Save to Items
              </button>
              <button className="btn secondary" type="button" onClick={() => deleteWorkEntry(previewWorkEntry.id)} disabled={workQueueBusy}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <section className="projectorHeader">
        <div>
          <p className="eyebrow">Projector Party</p>
          <h1>Projector</h1>
        </div>
        <div className="projectorPin">
          <span>Room PIN</span>
          <strong>{session.pin}</strong>
        </div>
      </section>

      {takeoverState ? (
        <section className="projectorTakeoverDock" aria-label="Screen takeover">
          <div>
            <p className="eyebrow">Screen takeover running</p>
            <h2>Screen {takeoverState.sourceScreenId} is showing on all screens</h2>
            <span>{takeoverState.activeScreenIds.length} active screens are mirrored. End takeover to restore the held contents.</span>
          </div>
          <button type="button" onClick={endTakeoverFromDock} disabled={sending}>
            End takeover
          </button>
        </section>
      ) : null}

      {currentPlaylist ? (
        <section className={`projectorPlaylistDock is-${playlistState.status}`} aria-label="Playlist playback">
          <div>
            <p className="eyebrow">Playlist {playlistState.status}</p>
            <h2>{currentPlaylist.name}</h2>
            <span>
              {playlistEntryLabel(currentPlaylistEntry, library, scenes)} · {playlistState.index + 1}/{currentPlaylistEntries.length || 1}
            </span>
          </div>
          <div className="projectorPlaylistCountdown" aria-live="polite">
            {playlistState.status === "running" ? `${playlistState.remainingSeconds}s` : playlistState.status}
          </div>
          <div className="projectorPlaylistTransport">
            <button type="button" onClick={() => advancePlaylist(-1)} disabled={!currentPlaylistEntries.length}>
              Previous
            </button>
            {playlistState.status === "running" ? (
              <button type="button" onClick={() => pausePlaylist("Playlist paused.")}>Pause</button>
            ) : (
              <button type="button" onClick={resumePlaylist} disabled={playlistState.status === "finished"}>
                Play
              </button>
            )}
            <button type="button" onClick={() => advancePlaylist(1)} disabled={!currentPlaylistEntries.length}>
              Next
            </button>
            <button className={playlistState.loop ? "isActive" : ""} type="button" onClick={toggleRunningPlaylistLoop}>
              Loop {playlistState.loop ? "On" : "Off"}
            </button>
            <button type="button" onClick={() => stopPlaylist("Playlist stopped.")}>Stop</button>
          </div>
        </section>
      ) : null}

      {timedRotation.status === "running" ? (
        <section className="projectorTimedRotationDock" aria-label="Timed screen rotation">
          <div>
            <p className="eyebrow">Screen rotation running</p>
            <h2>Next rotation in {timedRotation.remainingSeconds || timedRotation.intervalSeconds}s</h2>
            <span>
              {timedRotation.direction === "backward" ? "Rotate Left" : "Rotate Right"} every{" "}
              {timedRotation.intervalSeconds}s across {activeScreenIds.length} active screens
            </span>
          </div>
          <button type="button" onClick={() => stopTimedRotation("Timed screen rotation stopped.")}>
            Stop
          </button>
        </section>
      ) : null}

      {schedulePrompt ? (
        <section className="projectorSchedulePrompt" aria-label="Scheduled Room prompt">
          <div>
            <p className="eyebrow">Current schedule</p>
            <h2>{scheduleBlockName(schedulePrompt)} — switch to {schedulePrompt.roomName || "scheduled Room"}?</h2>
            <span>{String(schedulePrompt.startTime || "").slice(0, 5)}-{String(schedulePrompt.endTime || "").slice(0, 5)}</span>
          </div>
          <div className="projectorSchedulePromptActions">
            <button className="btn" type="button" onClick={switchToScheduledRoom} disabled={sending}>
              Switch
            </button>
            <button className="btn secondary" type="button" onClick={dismissSchedulePrompt} disabled={sending}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <div className="projectorLayout">
        <div className="projectorGridColumn">
          <section className="projectorGrid" aria-label="Projector screens">
            {roomScreenIds.map((screenId) => {
              const slot = slotForScreen(activeRoom, screenId);
              const isEnabled = slot?.enabled !== false;
              const canDisable = isEnabled && activeScreenIds.length <= 1;
              const takeoverSource = takeoverState?.sourceScreenId === screenId;
              const takeoverMirrored = Boolean(takeoverState && takeoverState.activeScreenIds.includes(screenId));
              const displayState = screenStateForDisplay(screenId);
              return (
                <article
                  className={`projectorScreenCard${isEnabled ? "" : " isInactive"}${takeoverSource ? " isTakeoverSource" : ""}${takeoverMirrored && !takeoverSource ? " isTakeoverMirror" : ""}`}
                  key={screenId}
                >
                  <div className="projectorScreenCardHeader">
                    <div className="projectorScreenTitleRow">
                      <strong>{slot?.name || `Screen ${screenId}`}</strong>
                      <span className={`projectorScreenActiveTag${isEnabled ? "" : " isInactive"}`}>
                        {isEnabled ? "Active" : "Inactive"}
                      </span>
                      <button
                        className="projectorScreenEdit"
                        type="button"
                        onClick={() => editScreenContent(screenId)}
                        disabled={!screenStates?.[screenId]?.type}
                      >
                        Edit
                      </button>
                    </div>
                    <span>{displayState?.type || "empty"}</span>
                  </div>
                  <ProjectorReceiverPreview enabled={isEnabled} state={displayState} />
                  {isQuestionState(screenStates?.[screenId]) ? (
                    <button
                      className="btn secondary projectorRevealAnswerButton"
                      type="button"
                      onClick={() => toggleRevealAnswer(screenId)}
                      disabled={sending || !isEnabled}
                    >
                      {screenStates?.[screenId]?.revealAnswer ? "Hide Answer" : "Reveal Answer"}
                    </button>
                  ) : null}
                  {isEnabled ? (
                    <button
                      className="btn secondary projectorTakeoverButton"
                      type="button"
                      onClick={() => startTakeover(screenId)}
                      disabled={sending || Boolean(takeoverState) || !screenStates?.[screenId]?.type}
                    >
                      Show on all
                    </button>
                  ) : null}
                  <button
                    className={`projectorScreenToggle${isEnabled ? "" : " isInactive"}`}
                    type="button"
                    onClick={() => toggleActiveRoomScreen(screenId, !isEnabled)}
                    disabled={sending || canDisable}
                  >
                    {isEnabled ? "Make Inactive" : "Make Active"}
                  </button>
                  <div className="projectorScreenUrl">
                    <code>{`${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`}</code>
                    <button className="btn secondary" type="button" onClick={() => copyUrl(screenId)}>
                      Copy
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
          <div className="projectorRotateRow">
            <button className="btn secondary" type="button" onClick={() => rotateScreens("backward")} disabled={sending}>
              ↶ Rotate Left
            </button>
            <button className="btn secondary" type="button" onClick={() => rotateScreens("forward")} disabled={sending}>
              ↷ Rotate Right
            </button>
            <button className="btn secondary" type="button" onClick={openTimedRotationPrompt} disabled={sending || activeScreenIds.length < 2}>
              ⟳ Timed Rotate
            </button>
          </div>
          <div className="projectorSceneSaveRow" aria-label="Save current screens as a scene">
            <label className="field">
              <span>Save Current Screens As</span>
              <input
                value={sceneTitle}
                onChange={(event) => setSceneTitle(event.target.value)}
                placeholder="Start of Class, Exit Ticket..."
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Folder</span>
              <select value={sceneFolderId} onChange={(event) => setSceneFolderId(event.target.value)}>
                <option value="">Uncategorized</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </label>
            {showSceneSaveFolderForm ? (
              <div className="projectorSceneSaveFolderCreator">
                <label className="field">
                  <span>New Folder</span>
                  <input
                    value={newFolderTitle}
                    onChange={(event) => setNewFolderTitle(event.target.value)}
                    placeholder="Period 1, Warmups..."
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <button className="btn secondary" type="button" onClick={createSceneFolder} disabled={savingScene || !newFolderTitle.trim()}>
                  Add Folder
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setShowSceneSaveFolderForm(false);
                    setNewFolderTitle("");
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn secondary" type="button" onClick={() => setShowSceneSaveFolderForm(true)}>
                + New Folder
              </button>
            )}
            <button className="btn secondary" type="button" onClick={saveScene} disabled={savingScene}>
              Save Scene
            </button>
            {loadedScene ? (
              <button className="btn secondary projectorSceneUpdateButton" type="button" onClick={updateLoadedScene} disabled={savingScene}>
                Update &quot;{loadedScene.title}&quot;
              </button>
            ) : null}
          </div>
        </div>

        <aside className="projectorComposer">
          {!workQueueSetupMissing ? (
            <section className="projectorLibrary projectorWorkQueue" aria-label="Submitted work queue">
              <button
                className="projectorLibraryHeader projectorPanelToggle"
                type="button"
                onClick={() => togglePanel("workQueue")}
              >
                <div className="projectorPlaylistsLauncherSummary">
                  <h2>
                    Submitted Work <span className="projectorLibraryLaunchCount">{workQueue.length}</span>
                  </h2>
                  <p className="projectorRoomsActive">
                    {newWorkCount ? `${newWorkCount} new photo${newWorkCount === 1 ? "" : "s"}` : "Teacher approval queue"}
                  </p>
                </div>
                <strong className="projectorPanelChevron">{openPanels.workQueue ? "Hide" : "Show"}</strong>
              </button>
              {openPanels.workQueue ? (
                <div className="projectorPanelBody">
                  <div className="projectorWorkQueueActions">
                    <button className="btn secondary" type="button" onClick={() => loadWorkQueue()} disabled={workQueueBusy}>
                      Refresh
                    </button>
                    <button className="btn secondary" type="button" onClick={clearWorkQueue} disabled={workQueueBusy || !workQueue.length}>
                      Clear Queue
                    </button>
                    <label className="projectorWorkCaptionToggle">
                      <input
                        type="checkbox"
                        checked={showWorkCaption}
                        onChange={(event) => setShowWorkCaption(event.target.checked)}
                      />
                      <span>Show name</span>
                    </label>
                  </div>
                  <div className="projectorWorkQueueList">
                    {workQueue.length ? (
                      workQueue.map((entry) => (
                        <article className={`projectorWorkQueueItem${entry.status === "sent" ? " isSent" : ""}`} key={entry.id}>
                          <button className="projectorWorkQueueThumb" type="button" onClick={() => setPreviewWorkEntry(entry)}>
                            <img src={entry.url} alt={`Submitted work from ${entry.screenName}`} />
                          </button>
                          <div className="projectorWorkQueueInfo">
                            <strong>{entry.screenName}</strong>
                            {(entry.studentName || entry.label) ? (
                              <div className="projectorWorkQueueMeta">
                                {entry.studentName ? <span title={entry.studentName}>{entry.studentName}</span> : null}
                                {entry.label ? <span title={entry.label}>{entry.label}</span> : null}
                              </div>
                            ) : null}
                            <span>
                              {formatQueueTime(entry.createdAt)}
                              {entry.status === "sent" ? " · sent" : ""}
                            </span>
                            <div className="projectorWorkQueueControls">
                              <button type="button" onClick={() => setPreviewWorkEntry(entry)} disabled={workQueueBusy}>
                                Preview
                              </button>
                              <button type="button" onClick={() => sendWorkEntry(entry)} disabled={workQueueBusy || !targetScreenIds.length}>
                                Send
                              </button>
                              <button type="button" onClick={() => saveWorkEntryToLibrary(entry)} disabled={workQueueBusy}>
                                Save
                              </button>
                              <button type="button" onClick={() => deleteWorkEntry(entry.id)} disabled={workQueueBusy}>
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="projectorLibraryEmpty">No submitted work yet.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          {!playlistsSetupMissing ? (
            <section className="projectorLibrary projectorPlaylistsLauncher" aria-label="Projector Playlists">
              <button
                className="projectorLibraryHeader projectorPanelToggle"
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("projector:open-playlists"))}
              >
                <div className="projectorPlaylistsLauncherSummary">
                  <h2>
                    Playlists <span className="projectorLibraryLaunchCount">{playlists.length}</span>
                  </h2>
                  <p className="projectorRoomsActive">
                    {currentPlaylist ? `Now: ${currentPlaylist.name}` : "Timed rotations"}
                  </p>
                </div>
              </button>
            </section>
          ) : null}
          <ProjectorSceneWorkshop
            activeRoom={activeRoom}
            folders={folders}
            libraryItems={library}
            sceneItems={scenes}
            onFoldersChanged={updateFoldersAndSync}
            onScenesSaved={addWorkshopScenes}
            onSceneUpdated={updateSceneInLibrary}
            onItemsSaved={addAutoSavedItems}
          />
          <SidebarPanel
            ariaLabel="Screen Selection"
            count={targetSummary}
            eyebrow="Controls"
            onToggle={() => togglePanel("screens")}
            open={openPanels.screens}
            title="Screen Selection"
          >
            <div className="projectorTargetPicker" aria-label="Screen Selection">
              <button
                className={`projectorTargetAll${targetMode === "all" ? " isActive" : ""}`}
                type="button"
                aria-pressed={targetMode === "all"}
                onClick={chooseAllTargetScreens}
              >
                All
              </button>
              <div className="projectorTargetButtons">
                {ALL_SCREEN_IDS.map((screenId) => {
                  const available = activeScreenIds.includes(screenId);
                  const selected = targetMode === "custom" && targetScreenIds.includes(screenId);
                  return (
                    <button
                      className={selected ? "isActive" : ""}
                      key={screenId}
                      type="button"
                      disabled={!available}
                      aria-pressed={selected}
                      onClick={() => toggleTargetScreen(screenId)}
                    >
                      {screenId}
                    </button>
                  );
                })}
              </div>
              <p className="projectorTargetSummary">Sending to {targetDescription}.</p>
            </div>
            <div className="projectorTabs" role="tablist" aria-label="Content Type">
              {["text", "latex", "image", "video"].map((tab) => (
                <button
                  className={type === tab ? "isActive" : ""}
                  key={tab}
                  type="button"
                  onClick={() => setType(tab)}
                >
                  {tab === "latex" ? "LaTeX" : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="projectorComposerToggles" aria-label="Composer options">
              {type !== "text" || questionMode ? (
                <button
                  className={showTopText ? "isActive" : ""}
                  type="button"
                  onClick={() => setShowTopText((current) => !current)}
                >
                  Top Text
                </button>
              ) : null}
              <button
                className={questionMode === "fill_blank" ? "isActive" : ""}
                type="button"
                onClick={() => {
                  setQuestionMode((current) => (current === "fill_blank" ? "" : "fill_blank"));
                  setLibraryCategory((current) => (!questionMode && !current ? "Questions" : current));
                }}
              >
                Fill In The Blank
              </button>
              <button
                className={questionMode === "multiple_choice" ? "isActive" : ""}
                type="button"
                onClick={() => {
                  setQuestionMode((current) => (current === "multiple_choice" ? "" : "multiple_choice"));
                  setLibraryCategory((current) => (!questionMode && !current ? "Questions" : current));
                }}
              >
                Multiple Choice
              </button>
            </div>

            {(type !== "text" || questionMode) && showTopText ? (
              <label className="field">
                <span>Top Text</span>
                <textarea
                  value={topText}
                  onChange={(event) => setTopText(event.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </label>
            ) : null}

            {questionMode ? (
              <div className="projectorQuestionBuilder">
                <label className="field">
                  <span>Answer Format</span>
                  <select value={questionAnswerType} onChange={(event) => setQuestionAnswerType(event.target.value)}>
                    <option value="text">Text</option>
                    <option value="latex">LaTeX</option>
                  </select>
                </label>
                {questionMode === "multiple_choice" ? (
                  <>
                    <div className="projectorQuestionBuilderOptions">
                      {QUESTION_OPTION_LABELS.map((label, index) => (
                        <label className="field" key={label}>
                          <span>Choice {label}</span>
                          <input
                            value={questionOptions[index]}
                            onChange={(event) => updateQuestionOption(index, event.target.value)}
                            placeholder={`Choice ${label}`}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="field">
                      <span>Correct Answer</span>
                      <select
                        value={questionCorrectIndex}
                        onChange={(event) => setQuestionCorrectIndex(event.target.value)}
                      >
                        <option value="">No answer marked</option>
                        {QUESTION_OPTION_LABELS.map((label, index) => (
                          <option key={label} value={index} disabled={!questionOptions[index].trim()}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {questionMode === "fill_blank" ? (
                  <label className="field">
                    <span>Answer</span>
                    <input
                      value={fillBlankAnswer}
                      onChange={(event) => setFillBlankAnswer(event.target.value)}
                      placeholder={questionAnswerType === "latex" ? "\\frac{3}{4}" : "Optional answer key"}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {type === "text" ? (
              <>
                <label className="field">
                  <span>Text</span>
                  <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} />
                </label>
                <div className="projectorComposerPreview">
                  {currentComposerState() ? renderContent(currentComposerState()) : <div className="projectorTextPreview">Text Preview</div>}
                </div>
              </>
            ) : null}

            {type === "latex" ? (
              <>
                <label className="field">
                  <span className="projectorLatexLabelRow">
                    <span>LaTeX</span>
                    <span className="projectorLatexInsertButtons" aria-label="LaTeX helpers">
                      <button type="button" onClick={() => insertLatexSnippet("\\frac{}{}", 6)}>
                        Fraction
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\sqrt{}", 6)}>
                        Sqrt
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\uparrow\\;")}>
                        Up
                      </button>
                      <button type="button" onClick={() => insertLatexSnippet("\\downarrow\\;")}>
                        Down
                      </button>
                    </span>
                  </span>
                  <textarea
                    ref={latexTextareaRef}
                    value={latex}
                    onChange={(event) => setLatex(event.target.value)}
                    rows={5}
                  />
                </label>
                <div className="projectorComposerPreview">
                  {renderContent(currentComposerState())}
                </div>
              </>
            ) : null}

            {type === "image" ? (
              <>
                <label className="field">
                  <span>Image Upload</span>
                  <input accept="image/*" type="file" onChange={onImageFileChange} />
                </label>
                <label className="field">
                  <span>Image URL</span>
                  <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
                </label>
                <div
                  className={`projectorComposerPreview projectorImageDropZone ${
                    imageDragActive ? "isDragActive" : ""
                  }`}
                  onDragEnter={onImageDragEnter}
                  onDragOver={onImageDragOver}
                  onDragLeave={onImageDragLeave}
                  onDrop={onImageDrop}
                >
                  {imageDataUrl || url
                    ? renderContent(currentComposerState())
                    : (
                      <span className="projectorImageDropHint">
                        Drop Image Here
                        <small>or choose a file above</small>
                      </span>
                    )}
                </div>
              </>
            ) : null}

            {type === "video" ? (
              <>
                <label className="field">
                  <span>Video Upload</span>
                  <input
                    accept="video/*,.mov,.m4v,.webm"
                    type="file"
                    onChange={onVideoFileChange}
                    disabled={uploadingVideo}
                  />
                </label>
                {videoFileName ? <p className="projectorUploadNote">Ready: {videoFileName}</p> : null}
                <label className="field">
                  <span>Video or GIF URL</span>
                  <input
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setVideoUploadUrl("");
                      setVideoFileName("");
                    }}
                    placeholder="https://.../video.mp4"
                  />
                </label>
                <div className="projectorComposerPreview">
                  {(videoUploadUrl || url) && /\.gif(\?|#|$)/i.test(videoUploadUrl || url) ? (
                    renderContent(currentComposerState())
                  ) : videoUploadUrl || url ? (
                    renderContent(currentComposerState())
                  ) : uploadingVideo ? (
                    "Converting Recording..."
                  ) : (
                    "Upload a Screen Recording or Paste a Hosted MP4/GIF URL"
                  )}
                </div>
              </>
            ) : null}

            <div className="projectorActions">
              <button className="btn" type="button" onClick={sendContent} disabled={sending || uploadingVideo}>
                Send
              </button>
              <button className="btn secondary" type="button" onClick={clearScreens} disabled={sending || uploadingVideo}>
                Clear
              </button>
            </div>
            <div className="projectorComposerSave" aria-label="Save current item">
              <label className="field">
                <span>Save Current Item As</span>
                <input
                  value={libraryTitle}
                  onChange={(event) => setLibraryTitle(event.target.value)}
                  placeholder="Warmup question, word wall..."
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span>Category</span>
                <select value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value)}>
                  <option value="">No Category</option>
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <button
                className="btn secondary"
                type="button"
                onClick={saveLibraryItem}
                disabled={savingLibrary || uploadingVideo}
              >
                Save To Library
              </button>
            </div>
            {message ? <p className="projectorMessage">{message}</p> : null}
          </SidebarPanel>

          <SidebarPanel
            ariaLabel="Saved Room Setups"
            className="projectorSceneLibrary"
            count={scenes.length}
            eyebrow="Scenes"
            onToggle={() => togglePanel("scenes")}
            open={openPanels.scenes}
            title="Scenes"
          >
            <label className="field">
              <span>Save Current Screens As</span>
              <input
                value={sceneTitle}
                onChange={(event) => setSceneTitle(event.target.value)}
                placeholder="Start of Class, Exit Ticket..."
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Folder</span>
              <select value={sceneFolderId} onChange={(event) => setSceneFolderId(event.target.value)}>
                <option value="">Uncategorized</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn secondary" type="button" onClick={saveScene} disabled={savingScene}>
              Save Scene
            </button>
            {loadedScene ? (
              <button className="btn secondary projectorSceneUpdateButton" type="button" onClick={updateLoadedScene} disabled={savingScene}>
                Update &quot;{loadedScene.title}&quot;
              </button>
            ) : null}

            {/* Uncategorized folder */}
            {(() => {
              const uncatScenes = scenes.filter((scene) => !scene.folder_id);
              const isOpen = openFolderIds.has("uncategorized");
              return (
                <div className="projectorSceneFolderSection">
                  <div className="projectorSceneFolderHeader">
                    <button
                      className="projectorSceneFolderToggle"
                      type="button"
                      onClick={() => toggleFolder("uncategorized")}
                      aria-expanded={isOpen}
                    >
                      <span>Uncategorized</span>
                      <span className="projectorFolderCount">{uncatScenes.length}</span>
                      <strong>{isOpen ? "▲" : "▼"}</strong>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="projectorLibraryList">
                      {uncatScenes.length ? (
                        uncatScenes.map((scene) => renderSceneItem(scene))
                      ) : (
                        <p className="projectorLibraryEmpty">No scenes here yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* Named folders */}
            {sortedFolders.map((folder) => {
              const folderScenes = scenes.filter((scene) => scene.folder_id === folder.id);
              const isOpen = openFolderIds.has(folder.id);
              return (
                <div className="projectorSceneFolderSection" key={folder.id}>
                  <div className="projectorSceneFolderHeader">
                    <button
                      className="projectorSceneFolderToggle"
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      aria-expanded={isOpen}
                    >
                      <span>{folder.title}</span>
                      <span className="projectorFolderCount">{folderScenes.length}</span>
                      <strong>{isOpen ? "▲" : "▼"}</strong>
                    </button>
                    <button
                      className="projectorSceneFolderDelete"
                      type="button"
                      onClick={() => deleteSceneFolder(folder.id)}
                      disabled={savingScene}
                      aria-label={`Delete folder ${folder.title}`}
                    >
                      D
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="projectorLibraryList">
                      {folderScenes.length ? (
                        folderScenes.map((scene) => renderSceneItem(scene))
                      ) : (
                        <p className="projectorLibraryEmpty">No scenes in this folder yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* New folder */}
            {showNewFolderForm ? (
              <div className="projectorSceneFolderCreator">
                <label className="field">
                  <span>Folder Name</span>
                  <input
                    value={newFolderTitle}
                    onChange={(event) => setNewFolderTitle(event.target.value)}
                    placeholder="Period 1, Warmups, Escape Room..."
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <div className="projectorSceneFolderCreatorActions">
                  <button className="btn secondary" type="button" onClick={createSceneFolder} disabled={savingScene || !newFolderTitle.trim()}>
                    Add Folder
                  </button>
                  <button className="btn secondary" type="button" onClick={() => { setShowNewFolderForm(false); setNewFolderTitle(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn secondary" type="button" onClick={() => setShowNewFolderForm(true)}>
                + New Folder
              </button>
            )}
          </SidebarPanel>

          <SidebarPanel
            ariaLabel="Saved Projector Items"
            count={library.length}
            eyebrow="Library"
            onToggle={() => togglePanel("library")}
            open={openPanels.library}
            title="Saved Items"
          >
            <label className="field">
              <span>Save Current Item As</span>
              <input
                value={libraryTitle}
                onChange={(event) => setLibraryTitle(event.target.value)}
                placeholder="Warmup question, word wall..."
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value)}>
                <option value="">No Category</option>
                {LIBRARY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <button
              className="btn secondary"
              type="button"
              onClick={saveLibraryItem}
              disabled={savingLibrary || uploadingVideo}
            >
              Save To Library
            </button>

            {library.length > 0 ? (
              <>
                <label className="field">
                  <span>Search</span>
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search saved items..."
                  />
                </label>
                <div className="projectorLibraryCategoryFilters">
                  <button
                    className={libraryCategoryFilter === "" ? "isActive" : ""}
                    type="button"
                    onClick={() => setLibraryCategoryFilter("")}
                  >
                    All
                  </button>
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <button
                      className={libraryCategoryFilter === cat ? "isActive" : ""}
                      key={cat}
                      type="button"
                      onClick={() => setLibraryCategoryFilter(libraryCategoryFilter === cat ? "" : cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="projectorLibraryList">
              {filteredLibrary.length ? (
                filteredLibrary.map((item) => (
                  <article className="projectorLibraryItem" key={item.id}>
                    {renamingItemId === item.id ? (
                      <div className="projectorLibraryRenameForm">
                        <label className="field">
                          <span>Name</span>
                          <input
                            value={renamingItemTitle}
                            onChange={(event) => setRenamingItemTitle(event.target.value)}
                            maxLength={80}
                            autoFocus
                          />
                        </label>
                        <label className="field">
                          <span>Category</span>
                          <select value={renamingItemCategory} onChange={(event) => setRenamingItemCategory(event.target.value)}>
                            <option value="">No Category</option>
                            {LIBRARY_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </label>
                        <div className="projectorLibraryRenameActions">
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => renameLibraryItem(item.id, renamingItemTitle, renamingItemCategory)}
                            disabled={savingLibrary || !renamingItemTitle.trim()}
                          >
                            Save
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => setRenamingItemId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => loadLibraryItem(item)}>
                        <span>
                          <strong>{item.title}</strong>
                          <em>
                            {item.category ? `${item.category} · ` : ""}
                            {libraryTypeLabel(item)}
                          </em>
                        </span>
                        <span className="projectorLibraryThumb">{renderContent(toLibraryState(item), true)}</span>
                      </button>
                    )}
                    {renamingItemId !== item.id ? (
                      <div className="projectorLibraryItemActions">
                        <button
                          className="projectorLibraryRename"
                          type="button"
                          onClick={() => {
                            setRenamingItemId(item.id);
                            setRenamingItemTitle(item.title || "");
                            setRenamingItemCategory(item.category || "");
                          }}
                          disabled={savingLibrary}
                          aria-label={`Rename ${item.title}`}
                        >
                          Rename
                        </button>
                        <button
                          className="projectorLibraryDelete"
                          type="button"
                          onClick={() => deleteLibraryItem(item.id)}
                          disabled={savingLibrary}
                          aria-label={`Delete ${item.title}`}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : library.length ? (
                <p className="projectorLibraryEmpty">No items match your search.</p>
              ) : (
                <p className="projectorLibraryEmpty">Save single items here — questions, word walls, images, videos. Use Scenes above to save full room layouts.</p>
              )}
            </div>
          </SidebarPanel>

        </aside>
      </div>
    </div>
  );
}
