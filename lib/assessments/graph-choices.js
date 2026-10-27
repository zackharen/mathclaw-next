// Supported getExpressions output only. This deliberately accepts a narrow syntax;
// it draws alternatives and never claims the student's inequalities are correct.
export function relation(expression) {
  const s = String(expression.latex || "").replace(/\\left|\\right/g, "");
  const match = s.match(/^(.*?)(\\leq?|\\geq?|<=|>=|≤|≥|<|>)(.*)$/);
  if (!match || !match[1] || !match[3] || /[{}]/.test(s)) return null;
  return {
    expression,
    l: match[1],
    r: match[3],
    op: match[2].replace(/\\leq?|<=|≤/, "≤").replace(/\\geq?|>=|≥/, "≥"),
  };
}
const latexOp = (op) => ({ "≤": "\\le ", "≥": "\\ge " })[op] || op;
function region(r, flip) {
  const op = flip ? { "≤": ">", "≥": "<", "<": "≥", ">": "≤" }[r.op] : r.op;
  return r.l + latexOp(op) + r.r;
}
export function choiceExpressions(expressions) {
  const rs = expressions
    .filter((e) => e.latex)
    .map(relation)
    .filter(Boolean);
  if (rs.length !== 2) return null;
  return [
    [false, true],
    [false, false],
    [true, true],
    [true, false],
  ].map((flips) => [
    ...expressions
      .filter((e) => !relation(e))
      .map((e) => ({ ...e, hidden: true })),
    ...rs.map((r, j) => ({
      id: `boundary${j}`,
      latex: r.l + "=" + r.r,
      color: r.expression.color,
      lineStyle: ["<", ">"].includes(r.op) ? "DASHED" : "SOLID",
    })),
    {
      id: "region",
      latex:
        region(rs[0], flips[0]) +
        "\\left\\{" +
        region(rs[1], flips[1]) +
        "\\right\\}",
      color: "#6042a6",
      lineOpacity: "0",
      fillOpacity: "0.35",
    },
  ]);
}
