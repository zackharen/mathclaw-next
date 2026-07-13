"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
const QUESTION_CONTENT_PREFIX = "__MATHCLAW_PROJECTOR_QUESTION_V1__";
const QUESTION_OPTION_LABELS = ["A", "B", "C", "D"];

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

function isGif(content) {
  return /^data:image\/gif/i.test(content || "") || /\.gif(\?|#|$)/i.test(content || "");
}

function parseWidgetContent(content) {
  try {
    const parsed = JSON.parse(String(content || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatClockDate(date) {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function ClockWidget({ content }) {
  const settings = parseWidgetContent(content);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="projectorScreenWidget projectorClockWidget">
      <div className="projectorClockTime">{formatClockTime(now)}</div>
      <div className="projectorClockDate">{formatClockDate(now)}</div>
      {settings.periodName ? <div className="projectorClockPeriod">{settings.periodName}</div> : null}
    </div>
  );
}

function WordWallWidget({ content }) {
  const word = useMemo(() => parseWidgetContent(content), [content]);
  return (
    <div className="projectorScreenWidget projectorWordWallWidget">
      <div className="projectorWordWallWord">{word.word || "Word Wall"}</div>
      {word.definition ? <div className="projectorWordWallDefinition">{word.definition}</div> : null}
    </div>
  );
}

function PollResultsWidget({ content }) {
  const results = useMemo(() => parseWidgetContent(content), [content]);
  const choices = Array.isArray(results.choices) ? results.choices : [];
  const totalVotes = Number.parseInt(results.totalVotes, 10) || 0;
  const expectedVotes = Number.parseInt(results.expectedVotes, 10) || 0;
  return (
    <div className="projectorScreenWidget projectorPollResultsWidget">
      <div className="projectorPollResultsHeader">
        <p className="eyebrow">Live Poll Results</p>
        <h1>
          {results.questionType === "latex" && results.question ? (
            <LatexDisplay content={results.question} />
          ) : (
            results.question || "Poll results"
          )}
        </h1>
        <span>
          {totalVotes} vote{totalVotes === 1 ? "" : "s"}
          {expectedVotes ? ` / ${expectedVotes} screens` : ""}
        </span>
      </div>
      <div className="projectorPollResultsBars">
        {choices.map((choice) => {
          const count = Number.parseInt(choice.count, 10) || 0;
          const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <div className="projectorPollResultsBar" key={choice.id || choice.label}>
              <div className="projectorPollResultsBarLabel">
                <strong>{choice.label || choice.id}</strong>
                <span>
                  {count} · {percent}%
                </span>
              </div>
              <div className="projectorPollResultsTrack">
                <div className="projectorPollResultsFill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isEscapedLatexCharacter(source, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function isExponentStart(character) {
  return Boolean(character && /[A-Za-z0-9{\\]/.test(character));
}

function isArrowTokenStart(source, index) {
  return (
    source.startsWith("\\uparrow", index) ||
    source.startsWith("\\downarrow", index) ||
    source[index] === "↑" ||
    source[index] === "↓" ||
    (source[index] === "^" && !isExponentStart(source[index + 1]))
  );
}

function visibleLatexSpaces(count) {
  return "\\;".repeat(Math.min(count, 4));
}

function normalizeLatexLineForDisplay(line) {
  let normalized = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === " ") {
      let end = index;
      while (line[end] === " ") end += 1;
      normalized += isArrowTokenStart(line, end) ? visibleLatexSpaces(end - index) : line.slice(index, end);
      index = end - 1;
    } else if (line.startsWith("\\uparrow", index) || line.startsWith("\\downarrow", index)) {
      const command = line.startsWith("\\uparrow", index) ? "\\uparrow" : "\\downarrow";
      let end = index + command.length;
      while (line[end] === " ") end += 1;
      normalized += `${command}${visibleLatexSpaces(end - index - command.length)}`;
      index = end - 1;
    } else if (character === "%" && !isEscapedLatexCharacter(line, index)) {
      normalized += "\\%";
    } else if (character === "↑") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "↓") {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\downarrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else if (character === "^" && !isExponentStart(line[index + 1])) {
      let end = index + 1;
      while (line[end] === " ") end += 1;
      normalized += `\\uparrow${visibleLatexSpaces(end - index - 1)}`;
      index = end - 1;
    } else {
      normalized += character;
    }
  }
  return normalized;
}

function LatexDisplay({ content }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureKatexAssets();
    const render = () => {
      if (!ref.current) return;
      const lines = String(content || "").split(/\r?\n/);
      if (!window.katex) {
        ref.current.textContent = content || "";
        return;
      }
      try {
        ref.current.replaceChildren();
        lines.forEach((line) => {
          const row = document.createElement("div");
          row.className = "projectorLatexLine";
          if (line.trim()) {
            window.katex.render(normalizeLatexLineForDisplay(line), row, {
              throwOnError: false,
              displayMode: true,
            });
          } else {
            row.appendChild(document.createElement("br"));
          }
          ref.current.appendChild(row);
        });
      } catch {
        ref.current.textContent = content || "";
      }
    };
    render();
    const id = window.setInterval(() => {
      if (window.katex) {
        render();
        window.clearInterval(id);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [content]);

  return <div ref={ref} className="projectorScreenLatex" />;
}

function normalizeQuestionPayload(parsed) {
  const prompt = String(parsed.prompt || "");
  const promptType = parsed.promptType === "latex" ? "latex" : "text";
  const mode = parsed.mode === "fill_blank" ? "fill_blank" : "multiple_choice";
  const answerType = parsed.answerType === "latex" ? "latex" : "text";
  const options = Array.isArray(parsed.options)
    ? parsed.options.slice(0, 4).map((option) => String(option || ""))
    : [];
  const correctIndex = Number.isInteger(parsed.correctIndex) ? parsed.correctIndex : null;
  const question = {
    answerType,
    fillBlankAnswer: String(parsed.fillBlankAnswer || ""),
    mode,
    prompt,
    promptType,
    options,
    correctIndex: correctIndex >= 0 && correctIndex < 4 ? correctIndex : null,
  };
  const hasQuestion = Boolean(mode === "fill_blank" || prompt.trim() || options.some((option) => option.trim()));
  return hasQuestion ? question : null;
}

function parseQuestionPayload(content) {
  const source = String(content || "");
  if (!source.startsWith(QUESTION_CONTENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(source.slice(QUESTION_CONTENT_PREFIX.length));
    const question = normalizeQuestionPayload(parsed.question || parsed);
    if (!question) return null;
    return {
      content: typeof parsed.content === "string" ? parsed.content : "",
      question,
    };
  } catch {
    return null;
  }
}

export function parseQuestionContent(content) {
  return parseQuestionPayload(content)?.question || null;
}

export function displayContent(content) {
  const payload = parseQuestionPayload(content);
  return payload ? payload.content : String(content || "");
}

export function questionForState(state) {
  return state?.question || parseQuestionContent(state?.content);
}

export function buildQuestionContent({
  answerType,
  content = "",
  correctIndex,
  fillBlankAnswer,
  mode,
  options,
  prompt,
  promptType,
}) {
  const safeMode = mode === "fill_blank" ? "fill_blank" : "multiple_choice";
  const safeAnswerType = answerType === "latex" ? "latex" : "text";
  const safeOptions = options.slice(0, 4).map((option) => String(option || "").trim());
  const safeCorrectIndex =
    safeMode === "multiple_choice" && Number.isInteger(correctIndex) && safeOptions[correctIndex]
      ? correctIndex
      : null;
  return `${QUESTION_CONTENT_PREFIX}${JSON.stringify({
    content: String(content || ""),
    question: {
      answerType: safeAnswerType,
      fillBlankAnswer: safeMode === "fill_blank" ? String(fillBlankAnswer || "").trim() : "",
      mode: safeMode,
      prompt: String(prompt || "").trim(),
      promptType: promptType === "latex" ? "latex" : "text",
      options: safeMode === "multiple_choice" ? safeOptions : [],
      correctIndex: safeCorrectIndex,
    },
  })}`;
}

function QuestionAnswer({ children, latex }) {
  if (latex) return <LatexDisplay content={children} />;
  return <span>{children}</span>;
}

function QuestionDisplay({ promptContent = "", promptType = "text", question, revealAnswer = false }) {
  const filledOptions = question.options
    .map((option, index) => ({ index, option }))
    .filter((item) => item.option.trim());
  const prompt = String(promptContent || question.prompt || "");
  const safePromptType = promptType === "latex" ? "latex" : question.promptType;
  return (
    <div className={`projectorScreenQuestionCard ${question.mode === "fill_blank" ? "isFillBlank" : ""}`}>
      {prompt.trim() ? (
        <div className="projectorScreenQuestionPrompt">
          {safePromptType === "latex" ? <LatexDisplay content={prompt} /> : <span>{prompt}</span>}
        </div>
      ) : null}
      {question.mode === "fill_blank" ? <div className="projectorScreenFillBlankLine" aria-hidden="true" /> : null}
      {question.mode !== "fill_blank" && filledOptions.length ? (
        <div className="projectorScreenQuestionOptions">
          {filledOptions.map(({ index, option }) => (
            <div
              className={question.correctIndex === index ? "projectorScreenQuestionOption isCorrect" : "projectorScreenQuestionOption"}
              key={index}
            >
              <strong>{QUESTION_OPTION_LABELS[index]}</strong>
              <QuestionAnswer latex={question.answerType === "latex"}>{option}</QuestionAnswer>
              {revealAnswer && question.correctIndex === index ? <em>Answer</em> : null}
            </div>
          ))}
        </div>
      ) : null}
      {revealAnswer && question.mode === "fill_blank" && question.fillBlankAnswer.trim() ? (
        <div className="projectorScreenFillBlankAnswer">
          <QuestionAnswer latex={question.answerType === "latex"}>{question.fillBlankAnswer}</QuestionAnswer>
        </div>
      ) : null}
    </div>
  );
}

function ProjectorScreenContentBody({ state }) {
  if (!state) return <div className="projectorWaiting">waiting for content</div>;
  const content = displayContent(state.content);
  if (state.type === "clock") return <ClockWidget content={state.content} />;
  if (state.type === "word_wall") return <WordWallWidget content={state.content} />;
  if (state.type === "poll_results") return <PollResultsWidget content={state.content} />;
  if (state.type === "text") {
    return <div className="projectorScreenText">{content}</div>;
  }
  if (state.type === "latex") return <LatexDisplay content={content} />;
  if (state.type === "image" || isGif(content)) {
    // Keyed by content so a swap remounts a fresh element; iPad Safari keeps the
    // previous image's object-fit geometry when src changes in place on the same node.
    return <img className="projectorScreenMedia" key={content} src={content} alt="" />;
  }
  if (state.type === "video") {
    return (
      <video
        className="projectorScreenMedia"
        key={content}
        src={content}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }
  return <div className="projectorWaiting">waiting for content</div>;
}

export function ProjectorScreenContent({ state }) {
  const question = parseQuestionContent(state?.content);
  const promptContent = displayContent(state?.content);
  const hasBodyContent = Boolean(promptContent.trim()) && !(question && state?.type === "text");
  const caption = String(state?.caption || "").trim();
  const showCaption = Boolean(caption && (state?.type === "image" || state?.type === "video"));
  if (!state?.topText && !question && !showCaption) return <ProjectorScreenContentBody state={state} />;
  if (!state?.topText && !question && showCaption) {
    return (
      <div className="projectorScreenBody projectorScreenBodyWithCaption">
        <ProjectorScreenContentBody state={state} />
        <div className="projectorScreenCaption">{caption}</div>
      </div>
    );
  }
  if (question && !state?.topText && !hasBodyContent) {
    return (
      <QuestionDisplay
        promptContent={state?.type === "text" ? promptContent : ""}
        promptType={state?.type}
        question={question}
        revealAnswer={Boolean(state?.revealAnswer)}
      />
    );
  }
  return (
    <div className="projectorScreenStack">
      {state?.topText ? <div className="projectorScreenTopText">{state.topText}</div> : null}
      {hasBodyContent ? (
        <div className="projectorScreenBody">
          <ProjectorScreenContentBody state={state} />
          {showCaption ? <div className="projectorScreenCaption">{caption}</div> : null}
        </div>
      ) : null}
      {!hasBodyContent && showCaption ? <div className="projectorScreenCaption">{caption}</div> : null}
      {question ? (
        <QuestionDisplay
          promptContent={state?.type === "text" ? promptContent : ""}
          promptType={state?.type}
          question={question}
          revealAnswer={Boolean(state?.revealAnswer)}
        />
      ) : null}
    </div>
  );
}

export function ProjectorScreenInactiveState() {
  return (
    <div className="projectorScreenInactiveState">
      <p className="eyebrow">Projector</p>
      <h1>Screen inactive</h1>
      <p>This screen is paused from the teacher dashboard. Content will return when it is reactivated.</p>
    </div>
  );
}
