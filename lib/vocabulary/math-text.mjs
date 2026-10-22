// Vocabulary definitions can mix words with LaTeX:
//   $...$   inline math inside the sentence, e.g. "the $x$-value"
//   $$...$$ an equation on its own centered line, e.g. "$$\dfrac{d}{dx}(e^x) = e^x$$"
// A backslash-escaped \$ stays a literal dollar sign. Unmatched or empty
// delimiters stay as text.
export function splitMathSegments(text) {
  const source = String(text || "");
  const segments = [];
  let plain = "";
  let index = 0;
  const findClose = (from, delimiter) => {
    for (let at = from; at <= source.length - delimiter.length; at += 1) {
      if (source.startsWith(delimiter, at) && source[at - 1] !== "\\") return at;
    }
    return -1;
  };
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && source[index + 1] === "$") {
      plain += "$";
      index += 2;
      continue;
    }
    if (char === "$") {
      const display = source[index + 1] === "$";
      const delimiter = display ? "$$" : "$";
      const start = index + delimiter.length;
      const end = findClose(start, delimiter);
      const latex = end === -1 ? "" : source.slice(start, end);
      if (latex.trim()) {
        if (plain) segments.push({ math: false, value: plain });
        segments.push(display ? { math: true, display: true, value: latex } : { math: true, value: latex });
        plain = "";
        index = end + delimiter.length;
        continue;
      }
      if (display) {
        plain += "$$";
        index += 2;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  if (plain) segments.push({ math: false, value: plain });
  return segments;
}
