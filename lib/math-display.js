function buildTextNode(value) {
  return { kind: "text", value: String(value ?? "") };
}

export function buildIntegerNode(value, options = {}) {
  return {
    kind: "integer",
    value: Number(value || 0),
    parenthesizeNegative: options.parenthesizeNegative !== false,
  };
}

export function buildLabelNode(label) {
  const normalized = String(label ?? "").trim();

  if (!normalized) return buildTextNode("");

  if (/^\(-?\d+\)$/.test(normalized)) {
    return buildIntegerNode(Number(normalized.slice(1, -1)));
  }

  if (/^-?\d+$/.test(normalized)) {
    return buildIntegerNode(Number(normalized));
  }

  if (/^-?\d+\.\d+$/.test(normalized)) {
    return { kind: "decimal", value: normalized };
  }

  if (/^-?\d+\/\d+$/.test(normalized)) {
    const [numeratorText, denominatorText] = normalized.split("/");
    return {
      kind: "fraction",
      numerator: Math.abs(Number(numeratorText)),
      denominator: Number(denominatorText),
      negative: Number(numeratorText) < 0,
    };
  }

  if (/^√\d+$/.test(normalized)) {
    return { kind: "radical", radicand: Number(normalized.slice(1)) };
  }

  return buildTextNode(normalized);
}

export function buildEquationNode(left, operator, right, options = {}) {
  const segments = [
    buildLabelNode(left),
    { kind: "symbol", value: operator === "-" ? "−" : operator },
    buildLabelNode(right),
  ];

  if (options.includeEquals) {
    segments.push({ kind: "symbol", value: "=" });
  }

  if (options.includeUnknown) {
    segments.push({ kind: "symbol", value: "?" });
  }

  return {
    kind: "equation",
    segments,
  };
}

export function tokenizeMathText(text) {
  const source = String(text ?? "");
  const pattern = /(\(-?\d+\)|-?\d+\/\d+|√\d+|-?\d+\.\d+|-?\d+)/g;
  const parts = [];
  let lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const [token] = match;
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push({ kind: "text", value: source.slice(lastIndex, index) });
    }

    parts.push(buildLabelNode(token));
    lastIndex = index + token.length;
  }

  if (lastIndex < source.length) {
    parts.push({ kind: "text", value: source.slice(lastIndex) });
  }

  return parts;
}
