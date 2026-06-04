"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const LIBRARY_CATEGORIES = ["Questions", "Activities", "Word Walls", "Data Walls", "News", "Announcements"];
const MATHCLAW_ORIGIN = "https://mathclaw.com";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const DIRECT_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const QUESTION_OPTION_LABELS = ["A", "B", "C", "D"];

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
  const options = Array.isArray(parsed.options)
    ? parsed.options.slice(0, 4).map((option) => String(option || ""))
    : [];
  const correctIndex = Number.isInteger(parsed.correctIndex) ? parsed.correctIndex : null;
  const question = {
    prompt,
    promptType,
    options,
    correctIndex: correctIndex >= 0 && correctIndex < 4 ? correctIndex : null,
  };
  const hasQuestion = Boolean(prompt.trim() || options.some((option) => option.trim()));
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

function buildQuestionContent({ content = "", correctIndex, options, prompt, promptType }) {
  const safeOptions = options.slice(0, 4).map((option) => String(option || "").trim());
  const safeCorrectIndex = Number.isInteger(correctIndex) && safeOptions[correctIndex] ? correctIndex : null;
  return `${QUESTION_CONTENT_PREFIX}${JSON.stringify({
    content: String(content || ""),
    question: {
      prompt: String(prompt || "").trim(),
      promptType: promptType === "latex" ? "latex" : "text",
      options: safeOptions,
      correctIndex: safeCorrectIndex,
    },
  })}`;
}

