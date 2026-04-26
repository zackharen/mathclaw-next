"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DIAL_SIZE = 40;
const DIAL_STEP_DEGREES = 360 / DIAL_SIZE;
const SLIDER_LIMIT = 160;
const RIGHT_TICK_LABEL = "Turn right / clockwise";
const LEFT_TICK_LABEL = "Turn left / counterclockwise";

const LEVEL_CONFIG = {
  1: {
    steps: 1,
    tolerance: 2,
    showDirection: true,
    highlightTarget: true,
    promptMode: "exact",
  },
  2: {
    steps: 1,
    tolerance: 2,
    showDirection: true,
    highlightTarget: true,
    promptMode: "exact",
  },
  3: {
    steps: 3,
    tolerance: 1,
    showDirection: true,
    highlightTarget: true,
    promptMode: "step",
  },
  4: {
    steps: 3,
    tolerance: 1,
    showDirection: true,
    highlightTarget: false,
    promptMode: "step",
  },
  5: {
    steps: 3,
    tolerance: 0,
    showDirection: false,
    highlightTarget: false,
    promptMode: "combo_only",
  },
  6: {
    steps: 3,
    tolerance: 0,
    showDirection: false,
    highlightTarget: false,
    promptMode: "combo_only",
    realisticRules: true,
  },
};

function formatScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function normalizeDialNumber(value) {
  return ((Math.round(value) % DIAL_SIZE) + DIAL_SIZE) % DIAL_SIZE;
}

function dialDistance(from, to) {
  const gap = Math.abs(normalizeDialNumber(from) - normalizeDialNumber(to));
  return Math.min(gap, DIAL_SIZE - gap);
}

function randomNumberExcluding(excluded = []) {
  let candidate = 0;
  do {
    candidate = Math.floor(Math.random() * DIAL_SIZE);
  } while (excluded.includes(candidate));
  return candidate;
}

function buildCombo() {
  const first = randomNumberExcluding([0]);
  const second = randomNumberExcluding([first]);
  const third = randomNumberExcluding([first, second]);
  return [first, second, third];
}

function buildChallenge(level) {
  if (level === 1) {
    return {
      combo: [28],
      steps: [{ direction: "right", target: 28 }],
    };
  }

  if (level === 2) {
    const direction = Math.random() > 0.5 ? "right" : "left";
    const target = randomNumberExcluding([0]);
    return {
      combo: [target],
      steps: [{ direction, target }],
    };
  }

  const combo = buildCombo();
  return {
    combo,
    steps: [
      { direction: "right", target: combo[0] },
      { direction: "left", target: combo[1] },
      { direction: "right", target: combo[2] },
    ],
  };
}

function directionLabel(direction) {
  return direction === "left" ? "left" : "right";
}

function directionArrow(direction) {
  return direction === "left" ? "←" : "→";
}

function buildPrompt(level, challenge, stepIndex) {
  const step = challenge.steps[stepIndex];
  const config = LEVEL_CONFIG[level];

  if (!step) return "";
  if (level === 1) return "Turn right to 28.";
  if (config.promptMode === "exact") {
    return `Turn ${directionLabel(step.direction)} to ${step.target}.`;
  }
  if (config.promptMode === "step") {
    return `Step ${stepIndex + 1} of ${challenge.steps.length}: Turn ${directionLabel(step.direction)} to ${step.target}.`;
  }
  return `Combination: ${challenge.combo.join(" - ")}`;
}

function buildSuccessMessage(stepIndex, totalSteps) {
  if (totalSteps === 1) {
    return "Locker unlocked!";
  }
  if (stepIndex === 0) {
    return "Nice! You found the first number.";
  }
  if (stepIndex === 1) {
    return "Nice! Second number found.";
  }
  return "Locker unlocked!";
}

