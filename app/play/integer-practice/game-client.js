"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathInlineText, MathText } from "@/components/math-display";
import { buildIntegerNode } from "@/lib/math-display";
import {
  applyAnswerToProfile,
  buildAssignmentPlan,
  applyScaffoldsToProblem,
  buildBadges,
  buildSessionSummary,
  computeLevelChange,
  createEmptyIntegerProfile,
  createEmptySession,
  createProblem,
  detectErrorType,
  summarizeProfile,
} from "@/lib/integer-practice/engine";
import { evaluateLevelProgression } from "@/lib/integer-practice/progression";
import {
  DEFAULT_ASSIGNMENT,
  INTEGER_LEVELS,
  INTEGER_MODE_PRESETS,
  INTEGER_SKILL_TAGS,
  getLevelById,
  listNearbyLevels,
} from "@/lib/integer-practice/levels";

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatPoints(value) {
  return `${Math.round(Number(value || 0))}`;
}

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function answerLabel(value) {
  return value < 0 ? `-${Math.abs(value)}` : String(value);
}

function profileStorageKey(userId, courseId) {
  return `mathclaw:integer-practice:profile:${userId}:${courseId || "none"}`;
}

function normalizeSavedProfileEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw.profile && typeof raw.profile === "object" ? raw.profile : raw;
  const profile = {
    ...createEmptyIntegerProfile(),
    ...candidate,
  };

  if (!Number.isInteger(Number(profile.currentLevelId || 0)) || Number(profile.currentLevelId || 0) < 1) {
    return null;
  }

  return {
    profile,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function loadLocalProfile(userId, courseId) {
  if (typeof window === "undefined") return createEmptyIntegerProfile();
  try {
    const raw = window.localStorage.getItem(profileStorageKey(userId, courseId));
    if (!raw) return null;
    return normalizeSavedProfileEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLocalProfile(userId, courseId, profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    profileStorageKey(userId, courseId),
    JSON.stringify({
      profile,
      updatedAt: new Date().toISOString(),
    })
  );
}

function buildCompactSkillMap(skillMap) {
  return Object.fromEntries(
    Object.entries(skillMap || {}).slice(0, 12).map(([tag, value]) => [
      tag,
      {
        attempts: Number(value?.attempts || 0),
        accuracy: Number(value?.accuracy || 0),
        medianResponseMs: Number(value?.medianResponseMs || 0),
        hintRate: Number(value?.hintRate || 0),
      },
    ])
  );
}

function buildCompactHistoryEntry(entry) {
  return {
    levelId: Number(entry?.levelId || 1),
    correct: entry?.correct === true,
    responseMs: Number(entry?.responseMs || 0),
    skillTags: Array.isArray(entry?.skillTags) ? entry.skillTags.slice(0, 3) : [],
    primarySkillTag: typeof entry?.primarySkillTag === "string" ? entry.primarySkillTag : null,
    hintUsed: entry?.hintUsed === true,
    attemptsUsed: Number(entry?.attemptsUsed || 1),
    errorType: typeof entry?.errorType === "string" ? entry.errorType : null,
    confidence: typeof entry?.confidence === "string" ? entry.confidence : null,
    mode: typeof entry?.mode === "string" ? entry.mode : null,
    answerMode: typeof entry?.answerMode === "string" ? entry.answerMode : null,
  };
}

function buildServerProfileSnapshot(profile) {
  const summary = summarizeProfile(profile);
  return {
    currentLevelId: Number(profile?.currentLevelId || 1),
    highestLevelReached: Number(profile?.highestLevelReached || 1),
    masteredSkillTags: Array.isArray(profile?.masteredSkillTags) ? profile.masteredSkillTags.slice(0, 8) : [],
    strugglingSkillTags: Array.isArray(profile?.strugglingSkillTags) ? profile.strugglingSkillTags.slice(0, 6) : [],
    accuracyBySkill: buildCompactSkillMap(profile?.accuracyBySkill || summary.accuracyBySkill),
    hintDependence: Number(profile?.hintDependence || summary.hintRate || 0),
    badges: Array.isArray(profile?.badges) ? profile.badges.slice(0, 8) : [],
    fluencyState: typeof profile?.fluencyState === "string" ? profile.fluencyState : summary.fluencyState,
    dropOffPoint: Number(profile?.dropOffPoint || summary.dropOffPoint || 0) || null,
    rollingHistory: Array.isArray(profile?.rollingHistory)
      ? profile.rollingHistory.slice(0, 18).map(buildCompactHistoryEntry)
      : [],
    currentScaffolds:
      profile?.currentScaffolds && typeof profile.currentScaffolds === "object"
        ? {
            answerMode: profile.currentScaffolds.answerMode,
            choiceCount: Number(profile.currentScaffolds.choiceCount || 0) || undefined,
            showNumberLine: profile.currentScaffolds.showNumberLine === true,
            showCounters: profile.currentScaffolds.showCounters === true,
            showHintButton: profile.currentScaffolds.showHintButton === true,
            stepByStep: profile.currentScaffolds.stepByStep === true,
            remediationSkillTag:
              typeof profile.currentScaffolds.remediationSkillTag === "string"
                ? profile.currentScaffolds.remediationSkillTag
                : undefined,
          }
        : null,
  };
}

function readServerProfileForCourse(savedProfileState, courseId) {
  const profilesByCourse =
    savedProfileState?.profilesByCourse && typeof savedProfileState.profilesByCourse === "object"
      ? savedProfileState.profilesByCourse
      : null;
  if (!profilesByCourse) return null;

  const courseKey = courseId || "none";
  return normalizeSavedProfileEnvelope(profilesByCourse[courseKey] || null);
}

function chooseNewestProfile(localEnvelope, serverEnvelope) {
  if (localEnvelope && serverEnvelope) {
    const localTime = new Date(localEnvelope.updatedAt || 0).getTime();
    const serverTime = new Date(serverEnvelope.updatedAt || 0).getTime();
    return localTime >= serverTime ? localEnvelope.profile : serverEnvelope.profile;
  }
  return localEnvelope?.profile || serverEnvelope?.profile || createEmptyIntegerProfile();
}

function buildDefaultAssignmentFromProfile(profile) {
  return buildAssignmentPlan({
    ...DEFAULT_ASSIGNMENT,
    startLevelId: Math.max(1, Math.min(profile.currentLevelId || 1, INTEGER_LEVELS.length)),
    endLevelId: Math.max(6, Math.min((profile.currentLevelId || 1) + 5, INTEGER_LEVELS.length)),
  });
}

function topEntries(map, count = 4, ascending = false) {
  return Object.entries(map || {})
    .sort((a, b) => {
      const left = typeof a[1] === "object" ? a[1].accuracy ?? a[1] : a[1];
      const right = typeof b[1] === "object" ? b[1].accuracy ?? b[1] : b[1];
      return ascending ? left - right : right - left;
    })
    .slice(0, count);
}

function scaffoldLabel(scaffolds) {
  const labels = [];
  labels.push(scaffolds.answerMode === "multiple_choice" ? `${scaffolds.choiceCount} choices` : "Open response");
  if (scaffolds.showNumberLine) labels.push(scaffolds.numberLineStyle === "animated" ? "Animated line" : "Number line");
  if (scaffolds.showCounters) labels.push("Counters");
  if (scaffolds.showHintButton) labels.push("Hints");
  if (scaffolds.stepByStep) labels.push("Steps");
  if (scaffolds.timedPressure || !scaffolds.untimed) labels.push("Timer");
  return labels.join(" · ");
}

function masteryPercent(summary, levelId) {
  return Math.max(2.5, Math.min(100, ((Math.max(1, Number(levelId) || 1)) / INTEGER_LEVELS.length) * 100));
}

function ProficiencyStatePill({ state }) {
  return <span className={`pill integerStatePill state-${state}`}>{state.replaceAll("_", " ")}</span>;
}

function NumberLine({ model }) {
  const ticks = [];
  for (let value = model.min; value <= model.max; value += 1) {
    ticks.push(value);
  }

  return (
    <div className="integerNumberLine" aria-label="Number line support">
      <div className="integerNumberLineTrack">
        {ticks.map((tick) => {
          const status = [
            tick === model.start ? "start" : "",
            tick === model.end ? "end" : "",
            tick === 0 ? "zero" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={tick} className={`integerNumberTick ${status}`}>
              <span className="integerNumberTickGuide" aria-hidden="true" />
              <span className="integerNumberTickMark" />
              <span className="integerNumberTickLabel">{tick}</span>
            </div>
          );
        })}
      </div>
      <p className="integerSupportNote">
        Start at {model.start}, then jump {model.jump > 0 ? "right" : "left"} {Math.abs(model.jump)} to land on {model.end}.
      </p>
    </div>
  );
}

function CounterSupport({ counters }) {
  const renderGroup = (prefix, count, className) =>
    Array.from({ length: count }).map((_, index) => (
      <span key={`${prefix}-${index}`} className={`integerCounter ${className}`} />
    ));

  return (
    <div className="integerCounterWrap">
      <div>
        <p className="integerSupportLabel">Positive counters</p>
        <div className="integerCounterRow">
          {counters.startPositive > 0 ? (
            <div className="integerCounterGroup">
              <span className="integerCounterGroupLabel">Start</span>
              <div className="integerCounterTokens">{renderGroup("p-start", counters.startPositive, "positive")}</div>
            </div>
          ) : null}
          {counters.incomingPositive > 0 ? (
            <div className="integerCounterGroup incomingGroup">
              <span className="integerCounterGroupLabel">Change</span>
              <div className="integerCounterTokens">
                {renderGroup("p-incoming", counters.incomingPositive, "positive incoming")}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <p className="integerSupportLabel">Negative counters</p>
        <div className="integerCounterRow">
          {counters.startNegative > 0 ? (
            <div className="integerCounterGroup">
              <span className="integerCounterGroupLabel">Start</span>
              <div className="integerCounterTokens">{renderGroup("n-start", counters.startNegative, "negative")}</div>
            </div>
          ) : null}
          {counters.incomingNegative > 0 ? (
            <div className="integerCounterGroup incomingGroup">
              <span className="integerCounterGroupLabel">Change</span>
              <div className="integerCounterTokens">
                {renderGroup("n-incoming", counters.incomingNegative, "negative incoming")}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {counters.zeroPairs > 0 ? (
        <p className="integerSupportNote">
          Zero pairs canceled: {counters.zeroPairs}
        </p>
      ) : null}
    </div>
  );
}

function StrategyCard({ strategy, rewrite }) {
  return (
    <div className="card integerHintCard" style={{ background: "#f9fbfc" }}>
      <p className="integerSupportLabel">{strategy.headline}</p>
      {rewrite ? <p className="integerHintRewrite">{rewrite}</p> : null}
      <ol className="integerHintSteps">
        {strategy.steps.map((step) => (
          <li key={step}>
            <MathInlineText text={step} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function SessionSummaryCard({ summary }) {
  if (!summary) return null;

  return (
    <section className="card integerSessionSummary" style={{ background: "#f9fbfc" }}>
      <h3>Session Summary</h3>
      <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
        <div>
          <span>Questions</span>
          <strong>{summary.questionsAnswered}</strong>
        </div>
        <div>
          <span>Accuracy</span>
          <strong>{formatPercent(summary.accuracy)}</strong>
        </div>
        <div>
          <span>Median Time</span>
          <strong>{formatMs(summary.medianResponseMs)}</strong>
        </div>
        <div>
          <span>Best Streak</span>
          <strong>{summary.bestStreak}</strong>
        </div>
      </div>
      <p style={{ marginTop: "0.9rem" }}>
        Skills practiced: {summary.skillTypesPracticed.slice(0, 4).join(" · ") || "Not enough data yet"}.
      </p>
      <p>
        {summary.leveledUp
          ? "Nice. You leveled up this session."
          : summary.needsSupportOn
            ? `Recommended next focus: ${summary.needsSupportOn.replaceAll("_", " ")}.`
            : `Recommended next focus: ${summary.recommendedNextFocus?.replaceAll("_", " ") || "keep practicing"}.`}
      </p>
      {summary.totalScore !== null && summary.threshold !== null ? (
        <p>
          Readiness: <strong>{summary.readinessState?.replaceAll("_", " ") || "not ready"}</strong> ·
          Score <strong>{formatPoints(summary.totalScore)}/{formatPoints(summary.threshold)}</strong>
        </p>
      ) : null}
      {summary.primaryFeedback ? <p>{summary.primaryFeedback}</p> : null}
    </section>
  );
}

function LevelReadinessCard({ readiness }) {
  if (!readiness) return null;

  return (
    <div className="card integerReadinessCard" style={{ background: "#f9fbfc" }}>
      <div className="integerReadinessHeader">
        <div>
          <p className="integerSupportLabel">Level Readiness</p>
          <h3>
            {readiness.canLevelUp
              ? "Ready for the next level"
              : readiness.readinessState === "close"
                ? "Close to leveling up"
                : readiness.readinessState === "building_evidence"
                  ? "Building evidence"
                  : readiness.readinessState === "struggling"
                    ? "Targeted practice first"
                    : "Keep strengthening this level"}
          </h3>
        </div>
        <strong>{formatPoints(readiness.totalScore)}/{formatPoints(readiness.threshold)}</strong>
      </div>
      <p className="integerCoachLine">{readiness.primaryFeedback}</p>
      <div className="integerReadinessBreakdown">
        <span className="integerReadinessPill">Accuracy {formatPoints(readiness.scoreBreakdown.accuracy.score)}</span>
        <span className="integerReadinessPill">Speed {formatPoints(readiness.scoreBreakdown.speed.score)}</span>
        <span className="integerReadinessPill">Streak {formatPoints(readiness.scoreBreakdown.streak.score)}</span>
        <span className="integerReadinessPill">Hints {formatPoints(readiness.scoreBreakdown.hints.score)}</span>
        <span className="integerReadinessPill">Focus {formatPoints(readiness.scoreBreakdown.focus.score)}</span>
      </div>
      <p className="integerMiniCopy">
        {readiness.evidence.attempts}/{readiness.evidence.minAttempts} attempts checked · {readiness.tierLabel.replaceAll("_", " ")}
        {readiness.usedFocusFallback ? " · Focus score is using general accuracy for now." : ""}
      </p>
      {readiness.blockedReasons.length ? (
        <ul className="integerBlockedList">
          {readiness.blockedReasons.slice(0, 2).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function IntegerPracticeClient({
  userId,
  accountType,
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
  savedProfileState,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [mode, setMode] = useState("adaptive");
  const [savedStats, setSavedStats] = useState(personalStats);
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [profile, setProfile] = useState(() => createEmptyIntegerProfile());
  const [assignmentPlan, setAssignmentPlan] = useState(DEFAULT_ASSIGNMENT);
  const [session, setSession] = useState(() => createEmptySession(1));
  const [currentLevelId, setCurrentLevelId] = useState(1);
  const [overrideScaffolds, setOverrideScaffolds] = useState(null);
  const [problem, setProblem] = useState(() => createProblem(getLevelById(1)));
  const [answerText, setAnswerText] = useState("");
  const [feedback, setFeedback] = useState("Start easy, build confidence, and let the system coach the next step.");
  const [hintOpen, setHintOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [confidence, setConfidence] = useState("sure");
  const [timeLeftMs, setTimeLeftMs] = useState(null);
  const questionStartRef = useRef(Date.now());
  const timeoutResponseMsRef = useRef(null);
  const inputAttemptsRef = useRef(0);
  const profileRef = useRef(profile);
  const sessionRef = useRef(session);
  const runCompleteRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const hasHydratedProfileRef = useRef(false);

  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const profileSummary = useMemo(() => summarizeProfile(profile), [profile]);
  const activeLevel = useMemo(() => getLevelById(currentLevelId), [currentLevelId]);
  const activeScaffolds = overrideScaffolds || activeLevel.scaffolds;
  const levelReadiness = useMemo(
    () => evaluateLevelProgression({ level: activeLevel, profile, profileSummary }),
    [activeLevel, profile, profileSummary]
  );
  const visibleChoices = useMemo(() => {
    if (activeScaffolds.answerMode !== "multiple_choice") return [];
    if (Array.isArray(problem.choices) && problem.choices.length > 0) return problem.choices;
    return applyScaffoldsToProblem(problem, activeLevel, activeScaffolds).choices || [];
  }, [activeLevel, activeScaffolds, problem]);
  const effectiveQuestionTarget = mode === "assignment" ? assignmentPlan.questionCount : mode === "challenge" ? 16 : 12;
  const hasFiniteRunTarget = mode === "assignment";
  const progressPercent = Math.min(100, Math.round((session.answers.length / effectiveQuestionTarget) * 100));
  const recentLevels = useMemo(() => listNearbyLevels(currentLevelId, 3), [currentLevelId]);
  const visibleBadges = useMemo(
    () => buildBadges(profileSummary, profile.highestLevelReached || 1),
    [profile.highestLevelReached, profileSummary]
  );
  const strongestSkills = useMemo(() => topEntries(profileSummary.accuracyBySkill, 4, false), [profileSummary]);
  const weakestSkills = useMemo(() => topEntries(profileSummary.accuracyBySkill, 4, true), [profileSummary]);

  useEffect(() => {
    profileRef.current = profile;
    if (!hasHydratedProfileRef.current) return;
    saveLocalProfile(userId, courseId, profile);
  }, [courseId, profile, userId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    runCompleteRef.current = Boolean(sessionSummary);
  }, [sessionSummary]);

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const response = await fetch(`/api/play/leaderboard?gameSlug=integer_practice&courseId=${encodeURIComponent(nextCourseId)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not load class leaderboard.");
      }
      setLeaderboardRows(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch (error) {
      setFeedback(error.message || "Could not load class leaderboard.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    const localEnvelope = loadLocalProfile(userId, courseId);
    const serverEnvelope = readServerProfileForCourse(savedProfileState, courseId);
    const normalizedProfile = chooseNewestProfile(localEnvelope, serverEnvelope);
    setProfile(normalizedProfile);
    setCurrentLevelId(normalizedProfile.currentLevelId || 1);
    setAssignmentPlan(buildDefaultAssignmentFromProfile(normalizedProfile));
    setSession(createEmptySession(normalizedProfile.currentLevelId || 1));
    setOverrideScaffolds(null);
    setProblem(createProblem(getLevelById(normalizedProfile.currentLevelId || 1)));
    setSessionSummary(null);
    setHintOpen(false);
    questionStartRef.current = Date.now();
    timeoutResponseMsRef.current = null;
    hasHydratedProfileRef.current = true;
    if (courseId && !(courseId === initialCourseId && initialLeaderboard.length > 0)) {
      loadLeaderboard(courseId);
    }
  }, [courseId, initialCourseId, initialLeaderboard.length, loadLeaderboard, savedProfileState, userId]);

  const saveProfileToServer = useCallback(async (profileToSave, nextCourseId) => {
    const response = await fetch("/api/play/save-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "integer_practice",
        courseId: nextCourseId || null,
        state: {
          profile: buildServerProfileSnapshot(profileToSave),
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not save integer practice progress.");
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedProfileRef.current) return undefined;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void saveProfileToServer(profileRef.current, courseId).catch(() => {});
    }, 900);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [courseId, profile, saveProfileToServer]);

  const saveSession = useCallback(async (summary) => {
    if (!summary || summary.questionsAnswered <= 0) return null;
    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "integer_practice",
        score: Math.round(summary.accuracy * 100),
        result: summary.leveledUp ? "level_up" : summary.accuracy >= 0.8 ? "steady_growth" : "practice",
        courseId: courseId || null,
        metadata: {
          mode,
          currentLevelId,
          highestLevelReached: profileRef.current.highestLevelReached,
          fluencyState: profileRef.current.fluencyState,
          masteredSkillTags: profileRef.current.masteredSkillTags,
          strugglingSkillTags: profileRef.current.strugglingSkillTags,
          hintDependence: profileRef.current.hintDependence,
          questionsAnswered: summary.questionsAnswered,
          accuracy: summary.accuracy,
          medianResponseMs: summary.medianResponseMs,
          averageResponseMs: summary.averageResponseMs,
          bestStreak: summary.bestStreak,
          recommendedNextFocus: summary.recommendedNextFocus,
          levelChange: summary.levelChange,
          skillTypesPracticed: summary.skillTypesPracticed,
          readinessState: summary.readinessState,
          progressionScore: summary.totalScore,
          progressionThreshold: summary.threshold,
          blockedReasons: summary.blockedReasons,
          recommendedPracticeTags: summary.recommendedPracticeTags,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not save score.");
    if (payload.stats) {
      setSavedStats((current) => ({ ...current, ...payload.stats }));
    }
    if (courseId) {
      await loadLeaderboard(courseId);
    }
    return payload.stats || null;
  }, [courseId, currentLevelId, loadLeaderboard, mode]);

  const resetQuestion = useCallback((nextLevelId, nextScaffolds = overrideScaffolds) => {
    const level = getLevelById(nextLevelId);
    const nextProblem = createProblem(level, {
      lockedSkillTag:
        mode === "assignment" && assignmentPlan.focusSkillTag !== "mixed_integer_operations"
          ? assignmentPlan.focusSkillTag
          : nextScaffolds?.remediationSkillTag || null,
      answerMode: nextScaffolds?.answerMode || level.scaffolds.answerMode,
      choiceCount: nextScaffolds?.choiceCount || level.scaffolds.choiceCount,
    });
    setProblem(nextProblem);
    setAnswerText("");
    setHintOpen(false);
    setConfidence("sure");
    inputAttemptsRef.current = 0;
    questionStartRef.current = Date.now();
    timeoutResponseMsRef.current = null;
  }, [assignmentPlan.focusSkillTag, mode, overrideScaffolds]);

  function startRun(nextMode = mode, nextLevelId = currentLevelId, nextAssignment = assignmentPlan) {
    setMode(nextMode);
    setCurrentLevelId(nextLevelId);
    setOverrideScaffolds(nextMode === "assignment" && nextAssignment.forceScaffolds ? getLevelById(nextAssignment.startLevelId).scaffolds : null);
    setSession(createEmptySession(nextLevelId));
    setSessionSummary(null);
    setFeedback(
      nextMode === "challenge"
        ? "Challenge mode is on. Fewer supports, faster responses."
        : nextMode === "assignment"
          ? "Teacher assignment loaded. Stay focused on the target skill and mastery goal."
          : nextMode === "progression"
            ? "Level progression mode tracks mastery level by level."
            : "Adaptive practice is on. The system will coach support up or down as needed."
    );
    if (nextMode === "assignment") {
      setAssignmentPlan(nextAssignment);
    }
    timeoutResponseMsRef.current = null;
    resetQuestion(nextLevelId, nextMode === "assignment" && nextAssignment.forceScaffolds ? getLevelById(nextAssignment.startLevelId).scaffolds : null);
  }

  const finishRun = useCallback(async (nextProfile, nextLevelId, levelChange, mastery = null) => {
    const summary = buildSessionSummary({
      session: sessionRef.current,
      profileSummary: summarizeProfile(nextProfile),
      level: getLevelById(nextLevelId),
      levelChange,
      mastery,
    });
    setSessionSummary(summary);
    setFeedback(
      summary.leveledUp
        ? "Run complete. Nice work leveling up. Start a new run when you're ready."
        : "Run complete. Review your summary and start a new run when you're ready."
    );
    try {
      await saveSession(summary);
    } catch (error) {
      setFeedback(error.message || "Could not save this session yet.");
    }
  }, [saveSession]);

  const registerBadgeUpdates = useCallback((nextProfile, nextSummary) => {
    const badges = buildBadges(nextSummary, nextProfile.highestLevelReached || 1);
    return {
      ...nextProfile,
      badges,
    };
  }, []);

  const applyAnswer = useCallback(async (guess, meta = {}) => {
    if (runCompleteRef.current) return;
    inputAttemptsRef.current += 1;
    const responseMs = Number.isFinite(timeoutResponseMsRef.current)
      ? timeoutResponseMsRef.current
      : Date.now() - questionStartRef.current;
    const correct = Number(guess) === problem.answer;
    const errorType = detectErrorType(problem, Number(guess), responseMs);
    const answerEntry = {
      problemId: problem.id,
      levelId: currentLevelId,
      correct,
      responseMs,
      skillTags: problem.skillTags,
      primarySkillTag: problem.primarySkillTag,
      hintUsed: hintOpen,
      attemptsUsed: inputAttemptsRef.current,
      errorType,
      confidence,
      mode,
      answerMode: activeScaffolds.answerMode,
    };

    if (!correct && !meta.timedOut && activeScaffolds.allowRetry && inputAttemptsRef.current === 1 && activeScaffolds.answerMode === "open_response") {
      setFeedback(
        `Not quite yet. This looks like ${errorType.replaceAll("_", " ")}. Try once more with the hint tools if needed.`
      );
      setHintOpen(true);
      return;
    }

    const nextSession = {
      ...sessionRef.current,
      answers: [...sessionRef.current.answers, answerEntry],
      streak: correct ? sessionRef.current.streak + 1 : 0,
      bestStreak: Math.max(sessionRef.current.bestStreak, correct ? sessionRef.current.streak + 1 : sessionRef.current.bestStreak),
      hintsUsed: sessionRef.current.hintsUsed + (hintOpen ? 1 : 0),
    };
    setSession(nextSession);

    const { profile: nextProfileBase, summary } = applyAnswerToProfile(profileRef.current, answerEntry);
    const levelPlan = computeLevelChange({
      mode,
      currentLevelId,
      profile: nextProfileBase,
      profileSummary: summary,
      assignment: assignmentPlan,
    });
    const nextLevelId = levelPlan.nextLevelId;
    const finalProfile = registerBadgeUpdates(
      {
        ...nextProfileBase,
        currentLevelId: nextLevelId,
        currentScaffolds: levelPlan.supportScaffolds || getLevelById(nextLevelId).scaffolds,
      },
      summary
    );

    setProfile(finalProfile);
    profileRef.current = finalProfile;
    setCurrentLevelId(nextLevelId);
    setOverrideScaffolds(levelPlan.supportScaffolds);

    const levelDelta = nextLevelId - currentLevelId;
    if (correct) {
      setFeedback(
        levelDelta > 0
          ? `Nice. You’ve mastered ${activeLevel.skillTags[0].replaceAll("_", " ")} and moved to ${getLevelById(nextLevelId).name}.`
          : levelPlan.mastery?.primaryFeedback || (
            summary.fluencyState === "fluent" || summary.fluencyState === "automatic"
              ? "Fast and clean. Your fluency is building."
              : "Nice. Keep the streak going."
          )
      );
    } else {
      setFeedback(
        `${meta.timedOut ? "Time ran out." : `The answer was ${answerLabel(problem.answer)}.`} ${problem.strategy.headline} ${levelPlan.supportScaffolds ? "I turned support back on for the next few reps." : ""}`.trim()
      );
    }

    const sessionReachedTarget = nextSession.answers.length >= effectiveQuestionTarget;
    if (sessionReachedTarget && hasFiniteRunTarget) {
      await finishRun(finalProfile, nextLevelId, levelDelta, levelPlan.mastery);
      return;
    }

    if (!hasFiniteRunTarget && (nextSession.answers.length % 12 === 0 || levelDelta > 0)) {
      const checkpointSummary = buildSessionSummary({
        session: nextSession,
        profileSummary: summarizeProfile(finalProfile),
        level: getLevelById(nextLevelId),
        levelChange: levelDelta,
        mastery: levelPlan.mastery,
      });
      void saveSession(checkpointSummary).catch(() => {});
    }

    resetQuestion(nextLevelId, levelPlan.supportScaffolds);
  }, [
    activeLevel,
    activeScaffolds.allowRetry,
    activeScaffolds.answerMode,
    assignmentPlan,
    confidence,
    currentLevelId,
    effectiveQuestionTarget,
    finishRun,
    hasFiniteRunTarget,
    hintOpen,
    mode,
    problem,
    registerBadgeUpdates,
    resetQuestion,
    saveSession,
  ]);

  useEffect(() => {
    if (activeScaffolds.untimed || (!activeScaffolds.timerSeconds && !(mode === "assignment" && assignmentPlan.timed))) {
      setTimeLeftMs(null);
      timeoutResponseMsRef.current = null;
      return;
    }

    const totalMs = (activeScaffolds.timerSeconds || activeLevel.timeTargetSeconds || 10) * 1000;
    setTimeLeftMs(totalMs);
    timeoutResponseMsRef.current = null;

    const intervalId = window.setInterval(() => {
      setTimeLeftMs((current) => {
        if (current === null) return null;
        const next = current - 100;
        if (next <= 0) {
          window.clearInterval(intervalId);
          timeoutResponseMsRef.current = totalMs;
          setFeedback("Time ran out for this question. You can still answer it, and the timer will restart on the next one.");
          return 0;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [activeLevel.timeTargetSeconds, activeScaffolds.timerSeconds, activeScaffolds.untimed, assignmentPlan.timed, mode, problem.id]);

  useEffect(() => {
    if (activeScaffolds.answerMode !== "multiple_choice") return;
    if (Array.isArray(problem.choices) && problem.choices.length > 0) return;

    setProblem((current) => {
      if (!current || current.id !== problem.id) return current;
      const repaired = applyScaffoldsToProblem(current, activeLevel, activeScaffolds);
      if (!Array.isArray(repaired.choices) || repaired.choices.length === 0) return current;
      return repaired;
    });
  }, [activeLevel, activeScaffolds, problem.id, problem.choices]);

  async function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    setSavedStats(personalStats);
  }

  useEffect(() => {
    function handlePageHide() {
      if (!hasHydratedProfileRef.current) return;
      saveLocalProfile(userId, courseId, profileRef.current);
      navigator.sendBeacon?.(
        "/api/play/save-state",
        new Blob(
          [
            JSON.stringify({
              gameSlug: "integer_practice",
              courseId: courseId || null,
              state: {
                profile: buildServerProfileSnapshot(profileRef.current),
              },
            }),
          ],
          { type: "application/json" }
        )
      );
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [courseId, userId]);

  const teacherPreviewLevel = getLevelById(assignmentPlan.startLevelId);
  const runIsComplete = Boolean(sessionSummary);
  const showMultipleChoice = visibleChoices.length > 0;
  const displayProgressCount = hasFiniteRunTarget
    ? Math.min(session.answers.length, effectiveQuestionTarget)
    : session.answers.length;

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails" open>
          <summary className="gameControlsSummary">
            <div>
              <h2>Game Controls</h2>
              <p>{INTEGER_MODE_PRESETS[mode].label} · {activeLevel.name} · {courseSummary}</p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
            <div>
              <p style={{ fontWeight: 700, marginBottom: "0.45rem" }}>Mode</p>
              <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                {Object.values(INTEGER_MODE_PRESETS).map((modeOption) => (
                  <button
                    key={modeOption.slug}
                    className={"btn " + (mode === modeOption.slug ? "primary" : "")}
                    type="button"
                    onClick={() => startRun(modeOption.slug, modeOption.slug === "challenge" ? Math.max(24, profile.highestLevelReached || 1) : profile.currentLevelId || 1)}
                  >
                    {modeOption.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Class context
              <select className="input" value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                <option value="">No class selected</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            {mode === "assignment" ? (
              <div className="card integerAssignmentCard" style={{ background: "#f9fbfc" }}>
                <h3>{accountType === "teacher" ? "Teacher Assignment Mode" : "Assignment Mode"}</h3>
                <div className="integerAssignmentGrid">
                  <label>
                    Start level
                    <select
                      className="input"
                      value={assignmentPlan.startLevelId}
                      onChange={(event) =>
                        setAssignmentPlan((current) =>
                          buildAssignmentPlan({ ...current, startLevelId: Number(event.target.value) })
                        )
                      }
                    >
                      {INTEGER_LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>{level.id} · {level.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    End level
                    <select
                      className="input"
                      value={assignmentPlan.endLevelId}
                      onChange={(event) =>
                        setAssignmentPlan((current) =>
                          buildAssignmentPlan({ ...current, endLevelId: Number(event.target.value) })
                        )
                      }
                    >
                      {INTEGER_LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>{level.id} · {level.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Focus skill
                    <select
                      className="input"
                      value={assignmentPlan.focusSkillTag}
                      onChange={(event) => setAssignmentPlan((current) => ({ ...current, focusSkillTag: event.target.value }))}
                    >
                      {INTEGER_SKILL_TAGS.map((tag) => (
                        <option key={tag} value={tag}>{tag.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Question count
                    <input
                      className="input"
                      type="number"
                      min="5"
                      max="30"
                      value={assignmentPlan.questionCount}
                      onChange={(event) =>
                        setAssignmentPlan((current) =>
                          buildAssignmentPlan({ ...current, questionCount: Number(event.target.value) })
                        )
                      }
                    />
                  </label>
                  <label>
                    Mastery target
                    <input
                      className="input"
                      type="number"
                      min="0.6"
                      max="0.98"
                      step="0.01"
                      value={assignmentPlan.masteryTarget}
                      onChange={(event) =>
                        setAssignmentPlan((current) =>
                          buildAssignmentPlan({ ...current, masteryTarget: Number(event.target.value) })
                        )
                      }
                    />
                  </label>
                </div>
                <div className="ctaRow" style={{ marginTop: "0.75rem" }}>
                  <button
                    className={`btn ${assignmentPlan.timed ? "primary" : ""}`}
                    type="button"
                    onClick={() => setAssignmentPlan((current) => ({ ...current, timed: !current.timed }))}
                  >
                    {assignmentPlan.timed ? "Timed" : "Untimed"}
                  </button>
                  <button
                    className={`btn ${assignmentPlan.forceScaffolds ? "primary" : ""}`}
                    type="button"
                    onClick={() => setAssignmentPlan((current) => ({ ...current, forceScaffolds: !current.forceScaffolds }))}
                  >
                    {assignmentPlan.forceScaffolds ? "Scaffolds locked" : "Scaffolds flexible"}
                  </button>
                  <button
                    className={`btn ${assignmentPlan.allowAdaptiveSupport ? "primary" : ""}`}
                    type="button"
                    onClick={() => setAssignmentPlan((current) => ({ ...current, allowAdaptiveSupport: !current.allowAdaptiveSupport }))}
                  >
                    {assignmentPlan.allowAdaptiveSupport ? "Adaptive support on" : "Adaptive support off"}
                  </button>
                </div>
                <p style={{ marginTop: "0.75rem" }}>
                  Preview: {teacherPreviewLevel.name}. Supports: {scaffoldLabel(teacherPreviewLevel.scaffolds)}.
                </p>
              </div>
            ) : null}
            <button
              className="btn primary"
              type="button"
              onClick={() => startRun(mode, mode === "assignment" ? assignmentPlan.startLevelId : currentLevelId, assignmentPlan)}
            >
              Start New Run
            </button>
          </div>
        </details>
      </section>

      <section className="card integerMainPlayCard" style={{ background: "#fff" }}>
        <h2>Practice Coach</h2>
        <div className="pillRow">
          <span className="pill">Level: {currentLevelId}</span>
          <span className="pill">
            {hasFiniteRunTarget ? `Run Progress: ${displayProgressCount}/${effectiveQuestionTarget}` : `Questions: ${displayProgressCount}`}
          </span>
          <span className="pill">Streak: {session.streak}</span>
          {timeLeftMs !== null ? <span className="pill">Timer: {formatMs(timeLeftMs)}</span> : null}
          <ProficiencyStatePill state={profileSummary.fluencyState} />
        </div>
        <div className="integerMasteryMeter">
          <div className="integerMasteryMeterFill" style={{ width: `${masteryPercent(profileSummary, currentLevelId)}%` }} />
        </div>
        <p className="integerCoachLine">
          {INTEGER_MODE_PRESETS[mode].description} Current supports: {scaffoldLabel(activeScaffolds)}.
        </p>
        <LevelReadinessCard readiness={levelReadiness} />
        {overrideScaffolds?.remediationSkillTag ? (
          <div className="integerRemediationBanner">
            Targeted support is on for {overrideScaffolds.remediationSkillTag.replaceAll("_", " ")}.
          </div>
        ) : null}
        <div className="integerPromptCard">
          <div>
            <p className="integerSupportLabel">{activeLevel.name}</p>
            <h3><MathText node={problem.promptNode} /></h3>
            <p className="integerCoachLine">
              Focus skill: {problem.primarySkillTag.replaceAll("_", " ")}.
            </p>
          </div>
          {activeScaffolds.showHintButton ? (
            <button className="btn" type="button" onClick={() => setHintOpen((current) => !current)}>
              {hintOpen ? "Hide Hint" : "Show Hint"}
            </button>
          ) : null}
        </div>

        {activeScaffolds.showNumberLine ? <NumberLine model={problem.numberLine} /> : null}
        {activeScaffolds.showCounters ? <CounterSupport counters={problem.counters} /> : null}
        {hintOpen ? (
          <StrategyCard
            strategy={problem.strategy}
            rewrite={activeScaffolds.rewriteSubtractNegative ? problem.strategy.rewrite : null}
          />
        ) : null}

        {activeScaffolds.confidenceCheck ? (
          <div className="integerConfidenceRow">
            <span className="integerSupportLabel">Confidence</span>
            {["sure", "maybe", "guessing"].map((option) => (
              <button
                key={option}
                className={`btn ${confidence === option ? "primary" : ""}`}
                type="button"
                onClick={() => setConfidence(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}

        {showMultipleChoice ? (
          <div className="choiceGrid">
            {visibleChoices.map((choice) => (
              <button
                key={choice}
                className="btn bigChoice"
                type="button"
                disabled={runIsComplete}
                onClick={() => applyAnswer(choice)}
              >
                <MathText
                  node={buildIntegerNode(choice, { parenthesizeNegative: false })}
                  className="mathChoiceContent"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="ctaRow">
            <input
              className="input"
              inputMode="numeric"
              pattern="-?[0-9]*"
              placeholder="Type your integer"
              value={answerText}
              disabled={runIsComplete}
              onChange={(event) => setAnswerText(event.target.value)}
            />
            <button
              className="btn primary"
              type="button"
              disabled={runIsComplete || !String(answerText).trim()}
              onClick={() => applyAnswer(Number(answerText), { typed: true })}
            >
              Submit
            </button>
          </div>
        )}

        {feedback ? <p className="integerFeedback"><MathInlineText text={feedback} /></p> : null}
        {runIsComplete ? (
          <div className="ctaRow">
            <button className="btn primary" type="button" onClick={() => startRun(mode, currentLevelId, assignmentPlan)}>
              Start Next Run
            </button>
          </div>
        ) : null}
        <SessionSummaryCard summary={sessionSummary} />
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Your Growth</h2>
        <div className="kv compactKv">
          <div>
            <span>Games</span>
            <strong>{savedStats?.sessions_played || 0}</strong>
          </div>
          <div>
            <span>Average</span>
            <strong>{formatScore(savedStats?.average_score)}</strong>
          </div>
          <div>
            <span>Last 10</span>
            <strong>{formatScore(savedStats?.last_10_average)}</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{formatScore(savedStats?.best_score)}</strong>
          </div>
        </div>
        <div className="card integerInsightCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Proficiency Snapshot</h3>
          <p>State: <strong>{profileSummary.fluencyState}</strong></p>
          <p>Current level: <strong>{currentLevelId}</strong></p>
          <p>Highest level reached: <strong>{profile.highestLevelReached || 1}</strong></p>
          <p>Readiness: <strong>{levelReadiness.readinessState.replaceAll("_", " ")}</strong></p>
          <p>Level score: <strong>{formatPoints(levelReadiness.totalScore)}/{formatPoints(levelReadiness.threshold)}</strong></p>
          <p>Last 10 accuracy: <strong>{formatPercent(profileSummary.last10Accuracy)}</strong></p>
          <p>Median response: <strong>{formatMs(profileSummary.medianResponseMs)}</strong></p>
          <p>Hint dependence: <strong>{formatPercent(profileSummary.hintRate)}</strong></p>
          <p>Speed trend: <strong>{profileSummary.speedTrend}</strong></p>
        </div>
        <div className="card integerInsightCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Strongest Skills</h3>
          {strongestSkills.length ? strongestSkills.map(([tag, summary]) => (
            <p key={tag}>{tag.replaceAll("_", " ")} · {formatPercent(summary.accuracy)}</p>
          )) : <p>Build a few reps and this will start mapping your strengths.</p>}
        </div>
        <div className="card integerInsightCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Needs Support</h3>
          {weakestSkills.length ? weakestSkills.map(([tag, summary]) => (
            <p key={tag}>{tag.replaceAll("_", " ")} · {formatPercent(summary.accuracy)}</p>
          )) : <p>No weak-skill data yet.</p>}
        </div>
        <div className="card integerInsightCard" style={{ background: "#f9fbfc", marginTop: "1rem" }}>
          <h3>Badges</h3>
          <div className="integerBadgeRow">
            {visibleBadges.length ? visibleBadges.map((badge) => (
              <span key={badge} className="integerBadge">{badge}</span>
            )) : <p>No badges yet. Start the ladder and they’ll appear.</p>}
          </div>
        </div>
      </section>

      <section className="card integerWideCard" style={{ background: "#fff" }}>
        <h2>Progress Ladder</h2>
        <p>Students move from heavy support to independent fluency through many small steps.</p>
        <div className="integerLevelLadder">
          {recentLevels.map((level) => {
            const status =
              level.id < currentLevelId ? "mastered" : level.id === currentLevelId ? "active" : "upcoming";
            return (
              <div key={level.id} className={`integerLevelCard ${status}`}>
                <div className="integerLevelCardTop">
                  <strong>Level {level.id}</strong>
                  <span>{status}</span>
                </div>
                <p>{level.name.replace(/^Level \d+ · /, "")}</p>
                <p className="integerMiniCopy">{level.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card integerWideCard" style={{ background: "#fff" }}>
        <h2>{accountType === "teacher" ? "Teacher Insight" : "Coach View"}</h2>
        <div className="integerTeacherGrid">
          <div className="card integerInsightCard" style={{ background: "#f9fbfc" }}>
            <h3>Current Student Snapshot</h3>
            <p>Current level: <strong>{currentLevelId}</strong></p>
            <p>Highest reached: <strong>{profile.highestLevelReached || 1}</strong></p>
            <p>Fluency rating: <strong>{profileSummary.fluencyState}</strong></p>
            <p>Time spent trend: <strong>{profileSummary.speedTrend}</strong></p>
            <p>Questions completed: <strong>{profile.rollingHistory?.length || 0}</strong></p>
          </div>
          <div className="card integerInsightCard" style={{ background: "#f9fbfc" }}>
            <h3>Scaffold Dependence</h3>
            <p>Hint rate: <strong>{formatPercent(profileSummary.hintRate)}</strong></p>
            <p>First-try correct: <strong>{formatPercent(profileSummary.firstTryCorrectRate)}</strong></p>
            <p>Average attempts: <strong>{profileSummary.averageAttemptsPerProblem?.toFixed(2) || "0.00"}</strong></p>
            <p>Current scaffold plan: <strong>{scaffoldLabel(activeScaffolds)}</strong></p>
          </div>
          <div className="card integerInsightCard" style={{ background: "#f9fbfc" }}>
            <h3>Common Error Types</h3>
            {Object.entries(profileSummary.errorTypes || {}).length ? (
              Object.entries(profileSummary.errorTypes).slice(0, 5).map(([errorType, count]) => (
                <p key={errorType}>{errorType.replaceAll("_", " ")} · {count}</p>
              ))
            ) : (
              <p>No repeated error patterns yet.</p>
            )}
          </div>
          <div className="card integerInsightCard" style={{ background: "#f9fbfc" }}>
            <h3>Recommended Next Move</h3>
            <p>
              {levelReadiness.recommendedPracticeTags?.[0]
                ? `Give more work on ${levelReadiness.recommendedPracticeTags[0].replaceAll("_", " ")} with a number line or hint prompt.`
                : "Keep stretching the next level with fewer supports."}
            </p>
            <p>
              {levelReadiness.canLevelUp
                ? "This student is ready for the next level."
                : profileSummary.fluencyState === "automatic" || profileSummary.fluencyState === "fluent"
                ? "This student is ready for Challenge / Fluency mode."
                : "This student still benefits from adaptive support."}
            </p>
          </div>
        </div>
      </section>

      <section className="card integerWideCard" style={{ background: "#fff" }}>
        <h2>Class Leaderboard</h2>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to see class-specific progress.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Finish a run to start the leaderboard.</p>
          ) : null}
          {leaderboardRows.map((row, index) => (
            <div key={row.player_id} className="card" style={{ background: "#f9fbfc" }}>
              <strong>#{index + 1} {row.display_name}</strong>
              <p>Avg: {formatScore(row.average_score)} · Last 10: {formatScore(row.last_10_average)} · Best: {row.best_score}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
