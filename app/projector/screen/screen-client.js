"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
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

function isGif(content) {
  return /^data:image\/gif/i.test(content || "") || /\.gif(\?|#|$)/i.test(content || "");
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

function LatexDisplay({ content }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureKatexAssets();
    const render = () => {
      if (!ref.current) return;
      const lines = String(content || "").split(/\r?\n/);
      if (!window.katex) {
        ref.current.textContent = content || "";
        return;
      }
      try {
        ref.current.replaceChildren();
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
          ref.current.appendChild(row);
        });
      } catch {
        ref.current.textContent = content || "";
      }
    };
    render();
    const id = window.setInterval(() => {
      if (window.katex) {
        render();
        window.clearInterval(id);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [content]);

  return <div ref={ref} className="projectorScreenLatex" />;
}

function parseQuestionContent(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    const prompt = String(parsed.prompt || "");
    const promptType = parsed.promptType === "latex" ? "latex" : "text";
    const options = Array.isArray(parsed.options)
      ? parsed.options.slice(0, 4).map((option) => String(option || ""))
      : [];
    const correctIndex = Number.isInteger(parsed.correctIndex) ? parsed.correctIndex : null;
    if (!prompt.trim()) return null;
    return {
      prompt,
      promptType,
      options,
      correctIndex: correctIndex >= 0 && correctIndex < 4 ? correctIndex : null,
    };
  } catch {
    return null;
  }
}

function QuestionDisplay({ question }) {
  const filledOptions = question.options
    .map((option, index) => ({ index, option }))
    .filter((item) => item.option.trim());
  return (
    <div className="projectorScreenQuestionCard">
      <div className="projectorScreenQuestionPrompt">
        {question.promptType === "latex" ? <LatexDisplay content={question.prompt} /> : <span>{question.prompt}</span>}
      </div>
      {filledOptions.length ? (
        <div className="projectorScreenQuestionOptions">
          {filledOptions.map(({ index, option }) => (
            <div
              className={question.correctIndex === index ? "projectorScreenQuestionOption isCorrect" : "projectorScreenQuestionOption"}
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

function ScreenContentBody({ state }) {
  if (!state) return <div className="projectorWaiting">waiting for content</div>;
  if (state.type === "text") {
    const question = parseQuestionContent(state.content);
    if (question) return <QuestionDisplay question={question} />;
    return <div className="projectorScreenText">{state.content}</div>;
  }
  if (state.type === "latex") return <LatexDisplay content={state.content} />;
  if (state.type === "image" || isGif(state.content)) {
    return <img className="projectorScreenMedia" src={state.content} alt="" />;
  }
  if (state.type === "video") {
    return (
      <video
        className="projectorScreenMedia"
        src={state.content}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }
  return <div className="projectorWaiting">waiting for content</div>;
}

function ScreenContent({ state }) {
  if (!state?.topText || state.type === "text") return <ScreenContentBody state={state} />;
  return (
    <div className="projectorScreenStack">
      <div className="projectorScreenTopText">{state.topText}</div>
      <div className="projectorScreenBody">
        <ScreenContentBody state={state} />
      </div>
    </div>
  );
}

export default function ScreenClient({ initialToken = null }) {
  const [token, setToken] = useState(initialToken || "");
  const [pin, setPin] = useState("");
  const [screenNumber, setScreenNumber] = useState("1");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    ensureKatexAssets();
    if (!initialToken) {
      const params = new URLSearchParams(window.location.search);
      setToken(String(params.get("token") || "").trim());
    }
  }, [initialToken]);

  const loadScreen = useCallback(async () => {
    if (!token) return;
    setStatus("connecting");
    setMessage("");
    try {
      const response = await fetch(`/api/projector?token=${encodeURIComponent(token)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not connect.");
      setSessionId(payload.sessionId);
      setScreenNumber(String(payload.screenNumber || "1"));
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
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
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
            ? { type: payload.type, content: payload.content || "", topText: payload.topText || "" }
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
      const response = await fetch("/api/projector", {
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
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setMessage("Fullscreen is not available in this browser.");
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

  return (
    <main
      className={`projectorScreenStage ${
        state?.type === "image" || state?.type === "video" ? "hasMedia" : ""
      }`}
    >
      <div className={`projectorStatusDot ${status === "connected" ? "isConnected" : ""}`} title={status} />
      <button className="projectorFullscreenButton" type="button" onClick={toggleFullscreen}>
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
      <ScreenContent state={state} />
      {message ? <div className="projectorScreenError">{message}</div> : null}
    </main>
  );
}