function buildHint({ level, step, currentNumber, stepStartNumber }) {
  const hints = [
    `Start by turning the dial to the ${directionLabel(step.direction)}.`,
    "Watch the number under the top marker.",
    "Go slowly when you are close to the target.",
    "Reset this step if you feel lost.",
  ];

  if (step.direction === "left" && step.target !== undefined) {
    hints.splice(3, 0, "For the second number, turn the opposite direction.");
  }

  if (dialDistance(currentNumber, step.target) <= 3) {
    return "Go slowly when you are close to the target.";
  }

  if (level >= 6 && step.direction === "right" && stepStartNumber === 0) {
    return "For the first number on a real lock, keep turning right for a few full turns before you stop.";
  }

  return hints[Math.min(hints.length - 1, Math.max(0, level - 1))];
}

function summarizeAttempt({
  step,
  config,
  currentNumber,
  stepStartNumber,
  sliderValue,
  stepStats,
}) {
  const directionOk = stepStats.firstDirection === step.direction;
  const withinTolerance = dialDistance(currentNumber, step.target) <= config.tolerance;
  const expectedTicks =
    step.direction === "right"
      ? normalizeDialNumber(stepStartNumber - step.target)
      : normalizeDialNumber(step.target - stepStartNumber);

  if (!directionOk) {
    return {
      ok: false,
      wrongDirection: true,
      message: "Try the other direction first.",
    };
  }

  if (config.realisticRules) {
    if (step.direction === "right" && stepStartNumber === 0 && stepStats.clockwiseTicks < 120) {
      return {
        ok: false,
        wrongDirection: false,
        message: "Real locks usually start with a few full turns to the right before the first number.",
      };
    }

    if (step.direction === "left" && stepStats.counterclockwiseTicks < 40) {
      return {
        ok: false,
        wrongDirection: false,
        message: "For the second number, turn left through a full pass before stopping.",
      };
    }

    if (step.direction === "left" && stepStats.startPasses < 1) {
      return {
        ok: false,
        wrongDirection: false,
        message: "Keep turning left past the first number once, then come back to the second number.",
      };
    }

    if (step.direction === "right" && stepStartNumber !== 0 && stepStats.counterclockwiseTicks > 0) {
      return {
        ok: false,
        wrongDirection: false,
        message: "For the last number, turn right straight to it without switching directions.",
      };
    }
  }

  if (withinTolerance) {
    return {
      ok: true,
      wrongDirection: false,
      message: "",
    };
  }

  const travelled = Math.abs(sliderValue);
  const stoppedEarly = travelled < expectedTicks;
  return {
    ok: false,
    wrongDirection: false,
    message: stoppedEarly
      ? "Almost there — you turned the right way, but stopped a little early."
      : "Almost there — you turned the right way, but went a little past the target.",
  };
}

function DialFace({ currentNumber, highlightedNumber, sliderValue, showTargetHighlight }) {
  return (
    <div className="lockerDialShell">
      <div className="lockerDialPointer" aria-hidden="true" />
      <div
        className="lockerDialFace"
        style={{ transform: `rotate(${-sliderValue * DIAL_STEP_DEGREES}deg)` }}
        aria-hidden="true"
      >
        {Array.from({ length: DIAL_SIZE }, (_, number) => {
          const angle = -number * DIAL_STEP_DEGREES;
          const isHighlighted = showTargetHighlight && highlightedNumber === number;
          return (
            <span
              key={number}
              className={`lockerDialMark ${isHighlighted ? "isTarget" : ""}`}
              style={{ transform: `rotate(${angle}deg) translateY(calc(-1 * var(--locker-dial-mark-radius))) rotate(${-angle}deg)` }}
            >
              {number}
            </span>
          );
        })}
      </div>
      <div className="lockerDialCenter">
        <span className="lockerDialCenterLabel">Marker</span>
        <strong>{currentNumber}</strong>
      </div>
    </div>
  );
}

