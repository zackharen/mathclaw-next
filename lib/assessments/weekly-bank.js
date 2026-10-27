// Original questions inspired by the verified provider lesson goals, not copied exercises.
export const WEEKLY_SOURCES = {
  derivative: {
    label: "Math Medic AP Calculus 2.2 · The Derivative Function",
    url: "https://portal.mathmedic.com/lesson-plans/course/AP-Calculus/unit/2/day/3",
    status: "Lesson targets and teaching notes read October 26, 2026",
  },
  differentiability: {
    label: "Math Medic AP Calculus 2.3 · Differentiability",
    url: "https://portal.mathmedic.com/lesson-plans/course/ap-calculus/unit/2/day/5",
    status: "Lesson targets and teaching notes read October 26, 2026",
  },
  situations: {
    label: "IM Algebra I · Unit 4 Lesson 1",
    url: "https://im.kendallhunt.com/HS/students/1/4/1/index.html",
    status: "Student lesson read October 26, 2026",
  },
  notation: {
    label: "IM Algebra I · Unit 4 Lesson 2",
    url: "https://im.kendallhunt.com/HS/students/1/4/2/index.html",
    status: "Student lesson read October 26, 2026",
  },
  interpretation: {
    label: "IM Algebra I · Unit 4 Lesson 3",
    url: "https://im.kendallhunt.com/HS/students/1/4/3/index.html",
    status: "Student lesson read October 26, 2026",
  },
};
export const WEEKLY_SKILLS = [
  "derivative-definition",
  "tangent-line",
  "slopes-meaning",
  "corner",
  "continuity",
  "smooth-turn",
  "average-rate",
  "context-function",
  "evaluate-function",
  "interpret-notation",
  "function-table",
  "graph-situation",
  "compare-notation",
  "solve-check",
];
export function weeklyQuestion(skill, level, seed) {
  let n = seed >>> 0;
  const r = (a, b) => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return a + (n % (b - a + 1));
  };
  const a = r(2, 5),
    b = r(2, 7),
    c = r(1, 4),
    x = r(2, 4);
  let prompt,
    solution,
    rubric,
    points = 4,
    minutes = 4,
    source,
    spiral = false;
  switch (skill) {
    case "derivative-definition":
      prompt = `Let f(x) = ${a}x² − ${b}x + ${c}. Use the limit definition of the derivative to find f′(x). Show the difference quotient, simplify it, and explain what the resulting function represents.`;
      solution = `f(x+h)−f(x) = ${2 * a}xh + ${a}h² − ${b}h. Dividing by h gives ${2 * a}x + ${a}h − ${b}; the limit is f′(x) = ${2 * a}x − ${b}, the slope of f at each input.`;
      rubric =
        "1 difference quotient; 1 correct expansion/simplification; 1 limit and derivative; 1 slope-function interpretation.";
      source = "derivative";
      break;
    case "tangent-line": {
      const y = a * x * x - b * x + c,
        m = 2 * a * x - b;
      prompt = `For f(x) = ${a}x² − ${b}x + ${c}, find the slope and an equation of the tangent line at x = ${x}. Distinguish the derivative value from the tangent-line equation.`;
      solution = `f(${x})=${y}; f′(${x})=${m}. Tangent: y−${y}=${m}(x−${x}). The derivative value is a slope; the tangent equation also uses the point.`;
      rubric =
        "1 function value; 1 derivative value; 1 tangent equation (equivalent forms accepted); 1 distinction between slope and line.";
      source = "derivative";
      break;
    }
    case "slopes-meaning":
      prompt = `A differentiable function p satisfies p(${x}) = ${b} and p′(${x}) = −${a}. Explain what (${x}, −${a}) means on the graph of p′. Is (${x}, −${a}) necessarily on the graph of p? Describe the tangent direction at x=${x}.`;
      solution = `At input ${x}, the original function p has slope −${a} and its tangent slopes downward. The point on p is (${x},${b}), not necessarily (${x},−${a}).`;
      rubric =
        "1 input identified; 1 original function’s slope; 1 distinguish points on p and p′; 1 local decreasing behavior.";
      source = "derivative";
      break;
    case "corner":
      prompt = `Define g(x) = ${a}x + ${c} for x < ${x}, and g(x) = ${a + 1}x + ${c - x} for x ≥ ${x}. Determine whether g is continuous and differentiable at x=${x}. Use one-sided values and slopes; a graph may support your explanation.`;
      solution = `Both one-sided values and g(${x}) are ${a * x + c}, so g is continuous. Left slope ${a} differs from right slope ${a + 1}, so g is not differentiable there.`;
      rubric =
        "1 left/right function limits; 1 continuity; 1 left/right derivative values; 1 justified nondifferentiability.";
      source = "differentiability";
      minutes = 5;
      break;
    case "continuity":
      prompt = `A function has a jump at x=${x}. On each side of ${x}, its graph is horizontal, so the one-sided limits of the derivative are both 0. A student concludes the function is differentiable at ${x}. Explain the error and give a sketch or concrete piecewise example.`;
      solution = `Matching nearby slopes alone is insufficient: differentiability requires continuity. Example h(x)=0 for x<${x}, h(x)=1 for x≥${x}; it has a jump and no derivative at ${x}.`;
      rubric =
        "1 rejects the conclusion; 1 identifies continuity as necessary; 1 valid example or sketch.";
      points = 3;
      minutes = 3;
      source = "differentiability";
      break;
    case "smooth-turn":
      prompt = `Compare u(x)=(x−${x})² and v(x)=|x−${x}|. Both change from decreasing to increasing at x=${x}. Explain why only one is differentiable there. Describe the relevant one-sided slopes.`;
      solution = `u has matching slopes tending to 0 and is differentiable. v has left slope −1 and right slope 1, so is continuous but not differentiable. Changing direction does not by itself prevent a derivative.`;
      rubric =
        "1 slopes for u; 1 derivative conclusion for u; 1 slopes and conclusion for v; 1 explains why changing direction alone is not enough.";
      source = "differentiability";
      break;
    case "average-rate":
      prompt = `Spiral prerequisite: a line passes through (${x},${b}) and (${x + 3},${b + 3 * a}). Find its average rate of change and an equation of the line. Verify both points.`;
      solution = `Slope ${a}. Equation y−${b}=${a}(x−${x}). Both points satisfy it.`;
      rubric =
        "1 rate of change; 1 equivalent line equation; 1 verifies both points.";
      points = 3;
      minutes = 3;
      spiral = true;
      source = "derivative";
      break;
    case "context-function":
      prompt = `A water tank starts with ${b * 10} liters. Water flows in at ${a} liters per minute for ${x} minutes, then the pump stops for 2 minutes. Identify input and output quantities. Explain why the amount of water is a function of elapsed time, and describe the graph during both intervals.`;
      solution = `Input: elapsed minutes. Output: liters. Each time has one amount. W(t)=${b * 10}+${a}t until t=${x}, then stays ${b * 10 + a * x} liters for 2 minutes. Rising line followed by horizontal segment.`;
      rubric =
        "1 input/output with units; 1 one-output explanation; 1 rising segment; 1 horizontal segment with consistent value.";
      source = "situations";
      break;
    case "evaluate-function":
      prompt = `Let F(t)=${a}t²−${b}t+${c}. Find F(${x}) and F(0). Show substitution, and explain why F(${x}) does not mean F multiplied by ${x}.`;
      solution = `F(${x})=${a * x * x - b * x + c}; F(0)=${c}. The parentheses specify the input to the function.`;
      rubric = "1 substitution; 1 F(input); 1 F(0); 1 meaning of notation.";
      source = "notation";
      break;
    case "interpret-notation":
      prompt = `C(t) is the cost in dollars of a bike rental lasting t hours. Interpret C(${x})=${b * 5}, C(h)=${a * 10}, and C(${x + 1})−C(${x}) in this context. Include units and distinguish known from unknown inputs.`;
      solution = `${x} hours costs $${b * 5}. Renting for h hours costs $${a * 10}, with h unknown. The difference is the additional cost from ${x} to ${x + 1} hours.`;
      rubric =
        "1 first statement; 1 unknown input h; 1 cost value with units; 1 incremental cost interpretation.";
      source = "interpretation";
      break;
    case "function-table":
      prompt = `Two relations are given. R: (${x},${a}), (${x + 1},${b}), (${x + 2},${a}). S: (${x},${a}), (${x},${a + 1}), (${x + 2},${b}). Decide which is a function of the first coordinate. Explain both decisions, including whether repeated outputs are allowed.`;
      solution = `R is a function: each input has exactly one output, even though output ${a} repeats. S is not: input ${x} has two different outputs.`;
      rubric =
        "1 R conclusion; 1 repeated outputs allowed; 1 S conclusion; 1 identifies the conflicting input and outputs.";
      source = "notation";
      break;
    case "graph-situation":
      prompt = `A cyclist is ${b} km from home at time 0, travels steadily away to ${b + 2 * a} km after 2 hours, then stays there for 1 hour. Graph distance from home as a function of time in Desmos. Label units, state one point from each interval and explain the points.`;
      solution = `Line from (0,${b}) to (2,${b + 2 * a}), then horizontal to (3,${b + 2 * a}). For example (1,${b + a}) and (2.5,${b + 2 * a}). Horizontal means stopped, not zero distance.`;
      rubric =
        "1 labeled time and distance axes; 1 correct rising segment; 1 correct horizontal segment; 1 two correctly interpreted points.";
      source = "situations";
      minutes = 5;
      break;
    case "compare-notation":
      prompt = `A function A assigns each student in a club exactly one locker number. Explain what A(Sam) means. Is a rule B that takes a locker number and returns a student necessarily a function if lockers may be shared? Give a specific example supporting your answer.`;
      solution = `A(Sam) is Sam’s assigned locker number. B need not be a function: Sam and Lee may share locker ${b}, giving two outputs for input ${b}.`;
      rubric =
        "1 interprets A(Sam); 1 identifies reverse input/output; 1 not necessarily a function; 1 counterexample.";
      source = "notation";
      break;
    case "solve-check": {
      const rhs = a * x + b;
      prompt = `Spiral prerequisite: solve ${a}z + ${b} = ${rhs}. Show inverse operations and check the solution in the original equation.`;
      solution = `${a}z=${a * x}; z=${x}. Check: ${a}(${x})+${b}=${rhs}.`;
      rubric =
        "1 valid inverse operation; 1 solution; 1 original-equation check.";
      points = 3;
      minutes = 3;
      source = "interpretation";
      spiral = true;
      break;
    }
    default:
      throw Error("Unknown original question family.");
  }
  return {
    skill: `weekly:${skill}`,
    name: skill.replaceAll("-", " "),
    prompt,
    solution,
    rubric,
    criteria:
      "Use valid representations, show your reasoning and justify the requested conclusions.",
    manual: true,
    desmos: true,
    supports:
      "Desmos graphing calculator; no other supports unless the teacher adds them.",
    points,
    minutes,
    spiral,
    level,
    generator: `weekly:${skill}`,
    adaptiveGenerator: `weekly-mc:${skill}`,
    source: WEEKLY_SOURCES[source],
  };
}
