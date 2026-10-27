"use client";
import { useEffect, useRef, useState } from "react";
import { choiceExpressions } from "@/lib/assessments/graph-choices";
let loading;
function load() {
  if (window.Desmos?.GraphingCalculator) return Promise.resolve(window.Desmos);
  if (loading) return loading;
  loading = (async () => {
    const config = await fetch("/api/desmos?calculator=1", {
      cache: "no-store",
    }).then((r) => (r.ok ? r.json() : {}));
    const key = config.apiKey || process.env.NEXT_PUBLIC_DESMOS_API_KEY;
    if (!key)
      throw Error(
        "The embedded calculator needs MathClaw's Desmos API key. Use the calculator link while your teacher configures it.",
      );
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(key)}`;
      script.onload = () => resolve(window.Desmos);
      script.onerror = () =>
        reject(Error("Desmos could not load. Your typed work can still save."));
      document.head.appendChild(script);
    });
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export default function Calculator({
  question,
  state,
  onChange,
  disabled = false,
  choice,
  onChoice,
}) {
  const el = useRef(null),
    plots = useRef([]),
    callback = useRef(onChange),
    initial = useRef(state),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    let cancelled = false,
      calc,
      alternatives = [],
      restoring = true,
      clearChoiceTimer;
    load()
      .then((D) => {
        if (cancelled) return;
        calc = D.GraphingCalculator(el.current, {
          images: false,
          links: false,
          notes: false,
          folders: false,
          restrictedFunctions: true,
          forceEnableGeometryFunctions: true,
          forceLogModeRegressions: true,
        });
        if (initial.current) calc.setState(initial.current);
        else if (question.repair) {
          calc.setExpressions(question.repair.expressions);
          calc.setMathBounds(question.repair.bounds);
          calc.updateSettings({ degreeMode: question.repair.degreeMode });
        }
        if (question.graphChoices)
          alternatives = plots.current.map((p) =>
            D.GraphingCalculator(p, {
              expressions: false,
              settingsMenu: false,
              zoomButtons: false,
              keypad: false,
              lockViewport: true,
              trace: false,
              pointsOfInterest: false,
            }),
          );
        let signature = "",
          choiceTimer;
        function syncChoices() {
          if (cancelled || !alternatives.length) return;
          const expressions = calc.getExpressions(),
            choices = choiceExpressions(expressions);
          const valid =
            choices &&
            expressions
              .filter((e) => e.latex)
              .every((e) => !calc.expressionAnalysis[e.id]?.isError);
          setReady(Boolean(valid));
          alternatives.forEach((c, i) => {
            c.setBlank();
            if (valid) {
              c.setExpressions(choices[i]);
              c.setMathBounds(calc.graphpaperBounds.mathCoordinates);
            }
          });
        }
        function changed() {
          if (restoring) return;
          const next = JSON.stringify(
            calc
              .getExpressions()
              .filter((e) => e.latex)
              .map((e) => e.latex),
          );
          const resetChoice = Boolean(signature && signature !== next);
          signature = next;
          // One update contains both graph and selection; separate callbacks
          // can race against the same React render's older work snapshot.
          if (!disabled) callback.current?.(calc.getState(), resetChoice);
          clearTimeout(choiceTimer);
          choiceTimer = setTimeout(syncChoices, 180);
        }
        clearChoiceTimer = () => clearTimeout(choiceTimer);
        calc.observeEvent("change", changed);
        restoring = false;
        syncChoices();
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      clearChoiceTimer?.();
      calc?.destroy();
      alternatives.forEach((c) => c.destroy());
    };
    // Each question mounts a new calculator with its saved state. Freeze remounts it read-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, disabled]);
  return (
    <section className="mcCalculator">
      <div
        ref={el}
        className={`mcGraph ${disabled ? "mcGraphFrozen" : ""}`}
        aria-label="Desmos graphing workspace"
      />
      {error && (
        <p role="status">
          {error}{" "}
          <a
            href="https://www.desmos.com/calculator"
            target="_blank"
            rel="noreferrer"
          >
            Open Desmos
          </a>
        </p>
      )}
      {question.graphChoices && (
        <>
          <p>
            All choices follow your two inequalities, colors and window. Check
            your entries against the prompt, select a region, and explain. These
            choices do not validate your inequalities.
          </p>
          <div className="mcGraphChoices">
            {["A", "B", "C", "D"].map((v, i) => (
              <label key={v}>
                <input
                  type="radio"
                  name={`region-${question.id}`}
                  checked={choice === v}
                  disabled={disabled || !ready}
                  onChange={() => onChoice(v)}
                />
                Graph {v}
                <div
                  ref={(e) => {
                    plots.current[i] = e;
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
