"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2500;
const API_BASE = "/api/play/lowest-number-wins";

function courseTitle(courses, courseId) {
  if (!courseId) return "Class";
  return courses.find((c) => c.id === courseId)?.title || "Class";
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    currentRound: Number(raw.currentRound || 0),
    totalStudents: Number(raw.totalStudents || 0),
    submittedCount: Number(raw.submittedCount || 0),
    leaderboard: Array.isArray(raw.leaderboard) ? raw.leaderboard : [],
    roundHistory: Array.isArray(raw.roundHistory) ? raw.roundHistory : [],
    picks: Array.isArray(raw.picks) ? raw.picks : null,
    currentRoundResult: raw.currentRoundResult || null,
    viewerPickValue: raw.viewerPickValue != null ? Number(raw.viewerPickValue) : null,
  };
}

function formatValue(value, numberType) {
  if (value == null) return "—";
  const num = Number(value);
  if (numberType === "integers") return String(num);
  // Show decimals cleanly — trim trailing zeros
  return num % 1 === 0 ? String(num) : String(parseFloat(num.toFixed(4)));
}

// ── Projector view ──────────────────────────────────────────────────────────

function ProjectorView({ session, courseId, courses, onClose }) {
  const title = courseTitle(courses, courseId);
  const { status, currentRound, submittedCount, totalStudents, picks, currentRoundResult, numberType } = session;

  return (
    <div className="lnwProjector">
      <button className="lnwProjectorClose" onClick={onClose} aria-label="Exit projector">
        ✕ Exit Projector
      </button>
      <div className="lnwProjectorInner">
        <div className="lnwProjectorHeader">
          <span className="lnwProjectorTitle">Lowest Number Wins</span>
          {title && <span className="lnwProjectorClass">{title}</span>}
        </div>

        {status === "waiting" && (
          <div className="lnwProjectorWaiting">
            <p className="lnwProjectorBig">Waiting to start</p>
            <p className="lnwProjectorSub">{totalStudents} student{totalStudents !== 1 ? "s" : ""} joined</p>
          </div>
        )}

        {status === "picking" && (
          <div className="lnwProjectorPicking">
            <p className="lnwProjectorRoundLabel">Round {currentRound}</p>
            <p className="lnwProjectorCounter">{submittedCount} / {totalStudents}</p>
            <p className="lnwProjectorSub">submitted</p>
          </div>
        )}

        {status === "revealed" && currentRoundResult && (
          <div className="lnwProjectorRevealed">
            <p className="lnwProjectorRoundLabel">Round {currentRound} Results</p>
            {currentRoundResult.winnerId ? (
              <>
                <p className="lnwProjectorWinner">
                  {currentRoundResult.winnerDisplayName} wins!
                </p>
                <p className="lnwProjectorWinValue">
                  Lowest unique: {formatValue(currentRoundResult.winningValue, numberType)}
                </p>
              </>
            ) : (
              <p className="lnwProjectorNoWinner">No winner this round</p>
            )}
            {picks && picks.length > 0 && (
              <div className="lnwProjectorPickList">
                {picks.map((group) => (
                  <div
                    key={group.value}
                    className={`lnwProjectorPickRow ${
                      group.isUnique && group.value === currentRoundResult.winningValue
                        ? "lnwPickWinner"
                        : !group.isUnique
                        ? "lnwPickElim"
                        : ""
                    }`}
                  >
                    <span className="lnwPickValue">{formatValue(group.value, numberType)}</span>
                    <span className="lnwPickNames">
                      {group.players.map((p) => p.displayName).join(", ")}
                      {!group.isUnique && (
                        <span className="lnwPickTag"> · tied</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status === "ended" && (
          <div className="lnwProjectorEnded">
            <p className="lnwProjectorBig">Session Ended</p>
            {session.leaderboard.length > 0 && (
              <div className="lnwProjectorLeaderboard">
                {session.leaderboard.slice(0, 10).map((p) => (
                  <div key={p.userId} className="lnwProjectorLbRow">
                    <span className="lnwProjectorLbRank">#{p.rank}</span>
                    <span className="lnwProjectorLbName">{p.displayName}</span>
                    <span className="lnwProjectorLbWins">
                      {p.totalWins} win{p.totalWins !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Results breakdown ────────────────────────────────────────────────────────

function ResultsBreakdown({ session }) {
  const { picks, currentRoundResult, numberType, currentRound } = session;
  if (!picks) return null;

  const hasWinner = Boolean(currentRoundResult?.winnerId);

  return (
    <div className="lnwResults">
      <h3 className="lnwResultsHeading">Round {currentRound} — All Picks</h3>

      {hasWinner ? (
        <div className="lnwWinnerBanner">
          <span className="lnwWinnerLabel">Winner</span>
          <span className="lnwWinnerName">{currentRoundResult.winnerDisplayName}</span>
          <span className="lnwWinnerValue">
            picked {formatValue(currentRoundResult.winningValue, numberType)}
          </span>
        </div>
      ) : (
        <div className="lnwNoWinnerBanner">
          No winner — every number was picked by more than one player.
        </div>
      )}

      {picks.length === 0 ? (
        <p className="lnwNoPicks">No picks were submitted this round.</p>
      ) : (
        <div className="lnwPickTable">
          {picks.map((group) => {
            const isWinningGroup =
              hasWinner && group.value === currentRoundResult.winningValue && group.isUnique;
            return (
              <div
                key={group.value}
                className={`lnwPickGroup ${isWinningGroup ? "lnwPickGroupWinner" : ""} ${
                  !group.isUnique ? "lnwPickGroupElim" : ""
                }`}
              >
                <span className="lnwPickGroupValue">
                  {formatValue(group.value, numberType)}
                  {isWinningGroup && <span className="lnwPickGroupStar"> ★</span>}
                </span>
                <span className="lnwPickGroupPlayers">
                  {group.players.map((p) => p.displayName).join(", ")}
                  {!group.isUnique && (
                    <span className="lnwPickGroupTag"> · tied — eliminated</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

function WinsLeaderboard({ session }) {
  const { leaderboard, roundHistory } = session;
  if (!leaderboard.length) return null;
  const totalRounds = session.currentRound;

  return (
    <div className="lnwLeaderboard">
      <h3 className="lnwLbHeading">
        Win Totals
        {totalRounds > 0 && (
          <span className="lnwLbSub"> · {totalRounds} round{totalRounds !== 1 ? "s" : ""} played</span>
        )}
      </h3>
      <div className="lnwLbList">
        {leaderboard.map((p) => (
          <div key={p.userId} className="lnwLbRow">
            <span className="lnwLbRank">#{p.rank}</span>
            <span className="lnwLbName">{p.displayName}</span>
            <span className="lnwLbWins">
              {p.totalWins} win{p.totalWins !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Teacher setup panel ──────────────────────────────────────────────────────

function TeacherSetup({ courses, initialCourseId, onCreate }) {
  const [courseId, setCourseId] = useState(initialCourseId || courses[0]?.id || "");
  const [numberType, setNumberType] = useState("integers");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate({ courseId, numberType });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!courses.length) {
    return (
      <section className="card">
        <p>You need at least one class with Lowest Number Wins enabled to host a session.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Start a New Session</h2>
      <form className="stack" onSubmit={handleCreate}>
        <div className="formRow">
          <label htmlFor="lnw-course">Class</label>
          <select
            id="lnw-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="formRow">
          <label>Number type</label>
          <div className="lnwRadioGroup">
            <label className={`lnwRadioOption ${numberType === "integers" ? "lnwRadioSelected" : ""}`}>
              <input
                type="radio"
                name="numberType"
                value="integers"
                checked={numberType === "integers"}
                onChange={() => setNumberType("integers")}
              />
              Natural numbers <span className="lnwRadioHint">(1, 2, 3, …)</span>
            </label>
            <label className={`lnwRadioOption ${numberType === "decimals" ? "lnwRadioSelected" : ""}`}>
              <input
                type="radio"
                name="numberType"
                value="decimals"
                checked={numberType === "decimals"}
                onChange={() => setNumberType("decimals")}
              />
              Positive numbers <span className="lnwRadioHint">(0.5, 1, 2.75, …)</span>
            </label>
          </div>
        </div>

        {error && <p className="errorText">{error}</p>}

        <button type="submit" className="btn btnPrimary" disabled={loading || !courseId}>
          {loading ? "Starting…" : "Create Session"}
        </button>
      </form>
    </section>
  );
}

// ── Main client ──────────────────────────────────────────────────────────────

export default function LowestNumberWinsClient({
  courses,
  initialCourseId,
  userId,
  viewerAccountType,
}) {
  const isTeacher = viewerAccountType === "teacher";

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [pickInput, setPickInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [projectorMode, setProjectorMode] = useState(false);
  const [selectedCourseId] = useState(initialCourseId || courses[0]?.id || "");
  const pollingRef = useRef(null);

  const clearError = () => setActionError(null);

  const fetchSession = useCallback(async (opts = {}) => {
    try {
      const params = new URLSearchParams();
      if (session?.id) {
        params.set("sessionId", session.id);
      } else if (selectedCourseId) {
        params.set("courseId", selectedCourseId);
      } else {
        return;
      }
      const res = await fetch(`${API_BASE}?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.session) {
        setSession(normalizeSession(data.session));
      } else if (opts.initial) {
        setSession(null);
      }
    } catch {
      // silently ignore poll errors
    } finally {
      if (opts.initial) setLoading(false);
    }
  }, [session?.id, selectedCourseId]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCourseId) params.set("courseId", selectedCourseId);
        const res = await fetch(`${API_BASE}?${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSession(data.session ? normalizeSession(data.session) : null);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedCourseId]);

  // Polling
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!session?.id) return;
    if (session.status === "ended") return;

    pollingRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams({ sessionId: session.id });
        const res = await fetch(`${API_BASE}?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.session) setSession(normalizeSession(data.session));
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollingRef.current);
  }, [session?.id, session?.status]);

  async function apiPost(payload) {
    clearError();
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed.");
    if (data.session) setSession(normalizeSession(data.session));
    return data;
  }

  async function handleCreate({ courseId, numberType }) {
    await apiPost({ action: "create", courseId, numberType });
  }

  async function handleJoin() {
    await apiPost({ action: "join", sessionId: session.id });
  }

  async function handleStartRound() {
    try {
      await apiPost({ action: "start_round", sessionId: session.id });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleSubmitPick(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost({ action: "submit_pick", sessionId: session.id, value: pickInput });
      setPickInput("");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReveal() {
    try {
      await apiPost({ action: "reveal", sessionId: session.id });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleNextRound() {
    try {
      await apiPost({ action: "next_round", sessionId: session.id });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleEnd() {
    if (!window.confirm("End this session? Results will be recorded.")) return;
    try {
      await apiPost({ action: "end", sessionId: session.id });
    } catch (err) {
      setActionError(err.message);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p>Loading…</p>
      </section>
    );
  }

  // No active session — teacher sees setup, students see waiting message
  if (!session) {
    if (isTeacher) {
      return <TeacherSetup courses={courses} initialCourseId={selectedCourseId} onCreate={handleCreate} />;
    }
    return (
      <section className="card">
        <p>No active Lowest Number Wins session for your class right now. Ask your teacher to start one.</p>
      </section>
    );
  }

  const {
    status,
    currentRound,
    numberType,
    totalStudents,
    submittedCount,
    viewerHasSubmitted,
    viewerPickValue,
    canManage,
    courseId,
  } = session;

  const title = courseTitle(courses, courseId);

  if (projectorMode && canManage) {
    return (
      <ProjectorView
        session={session}
        courseId={courseId}
        courses={courses}
        onClose={() => setProjectorMode(false)}
      />
    );
  }

  return (
    <div className="lnwGame stack">
      {/* Session header */}
      <section className="card lnwHeader">
        <div className="lnwHeaderRow">
          <div>
            <span className="lnwHeaderClass">{title}</span>
            <span className={`lnwStatusPill lnwStatus-${status}`}>
              {status === "waiting" && "Waiting"}
              {status === "picking" && `Round ${currentRound} · Picking`}
              {status === "revealed" && `Round ${currentRound} · Revealed`}
              {status === "ended" && "Session Ended"}
            </span>
          </div>
          <div className="lnwHeaderMeta">
            <span className="lnwMetaTag">
              {numberType === "integers" ? "Natural numbers" : "Positive numbers"}
            </span>
            {canManage && status !== "ended" && (
              <button
                className="btn btnSmall"
                onClick={() => setProjectorMode(true)}
              >
                Projector
              </button>
            )}
          </div>
        </div>
      </section>

      {actionError && (
        <section className="card lnwErrorCard">
          <p className="errorText">{actionError}</p>
          <button className="btn btnSmall" onClick={clearError}>Dismiss</button>
        </section>
      )}

      {/* ── WAITING ── */}
      {status === "waiting" && (
        <section className="card lnwPhaseCard">
          <div className="lnwWaitingContent">
            <p className="lnwWaitingCount">
              {totalStudents} student{totalStudents !== 1 ? "s" : ""} joined
            </p>
            {canManage ? (
              <button className="btn btnPrimary lnwBigBtn" onClick={handleStartRound}>
                Start Round 1
              </button>
            ) : (
              <>
                {!session.isJoined && (
                  <button className="btn btnPrimary" onClick={handleJoin}>
                    Join Game
                  </button>
                )}
                <p className="lnwWaitingMsg">Waiting for your teacher to start the round…</p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── PICKING ── */}
      {status === "picking" && (
        <section className="card lnwPhaseCard">
          <div className="lnwSubmissionBar">
            <span className="lnwSubmissionCount">{submittedCount}</span>
            <span className="lnwSubmissionSep"> / </span>
            <span className="lnwSubmissionTotal">{totalStudents}</span>
            <span className="lnwSubmissionLabel"> submitted</span>
          </div>

          {canManage ? (
            <div className="lnwTeacherPickControls">
              <button className="btn btnPrimary lnwBigBtn" onClick={handleReveal}>
                Reveal Results
              </button>
            </div>
          ) : viewerHasSubmitted ? (
            <div className="lnwSubmittedState">
              <p className="lnwSubmittedMsg">
                You picked <strong>{formatValue(viewerPickValue, numberType)}</strong>
              </p>
              <p className="lnwWaitingMsg">Waiting for your teacher to reveal…</p>
            </div>
          ) : (
            <form className="lnwPickForm" onSubmit={handleSubmitPick}>
              <label className="lnwPickLabel" htmlFor="lnw-pick">
                Pick a number
                {numberType === "integers"
                  ? " (whole number, greater than 0)"
                  : " (greater than 0)"}
              </label>
              <div className="lnwPickInputRow">
                <input
                  id="lnw-pick"
                  className="lnwPickInput"
                  type="number"
                  step={numberType === "integers" ? "1" : "any"}
                  min={numberType === "integers" ? "1" : "0.0001"}
                  value={pickInput}
                  onChange={(e) => setPickInput(e.target.value)}
                  placeholder={numberType === "integers" ? "e.g. 7" : "e.g. 2.5"}
                  autoFocus
                  required
                />
                <button
                  type="submit"
                  className="btn btnPrimary"
                  disabled={submitting || !pickInput}
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* ── REVEALED ── */}
      {status === "revealed" && (
        <>
          <ResultsBreakdown session={session} />
          {canManage && (
            <section className="card">
              <div className="lnwRevealControls">
                <button className="btn btnPrimary lnwBigBtn" onClick={handleNextRound}>
                  Start Round {currentRound + 1}
                </button>
                <button className="btn btnDanger" onClick={handleEnd}>
                  End Session
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── ENDED ── */}
      {status === "ended" && (
        <section className="card lnwEndedCard">
          <h2>Session Complete</h2>
          <p>
            {currentRound} round{currentRound !== 1 ? "s" : ""} played.
          </p>
          {canManage && (
            <button
              className="btn btnPrimary"
              onClick={() => setSession(null)}
            >
              Start New Session
            </button>
          )}
        </section>
      )}

      {/* Leaderboard — shown after first round and not during active picking */}
      {session.leaderboard.length > 0 && status !== "picking" && (
        <WinsLeaderboard session={session} />
      )}
    </div>
  );
}
