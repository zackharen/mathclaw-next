"use client";
import { questionWorkMode } from "@/lib/assessments/core";
import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import MathPrint from "./math-print";
import Calculator from "./calculator";
import SafeVisual from "./safe-visual";
export async function api(path, data) {
  const r = await fetch(
    path,
    data
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  );
  const out = await r.json();
  if (!r.ok) throw Error(out.error || "Unable to save. Please try again.");
  return out;
}

const equationKeys = [
  { label: "Fraction", symbol: "a⁄b", text: "/" },
  { label: "Exponent", symbol: "xⁿ", text: "^" },
  { label: "Square root", symbol: "√", text: "sqrt(", end: ")" },
  { label: "Parentheses", symbol: "( )", text: "(", end: ")" },
  { label: "Equals", symbol: "=", text: "=" },
  { label: "Less than or equal to", symbol: "≤", text: "<=" },
  { label: "Greater than or equal to", symbol: "≥", text: ">=" },
];

function FinalAnswer({ value, onChange, equationEditor }) {
  const id = useId();
  const answer = useRef(null);

  function insert({ text, end = "" }) {
    const field = answer.current;
    const start = field.selectionStart;
    const stop = field.selectionEnd;
    const selected = field.value.slice(start, stop);
    const replacement = end ? text + selected + end : text;
    const next = field.value.slice(0, start) + replacement + field.value.slice(stop);
    if (next.length > field.maxLength) return;
    flushSync(() => onChange(next));
    const cursor = start + (end && !selected ? text.length : replacement.length);
    field.focus();
    field.setSelectionRange(cursor, cursor);
  }

  return (
    <div className="mcFinalAnswer">
      <label htmlFor={id}>Final answer</label>
      <textarea
        id={id}
        ref={answer}
        maxLength={16000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {equationEditor && (
        <details>
          <summary>Equation Editor</summary>
          <div className="mcEquationKeys" role="group" aria-label="Equation symbols">
            {equationKeys.map((key) => (
              <button
                key={key.label}
                type="button"
                aria-label={key.label}
                title={key.label}
                onClick={() => insert(key)}
              >
                {key.symbol}
              </button>
            ))}
          </div>
          {value && <div>Preview: <MathPrint text={value} /></div>}
        </details>
      )}
    </div>
  );
}

export function Question({
  question,
  work: providedWork,
  onChange,
  disabled = false,
  number,
  workMode,
  equationEditor = true,
}) {
  const [previewWork, setPreviewWork] = useState({});
  const work = providedWork || previewWork;
  const mode = workMode || questionWorkMode(question);
  const update = (patch) =>
    onChange
      ? onChange((current) => ({ ...current, ...patch }))
      : setPreviewWork((current) => ({ ...current, ...patch }));
  const typedWork = (
    <label>
      {mode === "paper"
        ? "Optional typed work"
        : mode === "either"
          ? "Typed work (or use paper)"
          : "Show or explain your work online"}
      <textarea
        value={work.typed || ""}
        onChange={(e) => update({ typed: e.target.value })}
      />
    </label>
  );
  return (
    <article className="mcQuestion">
      <div className="mcEyebrow">
        {number ? `Question ${number} · ` : ""}
        {question.spiral ? "Spiral review · " : ""}
        {question.points} points · {question.name || question.skill}
      </div>
      <h2 style={{ whiteSpace: "pre-wrap" }}>
        <MathPrint text={question.prompt} />
      </h2>
      {question.visual && (
        <SafeVisual className="mcVisual" html={question.visual} />
      )}
      <p>
        <strong>Success criteria:</strong>{" "}
        <MathPrint text={question.criteria} />
      </p>
      <p>
        <strong>Allowed supports:</strong>{" "}
        <MathPrint text={question.supports || "None specified"} />
      </p>
      <p className="mcNotice">
        {mode === "paper"
          ? "Enter your final answer online and show your reasoning on paper. "
          : mode === "typed"
            ? "Enter your final answer and show your reasoning online. "
            : "Enter your final answer online. Show your reasoning on paper or type it below. "}
        {mode !== "typed" && (
          <>
            {mode === "either"
              ? "If using paper, label it "
              : "Label your paper "}
            {number ? `Question ${number}` : "with this question"} and hand it
            in to your teacher. Your teacher reviews paper work for reasoning
            and partial credit.
          </>
        )}
      </p>
      <fieldset disabled={disabled}>
        <legend>Your response</legend>
        {question.choices ? (
          <div className="mcChoices">
            {question.choices.map((c, i) => (
              <label key={i}>
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  checked={work.answer === c.text}
                  onChange={() => update({ answer: c.text })}
                />
                <MathPrint text={c.text} />
              </label>
            ))}
          </div>
        ) : (
          <FinalAnswer
            key={question.id}
            value={work.answer || ""}
            onChange={(answer) => update({ answer })}
            equationEditor={equationEditor && !disabled}
          />
        )}
        {mode === "paper" ? (
          <details open={Boolean(work.typed)}>
            <summary>Prefer to type your work? (optional)</summary>
            {typedWork}
          </details>
        ) : (
          typedWork
        )}
      </fieldset>
      {question.desmos && (
        <Calculator
          key={`${question.id}:${disabled}`}
          question={question}
          state={work.graph}
          disabled={disabled}
          onChange={(graph, resetChoice) =>
            update({ graph, ...(resetChoice ? { choice: null } : {}) })
          }
          choice={work.choice}
          onChoice={(choice) => update({ choice })}
        />
      )}
    </article>
  );
}
export function ClassPicker({ courses, course, base }) {
  return (
    <label className="mcClassPicker">
      Class
      <select
        value={course.id}
        onChange={(e) => {
          window.location.href = `${base}?course=${e.target.value}`;
        }}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}
