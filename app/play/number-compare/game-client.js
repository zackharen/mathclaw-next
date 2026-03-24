"use client";

import { useState } from "react";

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function fractionValue() {
  const numerator = Math.floor(Math.random() * 19) - 9 || 1;
  const denominator = Math.floor(Math.random() * 8) + 2;
  const divisor = gcd(numerator, denominator);
  return {
    label: `${numerator / divisor}/${denominator / divisor}`,
    value: numerator / denominator,
  };
}

function squareRootValue() {
  const inside = Math.floor(Math.random() * 90) + 2;
  return {
    label: `√${inside}`,
    value: Math.sqrt(inside),
  };
}

function decimalValue(places) {
  const raw = Math.random() * 40 - 20;
  const value = roundTo(raw, places);
  return { label: value.toFixed(places), value };
}

function integerValue(allowNegative) {
  const value = allowNegative ? Math.floor(Math.random() * 41) - 20 : Math.floor(Math.random() * 21);
  return { label: String(value), value };
}

function buildNumber(settings) {
  const pool = [];
  if (settings.decimals.length > 0) pool.push("decimal");
  if (settings.positiveNegative) pool.push("integer");
  if (settings.fractions) pool.push("fraction");
  if (settings.squareRoots) pool.push("root");
  const choice = pool[Math.floor(Math.random() * pool.length)] || "integer";
  if (choice === "decimal") {
    const places = settings.decimals[Math.floor(Math.random() * settings.decimals.length)];
    return decimalValue(places);
  }
  if (choice === "fraction") return fractionValue();
  if (choice === "root") return squareRootValue();
  return integerValue(settings.positiveNegative);
}

export default function NumberCompareClient({ courses }) {
  const [settings, setSettings] = useState({
    decimals: [1, 2],
    positiveNegative: true,
    fractions: true,
    squareRoots: false,
  });
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [pair, setPair] = useState(() => [buildNumber(settings), buildNumber(settings)]);

  function toggleDecimal(place) {
    setSettings((current) => {
      const decimals = current.decimals.includes(place)
        ? current.decimals.filter((value) => value !== place)
        : [...current.decimals, place].sort();
      return { ...current, decimals: decimals.length ? decimals : [1] };
    });
  }

  async function answer(index) {
    const values = [pair[0].value, pair[1].value];
    const winner = values[0] === values[1] ? null : values[0] > values[1] ? 0 : 1;
    const correct = winner === null || winner === index;
    const nextLevel = correct ? Math.min(level + 1, 10) : Math.max(level - 1, 1);
    if (correct) setScore((current) => current + 1);
    setLevel(nextLevel);
    setFeedback(correct ? "Nice!" : "Try the next one.");
    await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "number_compare",
        score: correct ? 1 : 0,
        result: correct ? "correct" : "incorrect",
        courseId: courseId || null,
        metadata: { skillRating: nextLevel, settings },
      }),
    });
    setPair([buildNumber(settings), buildNumber(settings)]);
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
          <div className="ctaRow">
            {[1, 2, 3, 4].map((place) => (
              <button
                key={place}
                type="button"
                className={`btn ${settings.decimals.includes(place) ? "primary" : ""}`}
                onClick={() => toggleDecimal(place)}
              >
                {place === 1 ? "Tenths" : place === 2 ? "Hundredths" : place === 3 ? "Thousandths" : "Ten-Thousandths"}
              </button>
            ))}
          </div>
          <label className="toggleRow"><input type="checkbox" checked={settings.positiveNegative} onChange={(e) => setSettings((current) => ({ ...current, positiveNegative: e.target.checked }))} /> Positive / negative integers</label>
          <label className="toggleRow"><input type="checkbox" checked={settings.fractions} onChange={(e) => setSettings((current) => ({ ...current, fractions: e.target.checked }))} /> Fractions</label>
          <label className="toggleRow"><input type="checkbox" checked={settings.squareRoots} onChange={(e) => setSettings((current) => ({ ...current, squareRoots: e.target.checked }))} /> Square roots</label>
          <label>
            Class context
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">No class selected</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="card" style={{ background: "#fff" }}>
        <h2>Pick The Bigger Number</h2>
        <div className="pillRow">
          <span className="pill">Score: {score}</span>
          <span className="pill">Level: {level}</span>
        </div>
        <div className="choiceGrid" style={{ marginTop: "1rem" }}>
          {pair.map((entry, index) => (
            <button key={`${entry.label}-${index}`} className="btn bigChoice" type="button" onClick={() => answer(index)}>
              {entry.label}
            </button>
          ))}
        </div>
        {feedback ? <p style={{ marginTop: "0.75rem" }}>{feedback}</p> : null}
      </section>
    </div>
  );
}
