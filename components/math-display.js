"use client";

import {
  buildEquationNode,
  buildIntegerNode,
  buildLabelNode,
  tokenizeMathText,
} from "@/lib/math-display";

export function MathText({ node, className = "" }) {
  if (!node) return null;

  if (Array.isArray(node)) {
    return (
      <span className={className}>
        {node.map((part, index) => (
          <MathText key={`${part.kind || "node"}-${index}`} node={part} />
        ))}
      </span>
    );
  }

  if (node.kind === "equation") {
    return (
      <span className={`mathEquation ${className}`.trim()}>
        {node.segments.map((segment, index) => (
          <MathText key={`${segment.kind}-${index}`} node={segment} />
        ))}
      </span>
    );
  }

  if (node.kind === "integer") {
    const isNegative = node.value < 0;
    if (isNegative && node.parenthesizeNegative !== false) {
      return (
        <span className={`mathAtom mathInteger ${className}`.trim()} aria-label={`(${node.value})`}>
          <span className="mathParen">(</span>
          <span className="mathMinus">−</span>
          <span>{Math.abs(node.value)}</span>
          <span className="mathParen">)</span>
        </span>
      );
    }

    return (
      <span className={`mathAtom mathInteger ${className}`.trim()}>
        {isNegative ? (
          <>
            <span className="mathMinus">−</span>
            <span>{Math.abs(node.value)}</span>
          </>
        ) : (
          <span>{node.value}</span>
        )}
      </span>
    );
  }

  if (node.kind === "decimal") {
    return (
      <span className={`mathAtom mathDecimal ${className}`.trim()}>
        {node.value.startsWith("-") ? `−${node.value.slice(1)}` : node.value}
      </span>
    );
  }

  if (node.kind === "fraction") {
    return (
      <span className={`mathAtom mathFractionWrap ${className}`.trim()}>
        {node.negative ? <span className="mathMinus">−</span> : null}
        <span className="mathFraction" aria-label={`${node.negative ? "negative " : ""}${node.numerator} over ${node.denominator}`}>
          <span className="mathFractionTop">{node.numerator}</span>
          <span className="mathFractionBottom">{node.denominator}</span>
        </span>
      </span>
    );
  }

  if (node.kind === "radical") {
    return (
      <span className={`mathAtom mathRadicalWrap ${className}`.trim()}>
        <span className="mathRadicalSign">√</span>
        <span className="mathRadicalValue">{node.radicand}</span>
      </span>
    );
  }

  if (node.kind === "symbol") {
    return <span className={`mathSymbol ${className}`.trim()}>{node.value}</span>;
  }

  return <span className={className}>{node.value}</span>;
}

export function MathInlineText({ text, className = "" }) {
  return (
    <span className={`mathInlineText ${className}`.trim()}>
      {tokenizeMathText(text).map((part, index) => (
        <MathText key={`${part.kind}-${index}`} node={part} />
      ))}
    </span>
  );
}

export { buildEquationNode, buildIntegerNode, buildLabelNode };
