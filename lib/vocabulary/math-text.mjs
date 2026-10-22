// Vocabulary definitions can mix words with inline LaTeX wrapped in $...$,
// e.g. "The function $y = e^x$; its derivative equals itself."
// A backslash-escaped \$ stays a literal dollar sign. An unmatched $ is text.
export function splitMathSegments(text) {
  const source = String(text || "");
  const segments = [];
  let plain = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && source[index + 1] === "$") {
      plain += "$";
      index += 2;
      continue;
    }
    if (char === "$") {
      let end = index + 1;
      while (end < source.length && !(source[end] === "$" && source[end - 1] !== "\\")) end += 1;
      const latex = source.slice(index + 1, end);
      if (end < source.length && latex.trim()) {
        if (plain) segments.push({ math: false, value: plain });
        segments.push({ math: true, value: latex });
        plain = "";
        index = end + 1;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  if (plain) segments.push({ math: false, value: plain });
  return segments;
}
