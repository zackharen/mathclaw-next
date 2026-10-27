import { splitMathSegments } from "../vocabulary/math-text.mjs";

const power = String.raw`(?:[²³]|\^(?:\{[-\w]+\}|[-\d]+))?`;
const variable = String.raw`[A-Za-z][′']?${power}`;
const number = String.raw`[−-]?\d+(?:\.\d+)?(?:${variable}|${power})`;
const argument = String.raw`(?:[A-Za-z]|[−-]?\d+(?:\.\d+)?)(?:\s*[+−\-*/^,]\s*(?:[A-Za-z]|\d+(?:\.\d+)?))*`;
const call = String.raw`[A-Za-z][′']?\(${argument}\)`;
const group = String.raw`\(${argument}\)${power}`;
const atom = String.raw`(?:${call}|${group}|${number}|${variable})`;
// Restrict automatic conversion to recognizable math. Prose and calculator
// commands stay literal; explicit $...$/$$...$$ supports more elaborate LaTeX.
const expression = new RegExp(
  String.raw`(?<![\w\\])${atom}(?:\s*(?:>=|<=|[=+−×÷*/<>≤≥^~]|-(?![A-Za-z]{2}))\s*${atom})*(?![\w])`,
  "g",
);
function latex(value) {
  return value
    .replace(
      /(?<![\w)])(\d+)\s*\/\s*(\d+)(?![\w²³^])/g,
      String.raw`\frac{$1}{$2}`,
    )
    .replace(/>=/g, String.raw`\ge `)
    .replace(/<=/g, String.raw`\le `)
    .replace(/²/g, "^{2}")
    .replace(/³/g, "^{3}")
    .replace(/[′']/g, String.raw`^{\prime}`)
    .replace(/−/g, "-")
    .replace(/×/g, String.raw`\times `)
    .replace(/÷/g, String.raw`\div `)
    .replace(/≤/g, String.raw`\le `)
    .replace(/≥/g, String.raw`\ge `)
    .replace(/~/g, String.raw`\sim `);
}
export function mathPrintSegments(text) {
  // A dollar amount followed by prose is currency, not a LaTeX delimiter.
  const source = String(text ?? "").replace(
    /(?<!\\)\$(?=\d+(?:\.\d+)?(?:[.,;:]?\s|[.,;:]?$))/g,
    "\\$",
  );
  return splitMathSegments(source).flatMap((segment) => {
    if (segment.math) return [segment];
    const output = [];
    let offset = 0;
    for (const match of segment.value.matchAll(expression)) {
      const value = match[0];
      if (
        !/[=+−×÷*/<>≤≥^~²³′']/.test(value) &&
        !/[A-Za-z]\(/.test(value) &&
        !/\d[A-Za-z]/.test(value)
      )
        continue;
      if (match.index > offset)
        output.push({
          math: false,
          value: segment.value.slice(offset, match.index),
        });
      output.push({ math: true, value: latex(value) });
      offset = match.index + value.length;
    }
    if (offset < segment.value.length)
      output.push({ math: false, value: segment.value.slice(offset) });
    return output;
  });
}
