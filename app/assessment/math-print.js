"use client";
import MathRichText from "@/components/math-rich-text";
import { mathPrintSegments } from "@/lib/assessments/math-print";

export default function MathPrint({ text }) {
  return (
    <span className="mcMathPrint">
      {mathPrintSegments(text).map((part, i) =>
        part.math ? (
          <MathRichText
            key={i}
            text={`${part.display ? "$$" : "$"}${part.value}${part.display ? "$$" : "$"}`}
          />
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}