function QuestionDisplay({ question, compact = false }) {
  if (!question) return null;
  const filledOptions = question.options
    .map((option, index) => ({ index, option }))
    .filter((item) => item.option.trim());
  return (
    <div className={compact ? "projectorQuestionCard isCompact" : "projectorQuestionCard"}>
      {question.prompt.trim() ? (
        <div className="projectorQuestionPrompt">
          {question.promptType === "latex" ? (
            <ProjectorLatex content={question.prompt} />
          ) : (
            <span>{question.prompt}</span>
          )}
        </div>
      ) : null}
      {filledOptions.length ? (
        <div className="projectorQuestionOptions">
          {filledOptions.map(({ index, option }) => (
            <div
              className={question.correctIndex === index ? "projectorQuestionOption isCorrect" : "projectorQuestionOption"}
              key={index}
            >
              <strong>{QUESTION_OPTION_LABELS[index]}</strong>
              <span>{option}</span>
              {question.correctIndex === index ? <em>Answer</em> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderTopText(state, compact = false) {
  if (!state?.topText || state.type === "text") return null;
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
  const hasBodyContent = Boolean(displayContent(state?.content).trim());
  if (!topText && !question) return body;
  if (question && !topText && !hasBodyContent) return <QuestionDisplay question={question} compact={compact} />;
  return (
    <div className={compact ? "projectorContentStack isCompact" : "projectorContentStack"}>
      {topText}
      {hasBodyContent ? <div className="projectorContentBody">{body}</div> : null}
      {question ? <QuestionDisplay question={question} compact={compact} /> : null}
    </div>
  );
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

function sceneFilledCount(scene) {
  return SCREEN_IDS.filter((screenId) => scene?.screen_states?.[screenId]).length;
}

function sceneFolderLabel(scene, folders) {
  if (!scene?.folder_id) return "Uncategorized";
  return folders.find((folder) => folder.id === scene.folder_id)?.title || "Folder";
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

export default function ProjectorClient({ session, libraryItems = [], sceneItems = [], sceneFolders = [] }) {
  const [screenStates, setScreenStates] = useState(session.screen_states || {});
  const [library, setLibrary] = useState(libraryItems);
  const [scenes, setScenes] = useState(sceneItems);
  const [folders, setFolders] = useState(sceneFolders);
  const [openFolderIds, setOpenFolderIds] = useState(new Set());
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [openPanels, setOpenPanels] = useState({ screens: true, scenes: false, library: false });
  const [target, setTarget] = useState("all");
  const [type, setType] = useState("text");
  const [text, setText] = useState("Welcome to class");
  const [latex, setLatex] = useState("\\frac{3}{4} + \\frac{1}{8}");
  const [questionPromptType, setQuestionPromptType] = useState("text");
  const [questionPrompt, setQuestionPrompt] = useState("Which expression is equivalent to 3(x + 4)?");
  const [questionOptions, setQuestionOptions] = useState(["3x + 12", "3x + 4", "x + 12", "7x"]);
  const [questionCorrectIndex, setQuestionCorrectIndex] = useState("");
  const [showQuestion, setShowQuestion] = useState(false);
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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const latexTextareaRef = useRef(null);
  const imageDragDepthRef = useRef(0);

  const screenTokens = session.screen_tokens || {};
  const targetScreenIds = useMemo(() => (target === "all" ? SCREEN_IDS : [target]), [target]);
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

  useEffect(() => {
    ensureKatexAssets();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-session-${session.id}`)
      .on("broadcast", { event: "screen-updated" }, ({ payload }) => {
        const screenId = String(payload?.screenId || "");
        if (!SCREEN_IDS.includes(screenId)) return;
        if (payload?.refetch) {
          refetchScreenState(screenId);
          return;
        }
        setScreenStates((current) => ({
          ...current,
          [screenId]: payload?.type
            ? { type: payload.type, content: payload.content || "", topText: payload.topText || "" }
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

  function currentComposerContent() {
    if (type === "text") return text;
    if (type === "latex") return latex;
    if (type === "image") return imageDataUrl || url;
    return videoUploadUrl || url;
  }

  function currentComposerTopText() {
    return type !== "text" && showTopText ? topText : "";
  }

  function currentComposerState() {
    const rawContent = currentComposerContent();
    if (!rawContent) return null;
    const content = showQuestion
      ? buildQuestionContent({
          content: rawContent,
          prompt: questionPrompt,
          promptType: questionPromptType,
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

  function loadQuestionContent(content) {
    const question = parseQuestionContent(content);
    if (!question) return false;
    setShowQuestion(true);
    setQuestionPromptType(question.promptType);
    setQuestionPrompt(question.prompt);
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

  function editScreenContent(screenId) {
    const state = screenStates?.[screenId];
    if (!state?.type) {
      setMessage(`Screen ${screenId} is empty.`);
      return;
    }

    setTarget(screenId);
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
    if (!loadedQuestion) setShowQuestion(false);
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
    if (!loadedQuestion) setShowQuestion(false);
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
          category: showQuestion ? "Questions" : libraryCategory,
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

      setScenes((current) => [payload.scene, ...current.filter((scene) => scene.id !== payload.scene.id)]);
      setSceneTitle(payload.scene.title || "");
      setMessage(`Saved "${payload.scene.title}" as a room setup.`);
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

      setFolders((current) => [payload.folder, ...current.filter((folder) => folder.id !== payload.folder.id)]);
      setOpenFolderIds((current) => new Set([...current, payload.folder.id]));
      setSceneFolderId(payload.folder.id);
      setNewFolderTitle("");
      setShowNewFolderForm(false);
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

      setFolders((current) => current.filter((item) => item.id !== folderId));
      setScenes((current) =>
        current.map((scene) => (scene.folder_id === folderId ? { ...scene, folder_id: null } : scene))
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

      setScenes((current) => current.map((scene) => (scene.id === sceneId ? payload.scene : scene)));
      setMessage(`Moved "${payload.scene.title}" to ${sceneFolderLabel(payload.scene, folders)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
  }

  async function loadScene(scene) {
    setSavingScene(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load-scene", sceneId: scene.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load that room setup.");

      setScreenStates(payload.screenStates || scene.screen_states || {});
      setMessage(`Loaded "${payload.title || scene.title}" to all screens.`);
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

      setScenes((current) => current.filter((scene) => scene.id !== sceneId));
      setMessage("Room setup deleted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScene(false);
    }
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
    setSending(true);
    setMessage("");
    const state = currentComposerState();
    const content = state?.content || "";
    const nextTopText = state?.topText || "";

    try {
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

      setScreenStates((current) => {
        const next = { ...current };
        targetScreenIds.forEach((screenId) => {
          next[screenId] = nextTopText ? { type, content, topText: nextTopText } : { type, content };
        });
        return next;
      });
      setMessage(`Sent to ${target === "all" ? "all screens" : `screen ${target}`}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function rotateScreens(direction = "forward") {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-screens", direction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not rotate screens.");
      setScreenStates(payload.screenStates || {});
      setMessage(direction === "backward" ? "Screens rotated left." : "Screens rotated right.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  async function clearScreens() {
    setSending(true);
    setMessage("");
    try {
      for (const screenId of targetScreenIds) {
        const response = await fetch("/api/projector", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not clear content.");
      }
      setScreenStates((current) => {
        const next = { ...current };
        targetScreenIds.forEach((screenId) => {
          next[screenId] = null;
        });
        return next;
      });
      setMessage(`Cleared ${target === "all" ? "all screens" : `screen ${target}`}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="projectorDashboard">
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

      <div className="projectorLayout">
        <div className="projectorGridColumn">
          <section className="projectorGrid" aria-label="Projector screens">
            {SCREEN_IDS.map((screenId) => (
              <article className="projectorScreenCard" key={screenId}>
                <div className="projectorScreenCardHeader">
                  <div className="projectorScreenTitleRow">
                    <strong>Screen {screenId}</strong>
                    <button
                      className="projectorScreenEdit"
                      type="button"
                      onClick={() => editScreenContent(screenId)}
                      disabled={!screenStates?.[screenId]?.type}
                    >
                      Edit
                    </button>
                  </div>
                  <span>{screenStates?.[screenId]?.type || "empty"}</span>
                </div>
                <div className="projectorScreenPreview">
                  {renderContent(screenStates?.[screenId], true, { playCompactVideo: true })}
                </div>
                <div className="projectorScreenUrl">
                  <code>{`${MATHCLAW_ORIGIN}/projector/screen/${session.pin}/${screenId}`}</code>
                  <button className="btn secondary" type="button" onClick={() => copyUrl(screenId)}>
                    Copy
                  </button>
                </div>
              </article>
            ))}
          </section>
          <div className="projectorRotateRow">
            <button className="btn secondary" type="button" onClick={() => rotateScreens("backward")} disabled={sending}>
              ↶ Rotate Left
            </button>
            <button className="btn secondary" type="button" onClick={() => rotateScreens("forward")} disabled={sending}>
              ↷ Rotate Right
            </button>
          </div>
        </div>

        <aside className="projectorComposer">
          <SidebarPanel
            ariaLabel="Screen Selection"
            count={target === "all" ? "All" : target}
            eyebrow="Controls"
            onToggle={() => togglePanel("screens")}
            open={openPanels.screens}
            title="Screen Selection"
          >
            <div className="projectorTargetPicker" aria-label="Screen Selection">
              <div className="projectorTargetButtons">
                <button
                  className={target === "all" ? "isActive" : ""}
                  type="button"
                  onClick={() => setTarget("all")}
                >
                  All
                </button>
                {SCREEN_IDS.map((screenId) => (
                  <button
                    className={target === screenId ? "isActive" : ""}
                    key={screenId}
                    type="button"
                    onClick={() => setTarget(screenId)}
                  >
                    {screenId}
                  </button>
                ))}
              </div>
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
              {type !== "text" ? (
                <button
                  className={showTopText ? "isActive" : ""}
                  type="button"
                  onClick={() => setShowTopText((current) => !current)}
                >
                  Top Text
                </button>
              ) : null}
              <button
                className={showQuestion ? "isActive" : ""}
                type="button"
                onClick={() => {
                  setShowQuestion((current) => !current);
                  setLibraryCategory((current) => (!showQuestion && !current ? "Questions" : current));
                }}
              >
                Question
              </button>
            </div>

            {type !== "text" && showTopText ? (
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

            {showQuestion ? (
              <div className="projectorQuestionBuilder">
                <label className="field">
                  <span>Question Prompt</span>
                  <textarea
                    value={questionPrompt}
                    onChange={(event) => setQuestionPrompt(event.target.value)}
                    rows={3}
                    placeholder={questionPromptType === "latex" ? "\\frac{3}{4} + \\frac{1}{8}" : "Optional prompt..."}
                  />
                </label>
                <label className="field">
                  <span>Prompt Type</span>
                  <select value={questionPromptType} onChange={(event) => setQuestionPromptType(event.target.value)}>
                    <option value="text">Text</option>
                    <option value="latex">LaTeX</option>
                  </select>
                </label>
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
                        uncatScenes.map((scene) => (
                          <article className="projectorSceneItem" key={scene.id}>
                            <button type="button" onClick={() => loadScene(scene)} disabled={savingScene}>
                              <span>
                                <strong>{scene.title}</strong>
                                <em>{sceneFilledCount(scene)} Of 4 Screens Filled</em>
                              </span>
                              <span className="projectorSceneThumb" aria-hidden="true">
                                {SCREEN_IDS.map((screenId) => (
                                  <span key={screenId}>{renderContent(scene.screen_states?.[screenId], true)}</span>
                                ))}
                              </span>
                            </button>
                            <div className="projectorSceneControls">
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
                        ))
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
                        folderScenes.map((scene) => (
                          <article className="projectorSceneItem" key={scene.id}>
                            <button type="button" onClick={() => loadScene(scene)} disabled={savingScene}>
                              <span>
                                <strong>{scene.title}</strong>
                                <em>{sceneFilledCount(scene)} Of 4 Screens Filled</em>
                              </span>
                              <span className="projectorSceneThumb" aria-hidden="true">
                                {SCREEN_IDS.map((screenId) => (
                                  <span key={screenId}>{renderContent(scene.screen_states?.[screenId], true)}</span>
                                ))}
                              </span>
                            </button>
                            <div className="projectorSceneControls">
                              <label>
                                <span>Move to folder</span>
                                <select
                                  value={scene.folder_id || ""}
                                  onChange={(event) => updateSceneFolder(scene.id, event.target.value)}
                                  disabled={savingScene}
                                >
                                  <option value="">Uncategorized</option>
                                  {folders.map((f) => (
                                    <option key={f.id} value={f.id}>{f.title}</option>
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
                        ))
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
