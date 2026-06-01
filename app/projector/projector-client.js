"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const MATHCLAW_ORIGIN = "https://mathclaw.com";
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

function renderLatex(element, content) {
  if (!element) return;
  if (!window.katex) {
    element.textContent = content || "";
    return;
  }
  try {
    window.katex.render(content || "", element, {
      throwOnError: false,
      displayMode: true,
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

function renderContent(state, compact = false) {
  if (!state) return <span className="projectorEmpty">empty</span>;
  if (state.type === "text") {
    return <div className={compact ? "projectorTextThumb" : "projectorTextDisplay"}>{state.content}</div>;
  }
  if (state.type === "latex") {
    return <ProjectorLatex content={state.content} className={compact ? "projectorLatexThumb" : ""} />;
  }
  if (state.type === "image") {
    return <img src={state.content} alt="" className="projectorThumbMedia" />;
  }
  if (state.type === "video") {
    if (/\.gif(\?|#|$)/i.test(state.content || "")) {
      return <img src={state.content} alt="" className="projectorThumbMedia" />;
    }
    return (
      <video className="projectorThumbMedia" src={state.content} autoPlay loop muted playsInline />
    );
  }
  return <span className="projectorEmpty">empty</span>;
}

export default function ProjectorClient({ session }) {
  const [screenStates, setScreenStates] = useState(session.screen_states || {});
  const [target, setTarget] = useState("all");
  const [type, setType] = useState("text");
  const [text, setText] = useState("Welcome to class");
  const [latex, setLatex] = useState("\\frac{3}{4} + \\frac{1}{8}");
  const [url, setUrl] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const screenTokens = session.screen_tokens || {};
  const targetScreenIds = useMemo(() => (target === "all" ? SCREEN_IDS : [target]), [target]);

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
        setScreenStates((current) => ({
          ...current,
          [screenId]: payload?.type ? { type: payload.type, content: payload.content || "" } : null,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  async function copyUrl(screenId) {
    const screenUrl = `${MATHCLAW_ORIGIN}/projector/screen?token=${screenTokens[screenId]}`;
    await navigator.clipboard.writeText(screenUrl);
    setMessage(`Screen ${screenId} URL copied.`);
  }

  function onImageFileChange(event) {
    const file = event.target.files?.[0];
    setImageDataUrl("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("That image is over 5MB. Choose a smaller image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Heads up: images over 2MB can feel slower on classroom Wi-Fi.");
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function sendContent() {
    setSending(true);
    setMessage("");
    const content =
      type === "text" ? text : type === "latex" ? latex : type === "image" ? imageDataUrl || url : url;

    try {
      const response = await fetch("/api/projector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          screenIds: targetScreenIds,
          type,
          content,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not send content.");

      setScreenStates((current) => {
        const next = { ...current };
        targetScreenIds.forEach((screenId) => {
          next[screenId] = { type, content };
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
        <section className="projectorGrid" aria-label="Projector screens">
          {SCREEN_IDS.map((screenId) => (
            <article className="projectorScreenCard" key={screenId}>
              <div className="projectorScreenCardHeader">
                <strong>Screen {screenId}</strong>
                <span>{screenStates?.[screenId]?.type || "empty"}</span>
              </div>
              <div className="projectorScreenPreview">{renderContent(screenStates?.[screenId], true)}</div>
              <div className="projectorScreenUrl">
                <code>{`${MATHCLAW_ORIGIN}/projector/screen?token=${screenTokens[screenId]}`}</code>
                <button className="btn secondary" type="button" onClick={() => copyUrl(screenId)}>
                  Copy
                </button>
              </div>
            </article>
          ))}
        </section>

        <aside className="projectorComposer">
          <div className="projectorTargetPicker" aria-label="Send target">
            <span>Send to</span>
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

          <div className="projectorTabs" role="tablist" aria-label="Content type">
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

          {type === "text" ? (
            <>
              <label className="field">
                <span>Text</span>
                <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} />
              </label>
              <div className="projectorComposerPreview">
                <div className="projectorTextPreview">{text || "Text preview"}</div>
              </div>
            </>
          ) : null}

          {type === "latex" ? (
            <>
              <label className="field">
                <span>LaTeX</span>
                <textarea value={latex} onChange={(event) => setLatex(event.target.value)} rows={5} />
              </label>
              <div className="projectorComposerPreview">
                <ProjectorLatex content={latex} />
              </div>
            </>
          ) : null}

          {type === "image" ? (
            <>
              <label className="field">
                <span>Image upload</span>
                <input accept="image/*" type="file" onChange={onImageFileChange} />
              </label>
              <label className="field">
                <span>Image URL</span>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
              </label>
              <div className="projectorComposerPreview">
                {imageDataUrl || url ? <img src={imageDataUrl || url} alt="" /> : "No image selected"}
              </div>
            </>
          ) : null}

          {type === "video" ? (
            <>
              <label className="field">
                <span>Video upload</span>
                <input
                  accept="video/mp4"
                  type="file"
                  onChange={() => setMessage("For this version, paste a hosted MP4 URL instead of uploading video.")}
                />
              </label>
              <label className="field">
                <span>Video or GIF URL</span>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://.../video.mp4" />
              </label>
              <div className="projectorComposerPreview">
                {url && /\.gif(\?|#|$)/i.test(url) ? (
                  <img src={url} alt="" />
                ) : url ? (
                  <video src={url} autoPlay loop muted playsInline />
                ) : (
                  "Paste a hosted MP4 or GIF URL"
                )}
              </div>
            </>
          ) : null}

          <div className="projectorActions">
            <button className="btn" type="button" onClick={sendContent} disabled={sending}>
              Send
            </button>
            <button className="btn secondary" type="button" onClick={clearScreens} disabled={sending}>
              Clear
            </button>
          </div>
          {message ? <p className="projectorMessage">{message}</p> : null}
        </aside>
      </div>
    </div>
  );
}
