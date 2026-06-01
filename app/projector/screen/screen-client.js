"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";

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

function LatexDisplay({ content }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureKatexAssets();
    const render = () => {
      if (!ref.current) return;
      if (!window.katex) {
        ref.current.textContent = content || "";
        return;
      }
      try {
        window.katex.render(content || "", ref.current, {
          throwOnError: false,
          displayMode: true,
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

function ScreenContent({ state }) {
  if (!state) return <div className="projectorWaiting">waiting for content</div>;
  if (state.type === "text") return <div className="projectorScreenText">{state.content}</div>;
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

export default function ScreenClient() {
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [screenNumber, setScreenNumber] = useState("1");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    ensureKatexAssets();
    const params = new URLSearchParams(window.location.search);
    setToken(String(params.get("token") || "").trim());
  }, []);

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
    if (!sessionId || !screenNumber) return undefined;
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-session-${sessionId}`)
      .on("broadcast", { event: "screen-updated" }, ({ payload }) => {
        if (String(payload?.screenId) !== String(screenNumber)) return;
        setState(payload?.type ? { type: payload.type, content: payload.content || "" } : null);
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
  }, [reconnectKey, sessionId, screenNumber]);

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
    <main className="projectorScreenStage">
      <div className={`projectorStatusDot ${status === "connected" ? "isConnected" : ""}`} title={status} />
      <ScreenContent state={state} />
      {message ? <div className="projectorScreenError">{message}</div> : null}
    </main>
  );
}
