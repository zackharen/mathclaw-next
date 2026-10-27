"use client";
import { useState } from "react";
import Calculator from "./calculator";
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
export function Question({
  question,
  work: providedWork,
  onChange,
  disabled = false,
}) {
  const [previewWork, setPreviewWork] = useState({});
  const work = providedWork || previewWork;
  const update = (patch) =>
    onChange
      ? onChange((current) => ({ ...current, ...patch }))
      : setPreviewWork((current) => ({ ...current, ...patch }));
  return (
    <article className="mcQuestion">
      <div className="mcEyebrow">
        {question.spiral ? "Spiral review · " : ""}
        {question.points} points · {question.name || question.skill}
      </div>
      <h2 style={{ whiteSpace: "pre-wrap" }}>{question.prompt}</h2>
      {question.visual && (
        <div
          className="mcVisual"
          dangerouslySetInnerHTML={{ __html: question.visual }}
        />
      )}
      <p>
        <strong>Success criteria:</strong> {question.criteria}
      </p>
      <p>
        <strong>Allowed supports:</strong>{" "}
        {question.supports || "None specified"}
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
                {c.text}
              </label>
            ))}
          </div>
        ) : (
          <label>
            Answer
            <textarea
              value={work.answer || ""}
              onChange={(e) => update({ answer: e.target.value })}
            />
          </label>
        )}
        <label>
          Show or explain your work
          <textarea
            value={work.typed || ""}
            onChange={(e) => update({ typed: e.target.value })}
          />
        </label>
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
