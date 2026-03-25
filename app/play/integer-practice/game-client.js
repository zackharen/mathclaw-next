"use client";

import { useMemo, useState } from "react";

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function makeProblem(level, twoDigit) {
  const limit = twoDigit ? Math.min(99, Math.max(10, 9 + level * 6)) : 9;
  const a = randomInt(limit * 2 + 1) - limit;
  const b = randomInt(limit * 2 + 1) - limit;
  const op = Math.random() > 0.5 ? "+" : "-";
  const answer = op === "+" ? a + b : a - b;
  return { a, b, op, answer };
}

function choices(answer, count) {
  const set = new Set([answer]);
  while (set.size < count) {
    const offset = Math.floor(Math.random() * 13) - 6 || 1;
    set.add(answer + offset);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

export default function IntegerPracticeClient({ courses }) {
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [twoDigit, setTwoDigit] = useState(false);
  const [multipleChoice, setMultipleChoice] = useState(true);
  const [choiceCount, setChoiceCount] = useState(4);
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [feedback, setFeedback] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [problem, setProblem] = useState(() => makeProblem(1, false));

  const options = useMemo(
    () => (multipleChoice ? choices(problem.answer, choiceCount) : []),
    [multipleChoice, problem, choiceCount]
  );

  async function saveAttempt(correct) {
    await fetch("/api/play/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: "integer_practice",
        score: score + (correct ? 1 : 0),
        result: correct ? "correct" : "incorrect",
        courseId: courseId || null,
        metadata: { skillRating: level, streak: correct ? streak + 1 : 0, twoDigit, multipleChoice, choiceCount },
      }),
    });
  }

  async function submitAnswer(value) {
    const guess = Number(value);
    const correct = guess === problem.answer;
    const nextStreak = correct ? streak + 1 : 0;
    const nextLevel = correct ? Math.min(level + (nextStreak >= 3 ? 1 : 0), 10) : Math.max(level - 1, 1);
    setFeedback(correct ? "Correct!" : `Not quite. The answer was ${problem.answer}.`);
    setStreak(nextStreak);
    setLevel(nextLevel);
    if (correct) setScore((current) => current + 1);
    setProblem(makeProblem(nextLevel, twoDigit));
    setAnswerText("");
    await saveAttempt(correct);
  }

  function handleTwoDigitChange(checked) {
    setTwoDigit(checked);
    setFeedback("");
    setProblem(makeProblem(level, checked));
  }

  return (
    <div className="featureGrid">
      <section className="card" style={{ background: "#fff" }}>
        <h2>Settings</h2>
        <div className="list">
          <label className="toggleRow"><input type="checkbox" checked={twoDigit} onChange={(e) => handleTwoDigitChange(e.target.checked)} /> Two-digit numbers</label>
          <label className="toggleRow"><input type="checkbox" checked={multipleChoice} onChange={(e) => setMultipleChoice(e.target.checked)} /> Multiple choice</label>
          {multipleChoice ? (
            <label>
              Answer choices
              <select className="input" value={choiceCount} onChange={(e) => setChoiceCount(Number(e.target.value))}>
                {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
          ) : null}
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
        <h2>Practice</h2>
        <div className="pillRow">
          <span className="pill">Score: {score}</span>
          <span className="pill">Streak: {streak}</span>
          <span className="pill">Level: {level}</span>
        </div>
        <div className="mathPrompt">
          {problem.a} {problem.op} ({problem.b}) = ?
        </div>
        {multipleChoice ? (
          <div className="choiceGrid">
            {options.map((option) => (
              <button key={option} className="btn" type="button" onClick={() => submitAnswer(option)}>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="ctaRow">
            <input className="input" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            <button className="btn primary" type="button" onClick={() => submitAnswer(answerText)}>
              Submit
            </button>
          </div>
        )}
        {feedback ? <p style={{ marginTop: "0.75rem" }}>{feedback}</p> : null}
      </section>
    </div>
  );
}
