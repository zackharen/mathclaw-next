"use client";

import { useEffect, useState } from "react";
import { splitMathSegments } from "@/lib/vocabulary/math-text.mjs";

// Same KaTeX build the projector already loads from the CDN.
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";

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

function useKatexReady(needed) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!needed) return undefined;
    ensureKatexAssets();
    const check = () => {
      if (!window.katex) return false;
      setReady(true);
      return true;
    };
    if (check()) return undefined;
    const timer = window.setInterval(() => { if (check()) window.clearInterval(timer); }, 100);
    return () => window.clearInterval(timer);
  }, [needed]);
  return ready;
}

// Renders text with inline $...$ LaTeX as MathPrint-style math. Plain text
// renders as-is; until KaTeX loads, math shows as its LaTeX source.
export default function MathRichText({ text, as: Tag = "span", className }) {
  const segments = splitMathSegments(text);
  const hasMath = segments.some((segment) => segment.math);
  const ready = useKatexReady(hasMath);
  return (
    <Tag className={className}>
      {segments.map((segment, index) => {
        if (!segment.math) return segment.value;
        if (!ready) return <span key={index}>{segment.value}</span>;
        // KaTeX escapes its input (trust is off), so this markup is safe to inject.
        const html = window.katex.renderToString(segment.value, { throwOnError: false });
        return <span key={index} className="mathRichTextMath" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </Tag>
  );
}
