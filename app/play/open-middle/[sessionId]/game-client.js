"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildBlankPlacements,
  clearBlankFromPlacements,
  useDigitInPlacements as applyDigitToPlacements,
} from "@/lib/open-middle/core";

function Countdown({ seconds }) {
  return (
    <div className="openMiddleCountdownCard">
      <span>Time left</span>
      <strong>{Math.max(0, Number(seconds || 0))}s</strong>
    </div>
  );
}

function EquationBoard({ lines, placements, onClearBlank }) {
  return (
    <div className="openMiddleEquationBoard">
      {lines.map((line) => (
        <div key={line.lineIndex} className="openMiddleEquationLine live">
          {(line.tokens || []).map((token, index) =>
            token.type === "blank" ? (
              <button
                key={`${line.lineIndex}-${index}`}
                type="button"
                className={`openMiddleLiveBlank ${placements[token.blankId] ? "filled" : ""}`}
                onClick={() => onClearBlank(token.blankId)}
              >
                {placements[token.blankId] || ""}
              </button>
            ) : (
              <span key={`${line.lineIndex}-${index}`} className="openMiddlePreviewText">
                {token.value}
              </span>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export default function OpenMiddleSessionClient({
  sessionId,
  viewerAccountType,
}) {
  const [session, setSession] = useState(null);
  const [placements, setPlacements] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const joinAttemptedRef = useRef(false);
  const savedTimerRef = useRef(null);

  const loadSession = useCallback(async () => {
    const response = await fetch(`/api/play/open-middle?sessionId=${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Session failed to load.");
    setSession(payload.session || null);
    return payload.session;
  }, [sessionId]);

  const postAction = useCallback(async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/open-middle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      if (payload.session) {
        setSession(payload.session);
        if (payload.session.viewerResponse?.placements) {
          setPlacements(
            buildBlankPlacements(
              payload.session.parsedStructure?.blankCount || 0,
              payload.session.viewerResponse.placements
            )
          );
        }
      }
      setMessage(payload.result?.message || "");
      return payload;
    } catch (postError) {
      setError(postError.message);
      throw postError;
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession()
      .then((loadedSession) => {
        setPlacements(
          buildBlankPlacements(
            loadedSession?.parsedStructure?.blankCount || 0,
            loadedSession?.viewerResponse?.placements || {}
          )
        );
      })
      .catch((loadError) => setError(loadError.message));
  }, [loadSession]);

  useEffect(() => {
    if (!session || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    postAction({ action: "join" }).catch(() => {});
  }, [postAction, session]);

  useEffect(() => {
    if (!session) return undefined;
    const delay = session.status === "live" ? 1000 : 2500;
    const timer = window.setInterval(() => {
      loadSession().catch(() => {});
    }, delay);
    return () => window.clearInterval(timer);
  }, [loadSession, session]);

  useEffect(() => {
    if (!session || !placements || busy) return undefined;
    if (session.status === "reveal" || session.status === "ended") return undefined;
    window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      postAction({
        action: "save_response",
        placements,
      }).catch(() => {});
    }, 350);
    return () => window.clearTimeout(savedTimerRef.current);
  }, [busy, placements, postAction, session]);

  const usedDigits = useMemo(
    () =>
      Object.values(placements || {})
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    [placements]
  );

  const isTeacher = viewerAccountType === "teacher";

  function fillDigit(digit) {
    setPlacements((current) =>
      applyDigitToPlacements(current, session?.parsedStructure?.blankCount || 0, digit)
    );
  }

  function clearBlank(blankId) {
    setPlacements((current) => clearBlankFromPlacements(current, blankId));
  }

  if (!session) {
    return (
      <section className="card openMiddleSessionCard">
        <h1>Open Middle</h1>
        <p>Loading session...</p>
        {error ? <p className="openMiddleErrorNote">{error}</p> : null}
      </section>
    );
  }

  return (
    <>
      <section className="card openMiddleSessionCard">
        <div className="openMiddleSessionHeader">
          <div>
            <h1>{session.title}</h1>
            <p>
              {session.versionTitle}
              {session.standardCode ? ` · ${session.standardCode}` : ""}
            </p>
          </div>
          <div className="openMiddleSessionMeta">
            <Countdown seconds={session.secondsRemaining} />
            <Link href="/play/open-middle" className="btn">
              Back To Hub
            </Link>
          </div>
        </div>
        {message ? <p className="openMiddleSuccessNote">{message}</p> : null}
        {error ? <p className="openMiddleErrorNote">{error}</p> : null}
        <div className="openMiddleLiveGrid">
          <section className="openMiddlePlayPanel">
            <h2>Puzzle</h2>
            <p className="openMiddleMutedNote">
              Fill every blank using the digit pool. Digits can only be used once.
            </p>
            <EquationBoard
              lines={session.parsedStructure?.lines || []}
              placements={placements}
              onClearBlank={clearBlank}
            />
          </section>
          <section className="openMiddlePlayPanel">
            <h2>Digit Pool</h2>
            <div className="openMiddleDigitPool">
              {(session.digitPool || []).map((digit) => {
                const inUse = usedDigits.includes(String(digit));
                return (
                  <button
                    key={digit}
                    type="button"
                    className={`openMiddleDigitButton ${inUse ? "used" : ""}`}
                    disabled={inUse || session.status === "reveal" || session.status === "ended"}
                    onClick={() => fillDigit(digit)}
                  >
                    {digit}
                  </button>
                );
              })}
            </div>
            <p className="openMiddleMutedNote">
              Clicking a filled box removes its digit and returns it to the pool.
            </p>
          </section>
        </div>
        {session.status === "waiting" ? (
          <div className="openMiddleStatusBanner waiting">
            <strong>Waiting for the teacher to start.</strong>
            <span>Your work area is ready, but the live timer has not started yet.</span>
          </div>
        ) : null}
        {session.status === "live" ? (
          <div className="openMiddleStatusBanner live">
            <strong>Work time is live.</strong>
            <span>No correctness feedback appears until reveal.</span>
          </div>
        ) : null}
        {session.status === "reveal" || session.status === "ended" ? (
          <div className="openMiddleRevealPanel">
            <h2>Reveal</h2>
            <p>
              {session.viewerResponse?.isCorrect ? "Your puzzle is correct." : "Your current puzzle is not fully correct yet."}
            </p>
            {(session.viewerResponse?.validation?.lines || []).map((line) => (
              <div key={line.lineIndex} className={`openMiddleRevealLine ${line.isTrue ? "correct" : "incorrect"}`}>
                <strong>{line.expression}</strong>
                <span>{line.isTrue ? "True" : "False"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {session.canManage ? (
        <section className="card openMiddleSessionCard">
          <div className="openMiddleTeacherRow">
            <div>
              <h2>Teacher Controls</h2>
              <p>
                Students work independently during the timer. Reveal all responses together when you
                want the comparison and discussion phase to begin.
              </p>
            </div>
            <div className="ctaRow">
              {session.status === "waiting" ? (
                <button className="btn primary" type="button" disabled={busy} onClick={() => postAction({ action: "start" })}>
                  Start Session
                </button>
              ) : null}
              {session.status === "live" ? (
                <button className="btn primary" type="button" disabled={busy} onClick={() => postAction({ action: "reveal" })}>
                  Reveal Now
                </button>
              ) : null}
              {session.status !== "ended" ? (
                <button className="btn" type="button" disabled={busy} onClick={() => postAction({ action: "end" })}>
                  End Session
                </button>
              ) : null}
            </div>
          </div>
          <div className="openMiddleTeacherGrid">
            <div className="openMiddlePlayPanel">
              <h3>Students In Room</h3>
              <div className="openMiddleResponseList">
                {(session.players || []).map((player) => (
                  <div key={player.userId} className="openMiddleResponseCard">
                    <strong>{player.displayName}</strong>
                    <span>{player.hasResponse ? "Saved work" : "No response yet"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="openMiddlePlayPanel">
              <h3>Reveal Dashboard</h3>
              {session.status === "reveal" || session.status === "ended" ? (
                <div className="openMiddleResponseList">
                  {(session.responses || []).map((response) => (
                    <div key={response.userId} className={`openMiddleResponseCard ${response.isCorrect ? "correct" : "incorrect"}`}>
                      <strong>{response.displayName}</strong>
                      <span>{response.isCorrect ? "Correct" : "Incorrect"}</span>
                      {(response.validation?.lines || []).map((line) => (
                        <small key={line.lineIndex}>
                          {line.expression} · {line.isTrue ? "True" : "False"}
                        </small>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="openMiddleMutedNote">
                  Student responses will appear with full expressions and correctness as soon as the
                  reveal phase starts.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
