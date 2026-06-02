"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCREEN_IDS = ["1", "2", "3", "4"];
const MATHCLAW_ORIGIN = "https://mathclaw.com";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const DIRECT_VIDEO_UPLOAD_BYTES = 4 * 1024 * 1024;

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

function libraryTypeLabel(item) {
  const type = item?.content_type || item?.type || "";
  return type === "latex" ? "LaTeX" : type ? type[0].toUpperCase() + type.slice(1) : "Item";
}

function toLibraryState(item) {
  return {
    type: item.content_type,
    content: item.content,
  };
}

export default function ProjectorClient({ session, libraryItems = [] }) {
  const [screenStates, setScreenStates] = useState(session.screen_states || {});
  const [library, setLibrary] = useState(libraryItems);
  const [target, setTarget] = useState("all");
  const [type, setType] = useState("text");
  const [text, setText] = useState("Welcome to class");
  const [latex, setLatex] = useState("\\frac{3}{4} + \\frac{1}{8}");
  const [url, setUrl] = useState("");
  const [libraryTitle, setLibraryTitle] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [videoUploadUrl, setVideoUploadUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const screenTokens = session.screen_tokens || {};
  const targetScreenIds = useMemo(() => (target === "all" ? SCREEN_IDS : [target]), [target]);

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
          [screenId]: payload?.type ? { type: payload.type, content: payload.content || "" } : null,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, screenTokens]);

  async function copyUrl(screenId) {
    const screenUrl = `${MATHCLAW_ORIGIN}/projector/screen?token=${screenTokens[screenId]}`;
    await navigator.clipboard.writeText(screenUrl);
    setMessage(`Screen ${screenId} URL copied.`);
  }

  function currentComposerContent() {
    if (type === "text") return text;
    if (type === "latex") return latex;
    if (type === "image") return imageDataUrl || url;
    return videoUploadUrl || url;
  }

  function loadLibraryItem(item) {
    const nextType = item.content_type;
    setType(nextType);
    setLibraryTitle(item.title || "");
    setUrl("");
    setImageDataUrl("");
    setVideoUploadUrl("");
    setVideoFileName("");

    if (nextType === "text") setText(item.content || "");
    if (nextType === "latex") setLatex(item.content || "");
    if (nextType === "image") {
      if (String(item.content || "").startsWith("data:")) {
        setImageDataUrl(item.content || "");
      } else {
        setUrl(item.content || "");
      }
    }
    if (nextType === "video") setUrl(item.content || "");
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
          content: currentComposerContent(),
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
        const directPayload = await directResponse.json();
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
      const preparePayload = await prepareResponse.json();
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
      const convertPayload = await convertResponse.json();
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
    const content = currentComposerContent();

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
          <section className="projectorLibrary" aria-label="Saved projector items">
            <div className="projectorLibraryHeader">
              <div>
                <p className="eyebrow">Library</p>
                <h2>Saved items</h2>
              </div>
              <span>{library.length}</span>
            </div>
            <label className="field">
              <span>Save current item as</span>
              <input
                value={libraryTitle}
                onChange={(event) => setLibraryTitle(event.target.value)}
                placeholder="Warmup question, word wall..."
                maxLength={80}
              />
            </label>
            <button
              className="btn secondary"
              type="button"
              onClick={saveLibraryItem}
              disabled={savingLibrary || uploadingVideo}
            >
              Save to Library
            </button>
            <div className="projectorLibraryList">
              {library.length ? (
                library.map((item) => (
                  <article className="projectorLibraryItem" key={item.id}>
                    <button type="button" onClick={() => loadLibraryItem(item)}>
                      <span>
                        <strong>{item.title}</strong>
                        <em>{libraryTypeLabel(item)}</em>
                      </span>
                      <span className="projectorLibraryThumb">{renderContent(toLibraryState(item), true)}</span>
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
                  </article>
                ))
              ) : (
                <p className="projectorLibraryEmpty">Save questions, announcements, images, and videos here.</p>
              )}
            </div>
          </section>

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
                  <img src={videoUploadUrl || url} alt="" />
                ) : videoUploadUrl || url ? (
                  <video src={videoUploadUrl || url} autoPlay loop muted playsInline />
                ) : uploadingVideo ? (
                  "Converting recording..."
                ) : (
                  "Upload a screen recording or paste a hosted MP4/GIF URL"
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
        </aside>
      </div>
    </div>
  );
}