export default function LockerPracticeClient({
  courses,
  initialCourseId,
  initialLeaderboard,
  personalStats,
}) {
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [level, setLevel] = useState(1);
  const [challenge, setChallenge] = useState(() => buildChallenge(1));
  const [stepIndex, setStepIndex] = useState(0);
  const [stepStartNumber, setStepStartNumber] = useState(0);
  const [sliderValue, setSliderValue] = useState(0);
  const [currentNumber, setCurrentNumber] = useState(0);
  const [feedback, setFeedback] = useState("Turn the slider to practice the first step.");
  const [screenReaderFeedback, setScreenReaderFeedback] = useState("Locker Practice loaded.");
  const [visibleHint, setVisibleHint] = useState("");
  const [leaderboardRows, setLeaderboardRows] = useState(initialLeaderboard || []);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [savedStats, setSavedStats] = useState(personalStats);
  const [progress, setProgress] = useState({
    correctAttempts: 0,
    failedAttempts: 0,
    hintsUsed: 0,
    resetsUsed: 0,
    streak: 0,
  });
  const [comboHistory, setComboHistory] = useState([]);
  const comboStatsRef = useRef({ hintsUsed: 0, resetsUsed: 0, failedChecks: 0, wrongDirectionChecks: 0 });
  const stepStatsRef = useRef({
    firstDirection: null,
    clockwiseTicks: 0,
    counterclockwiseTicks: 0,
    startPasses: 0,
  });
  const previousSliderValueRef = useRef(0);

  const config = LEVEL_CONFIG[level];
  const currentStep = challenge.steps[stepIndex];
  const courseSummary = courses.find((course) => course.id === courseId)?.title || "No class selected";
  const stepPrompt = useMemo(
    () => buildPrompt(level, challenge, stepIndex),
    [challenge, level, stepIndex]
  );

  const loadLeaderboard = useCallback(async (nextCourseId) => {
    if (!nextCourseId) {
      setLeaderboardRows([]);
      return;
    }

    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        `/api/play/leaderboard?gameSlug=locker_practice&courseId=${encodeURIComponent(nextCourseId)}`
      );
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
    if (!courseId) {
      setLeaderboardRows([]);
      return;
    }

    if (courseId === initialCourseId && (initialLeaderboard || []).length > 0) {
      return;
    }

    loadLeaderboard(courseId);
  }, [courseId, initialCourseId, initialLeaderboard, loadLeaderboard]);

  const resetStepState = useCallback((nextStartNumber = stepStartNumber) => {
    previousSliderValueRef.current = 0;
    stepStatsRef.current = {
      firstDirection: null,
      clockwiseTicks: 0,
      counterclockwiseTicks: 0,
      startPasses: 0,
    };
    setSliderValue(0);
    setCurrentNumber(nextStartNumber);
  }, [stepStartNumber]);

  const beginChallenge = useCallback((
    nextLevel,
    nextStartNumber = 0,
    nextChallenge = buildChallenge(nextLevel),
    statusMessage = "New locker ready. Start with the first move."
  ) => {
    comboStatsRef.current = { hintsUsed: 0, resetsUsed: 0, failedChecks: 0, wrongDirectionChecks: 0 };
    setChallenge(nextChallenge);
    setStepIndex(0);
    setStepStartNumber(nextStartNumber);
    setVisibleHint("");
    setFeedback(statusMessage);
    resetStepState(nextStartNumber);
  }, [resetStepState]);

  async function saveCompletedCombo(snapshot) {
    const response = await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "locker_practice",
        score: snapshot.score,
        result: "unlocked",
        courseId: snapshot.courseId || null,
        metadata: {
          level: snapshot.level,
          combo: snapshot.combo,
          hints_used: snapshot.hintsUsed,
          resets_used: snapshot.resetsUsed,
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not save that practice result.");
    }

    if (payload.stats) {
      setSavedStats((current) => ({
        ...current,
        ...payload.stats,
      }));
    }

    await loadLeaderboard(snapshot.courseId || "");
  }

  function applyLevelAdjustments(history, currentLevel, comboStats) {
    const lastThree = history.slice(-3);
    const shouldLevelUp =
      lastThree.length === 3 &&
      lastThree.every((entry) => entry.success) &&
      lastThree.reduce((sum, entry) => sum + entry.hintsUsed, 0) <= 1;

    if (shouldLevelUp) {
      return Math.min(6, currentLevel + 1);
    }

    if (comboStats.wrongDirectionChecks >= 2 || comboStats.failedChecks >= 3) {
      return Math.max(1, currentLevel - 1);
    }

    return currentLevel;
  }

  function handleSliderChange(nextValue) {
    const previousValue = previousSliderValueRef.current;
    const delta = nextValue - previousValue;
    previousSliderValueRef.current = nextValue;
    setSliderValue(nextValue);
    setCurrentNumber(normalizeDialNumber(stepStartNumber - nextValue));

    if (delta === 0) {
      return;
    }

    const direction = delta > 0 ? "right" : "left";
    if (!stepStatsRef.current.firstDirection) {
      stepStatsRef.current.firstDirection = direction;
    }
    if (direction === "right") {
      stepStatsRef.current.clockwiseTicks += Math.abs(delta);
    } else {
      stepStatsRef.current.counterclockwiseTicks += Math.abs(delta);
    }

    for (let tick = previousValue + Math.sign(delta); tick !== nextValue + Math.sign(delta); tick += Math.sign(delta)) {
      if (tick !== 0 && normalizeDialNumber(stepStartNumber - tick) === stepStartNumber) {
        stepStatsRef.current.startPasses += 1;
      }
    }
  }

  function resetCurrentStep(manual = true) {
    if (manual) {
      comboStatsRef.current = {
        ...comboStatsRef.current,
        resetsUsed: comboStatsRef.current.resetsUsed + 1,
      };
      setProgress((current) => ({
        ...current,
        resetsUsed: current.resetsUsed + 1,
      }));
      setFeedback("Step reset. You can start that turn again from the current number.");
      setScreenReaderFeedback("Step reset.");
    }
    setVisibleHint("");
    resetStepState(stepStartNumber);
  }

  async function completeCombo(successMessage) {
    const completedComboStats = { ...comboStatsRef.current };
    const snapshot = {
      courseId,
      combo: challenge.combo,
      level,
      hintsUsed: completedComboStats.hintsUsed,
      resetsUsed: completedComboStats.resetsUsed,
      score: Math.max(
        1,
        level * 10 + challenge.steps.length * 3 - completedComboStats.hintsUsed - completedComboStats.resetsUsed
      ),
    };

    const nextHistory = [
      ...comboHistory,
      {
        success: true,
        hintsUsed: completedComboStats.hintsUsed,
      },
    ].slice(-6);
    const adjustedLevel = applyLevelAdjustments(nextHistory, level, completedComboStats);

    setComboHistory(nextHistory);
    setProgress((current) => ({
      ...current,
      correctAttempts: current.correctAttempts + 1,
      streak: current.streak + 1,
      hintsUsed: current.hintsUsed + completedComboStats.hintsUsed,
    }));

    const nextMessage =
      adjustedLevel > level
        ? `${successMessage} Level up! You are ready for a slightly trickier lock.`
        : successMessage;

    try {
      await saveCompletedCombo(snapshot);
    } catch (error) {
      beginChallenge(
        adjustedLevel,
        0,
        buildChallenge(adjustedLevel),
        error.message || "Locker opened, but the score could not be saved."
      );
      return;
    }
    setScreenReaderFeedback(successMessage);

    if (adjustedLevel !== level) {
      setLevel(adjustedLevel);
    }
    beginChallenge(adjustedLevel, 0, buildChallenge(adjustedLevel), nextMessage);
  }

  function failCombo(reasonMessage) {
    const completedComboStats = { ...comboStatsRef.current };
    const nextHistory = [
      ...comboHistory,
      {
        success: false,
        hintsUsed: completedComboStats.hintsUsed,
      },
    ].slice(-6);
    const adjustedLevel = applyLevelAdjustments(nextHistory, level, completedComboStats);

    setComboHistory(nextHistory);
    setProgress((current) => ({
      ...current,
      hintsUsed: current.hintsUsed + completedComboStats.hintsUsed,
      streak: 0,
    }));
    const nextMessage =
      adjustedLevel < level
        ? `${reasonMessage} We added a little more support for the next round.`
        : reasonMessage;
    setFeedback(nextMessage);
    setScreenReaderFeedback(reasonMessage);

    if (adjustedLevel !== level) {
      setLevel(adjustedLevel);
    }
    beginChallenge(adjustedLevel, 0, buildChallenge(adjustedLevel), nextMessage);
  }

  async function confirmStep() {
    if (!currentStep) {
      return;
    }

    const attempt = summarizeAttempt({
      step: currentStep,
      config,
      currentNumber,
      stepStartNumber,
      sliderValue,
      stepStats: stepStatsRef.current,
    });

    if (!attempt.ok) {
      const nextComboStats = {
        ...comboStatsRef.current,
        failedChecks: comboStatsRef.current.failedChecks + 1,
        wrongDirectionChecks:
          comboStatsRef.current.wrongDirectionChecks + (attempt.wrongDirection ? 1 : 0),
      };
      comboStatsRef.current = nextComboStats;

      setProgress((current) => ({
        ...current,
        failedAttempts: current.failedAttempts + 1,
        streak: 0,
      }));
      setFeedback(attempt.message);
      setScreenReaderFeedback(attempt.message);

      if (nextComboStats.failedChecks >= 3 || nextComboStats.wrongDirectionChecks >= 2) {
        failCombo("Let's start a fresh lock and try again with a little more support.");
      }
      return;
    }

    const successMessage = buildSuccessMessage(stepIndex, challenge.steps.length);
    if (stepIndex === challenge.steps.length - 1) {
      await completeCombo(successMessage);
      return;
    }

    const nextStepIndex = stepIndex + 1;
    const nextStartNumber = currentNumber;
    setStepIndex(nextStepIndex);
    setStepStartNumber(nextStartNumber);
    setVisibleHint("");
    setFeedback(successMessage);
    setScreenReaderFeedback(successMessage);
    resetStepState(nextStartNumber);
  }

  function handleCourseChange(nextCourseId) {
    setCourseId(nextCourseId);
    setScreenReaderFeedback("Class changed.");
    beginChallenge(level, 0, buildChallenge(level), "Class updated. Your next locker round is ready.");
  }

  function handleShowHint() {
    const nextHint = buildHint({
      level,
      step: currentStep,
      currentNumber,
      stepStartNumber,
    });
    comboStatsRef.current = {
      ...comboStatsRef.current,
      hintsUsed: comboStatsRef.current.hintsUsed + 1,
    };
    setVisibleHint(nextHint);
    setFeedback(nextHint);
    setScreenReaderFeedback(nextHint);
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <details className="gameControlsDetails">
          <summary className="gameControlsSummary">
            <div>
              <h2>Practice Setup</h2>
              <p>
                Level {level} · {courseSummary} · Tolerance {config.tolerance === 0 ? "Exact" : `±${config.tolerance}`}
              </p>
            </div>
            <span className="gameControlsToggle">
              <span className="showLabel">Show</span>
              <span className="hideLabel">Hide</span>
            </span>
          </summary>
          <div className="gameControlsBody list">
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
            <button className="btn" type="button" onClick={() => beginChallenge(level)}>
              New Locker
            </button>
          </div>
        </details>
      </section>

      <section className="card lockerPracticeCard" style={{ background: "#fff" }}>
        <div className="lockerPracticeHeader">
          <div>
            <h2>Locker Practice Station</h2>
            <p>{stepPrompt}</p>
          </div>
          <div className="pillRow">
            <span className="pill">Level {level}</span>
            <span className="pill">Step {stepIndex + 1} / {challenge.steps.length}</span>
            <span className="pill">Number {currentNumber}</span>
          </div>
        </div>

        <div className="lockerPromptPanel">
          {config.showDirection ? (
            <div className="lockerDirectionBadge" aria-label={`Turn ${directionLabel(currentStep.direction)}`}>
              <span aria-hidden="true">{directionArrow(currentStep.direction)}</span>
              <strong>Turn {directionLabel(currentStep.direction)}</strong>
            </div>
          ) : null}
          <div className="lockerComboStrip" aria-label={`Combination ${challenge.combo.join(", ")}`}>
            {challenge.combo.map((value, index) => (
              <span
                key={`${value}-${index}`}
                className={`lockerComboChip ${
                  config.promptMode === "step" && index === stepIndex ? "isActive" : ""
                }`}
              >
                {value}
              </span>
            ))}
          </div>
        </div>

        <DialFace
          currentNumber={currentNumber}
          highlightedNumber={currentStep.target}
          sliderValue={sliderValue}
          showTargetHighlight={config.highlightTarget}
        />

        <div className="lockerSliderPanel">
          <div className="lockerSliderLabels">
            <span>{LEFT_TICK_LABEL}</span>
            <span>{RIGHT_TICK_LABEL}</span>
          </div>
          <input
            className="lockerSlider"
            type="range"
            min={-SLIDER_LIMIT}
            max={SLIDER_LIMIT}
            step={1}
            value={sliderValue}
            onChange={(event) => handleSliderChange(Number(event.target.value))}
            aria-label="Locker dial turn slider"
            aria-describedby="locker-slider-help locker-feedback"
          />
          <p id="locker-slider-help" className="lockerHelperText">
            The slider always starts centered at 0 for each step. Move left to turn left, or right to turn right.
          </p>
        </div>

        <div className="ctaRow lockerActionRow">
          <button className="btn primary" type="button" onClick={confirmStep}>
            That&apos;s good
          </button>
          <button className="btn" type="button" onClick={() => resetCurrentStep(true)}>
            Reset step
          </button>
          <button className="btn" type="button" onClick={handleShowHint}>
            {visibleHint ? "Show another hint" : "Show hint"}
          </button>
        </div>

        <div id="locker-feedback" className="lockerFeedbackPanel" aria-live="polite">
          <strong>{feedback}</strong>
          {visibleHint ? <p>{visibleHint}</p> : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {screenReaderFeedback}
        </p>
      </section>

      <section className="card" style={{ background: "#fff" }}>
        <h2>Practice Progress</h2>
        <div className="kv compactKv">
          <div>
            <span>Correct combos</span>
            <strong>{progress.correctAttempts}</strong>
          </div>
          <div>
            <span>Misses</span>
            <strong>{progress.failedAttempts}</strong>
          </div>
          <div>
            <span>Hints used</span>
            <strong>{progress.hintsUsed}</strong>
          </div>
          <div>
            <span>Resets used</span>
            <strong>{progress.resetsUsed}</strong>
          </div>
          <div>
            <span>Streak</span>
            <strong>{progress.streak}</strong>
          </div>
        </div>

        <h3 style={{ marginTop: "1rem" }}>Your Stats</h3>
        {savedStats ? (
          <div className="kv compactKv" style={{ marginTop: "0.75rem" }}>
            <div>
              <span>Saved runs</span>
              <strong>{savedStats.sessions_played}</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{formatScore(savedStats.average_score)}</strong>
            </div>
            <div>
              <span>Last 10</span>
              <strong>{formatScore(savedStats.last_10_average)}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{savedStats.best_score}</strong>
            </div>
          </div>
        ) : (
          <p style={{ marginTop: "0.75rem" }}>Unlock a few lockers to start building stats.</p>
        )}

        <h3 style={{ marginTop: "1rem" }}>{courseId ? "Class Leaderboard" : "Leaderboard"}</h3>
        <div className="list" style={{ marginTop: "0.75rem" }}>
          {!courseId ? <p>Select a class to compare locker practice with classmates.</p> : null}
          {courseId && leaderboardLoading ? <p>Loading class leaderboard...</p> : null}
          {courseId && !leaderboardLoading && leaderboardRows.length === 0 ? (
            <p>No class scores yet. Open a few lockers to get the leaderboard started.</p>
          ) : null}
          {leaderboardRows.map((row, index) => (
            <div key={row.player_id} className="card" style={{ background: "#f9fbfc" }}>
              <strong>#{index + 1} {row.display_name}</strong>
              <p>
                Avg: {formatScore(row.average_score)} · Last 10: {formatScore(row.last_10_average)} · Best: {row.best_score}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
