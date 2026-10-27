// Selected-response counterparts test the same concepts as the written weekly
// items. They do not claim to verify a written proof or independent graph work.
export function weeklyChoiceQuestion(skill, level, seed) {
  let n = seed >>> 0;
  const rand = (a, b) => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return a + (n % (b - a + 1));
  };
  const a = rand(2, level + 3),
    b = rand(2, level + 5),
    c = rand(1, 4),
    x = rand(2, 12 + level * 4);
  let prompt, answer, wrong;
  switch (skill) {
    case "derivative-definition":
      prompt = `For f(x)=${a}x²−${b}x+${c}, which expression equals [f(x+h)−f(x)]/h for h≠0?`;
      answer = `${2 * a}x + ${a}h − ${b}`;
      wrong = [
        `${a}x + ${a}h − ${b}`,
        `${2 * a}x + ${a}h + ${b}`,
        `${2 * a}x + ${a}h − ${b} + ${c}`,
      ];
      break;
    case "tangent-line": {
      const y = a * x * x - b * x + c,
        m = 2 * a * x - b;
      prompt = `For f(x)=${a}x²−${b}x+${c}, which is the tangent line at x=${x}?`;
      answer = `y − (${y}) = ${m}(x − ${x})`;
      wrong = [
        `y − (${y}) = ${m + 1}(x − ${x})`,
        `y − (${y + 1}) = ${m}(x − ${x})`,
        `y = ${m}x`,
      ];
      break;
    }
    case "slopes-meaning":
      prompt = `p(${x})=${b} and p′(${x})=−${a}. Which statement correctly interprets p′(${x})?`;
      answer = `At x=${x}, the tangent to p has slope −${a}.`;
      wrong = [
        `The point (${x},−${a}) must lie on p.`,
        `At x=−${a}, the tangent to p has slope ${x}.`,
        `At x=${x}, p has value −${a}.`,
      ];
      break;
    case "corner":
      prompt = `g(x)=${a}x+${c} for x<${x}, and g(x)=${a + 1}x+${c - x} for x≥${x}. What happens at x=${x}?`;
      answer = `Continuous, but not differentiable: the one-sided slopes are ${a} and ${a + 1}.`;
      wrong = [
        `Continuous and differentiable because the function values agree.`,
        `Discontinuous because the one-sided slopes differ.`,
        `Not continuous, but differentiable because both pieces are lines.`,
      ];
      break;
    case "continuity":
      prompt = `A function jumps at x=${x}, while both one-sided limits of its derivative are 0. Is it differentiable at x=${x}?`;
      answer = "No. Differentiability requires continuity at the point.";
      wrong = [
        "Yes. Matching nearby slopes are sufficient.",
        "Yes. A horizontal graph always has derivative 0 at a jump.",
        "No. Only curved functions can be differentiable.",
      ];
      break;
    case "smooth-turn":
      prompt = `Compare u(x)=(x−${x})² and v(x)=|x−${x}| at x=${x}. Which statement is correct?`;
      answer =
        "u is differentiable with derivative 0; v has one-sided slopes −1 and 1 and is not differentiable.";
      wrong = [
        "Neither is differentiable because both change direction.",
        "Both are differentiable because both are continuous.",
        "Only v is differentiable because its pieces are straight lines.",
      ];
      break;
    case "average-rate":
      prompt = `Find the average rate of change between (${x},${b}) and (${x + 3},${b + 3 * a}).`;
      answer = String(a);
      wrong = [String(3 * a), String(1 / a), String(-a)];
      break;
    case "context-function":
      prompt = `A tank starts with ${b * 10} L and fills at ${a} L/min for ${x} minutes, then stops for 2 minutes. Which describes water amount W as a function of time t?`;
      answer = `W rises from ${b * 10} to ${b * 10 + a * x} L, then stays constant for 2 minutes.`;
      wrong = [
        `W rises from 0 to ${a * x} L, then drops to 0.`,
        `W is constant for ${x} minutes, then rises for 2 minutes.`,
        `W falls from ${b * 10 + a * x} to ${b * 10} L, then rises.`,
      ];
      break;
    case "evaluate-function":
      prompt = `For F(t)=${a}t²−${b}t+${c}, find F(${x}).`;
      answer = String(a * x * x - b * x + c);
      wrong = [
        String(a * x - b * x + c),
        String(a * x * x + b * x + c),
        String(a * x * x - b * x - c),
      ];
      break;
    case "interpret-notation":
      prompt = `C(t) is a rental cost in dollars for t hours. What does C(${x + 1})−C(${x}) represent?`;
      answer = `The extra cost for extending a rental from ${x} to ${x + 1} hours.`;
      wrong = [
        `The cost of renting for exactly 1 hour, regardless of prior time.`,
        `The number of hours that cost $${x + 1}.`,
        `The average hourly cost over the first ${x + 1} hours.`,
      ];
      break;
    case "function-table":
      prompt = `R contains (${x},${a}), (${x + 1},${b}), (${x + 2},${a}). S contains (${x},${a}), (${x},${a + 1}), (${x + 2},${b}). Which is a function of the first coordinate?`;
      answer =
        "R only. Repeated outputs are allowed; S gives one input two different outputs.";
      wrong = [
        "Both, because each relation lists three ordered pairs.",
        "S only. A function cannot have repeated outputs.",
        "Neither, because R repeats an output and S repeats an input.",
      ];
      break;
    case "graph-situation":
      prompt = `A cyclist starts ${b} km from home and moves steadily to ${b + 2 * a} km after 2 hours, then stops for 1 hour. Which pair of graph points is consistent with the situation?`;
      answer = `(1,${b + a}) and (2.5,${b + 2 * a})`;
      wrong = [
        `(1,${a}) and (2.5,0)`,
        `(1,${b + 2 * a}) and (2.5,${b + a})`,
        `(1,${b + a}) and (2.5,${b + 3 * a})`,
      ];
      break;
    case "compare-notation":
      prompt = `A assigns each student one locker. Sam and Lee both have locker ${b}. Is the reverse rule, taking a locker and returning its student, a function?`;
      answer = `No. Input ${b} has the different outputs Sam and Lee.`;
      wrong = [
        "Yes. The original rule A is a function, so its reverse always is.",
        "Yes. Repeated inputs are always allowed to have different outputs.",
        "No. Functions can only have numerical outputs.",
      ];
      break;
    case "solve-check":
      prompt = `Solve ${a}z+${b}=${a * x + b}.`;
      answer = String(x);
      wrong = [String(x + 1), String(-x), String(a * x)];
      break;
    default:
      throw Error("No verified adaptive counterpart for this skill.");
  }
  wrong = [...new Set(wrong)].filter((v) => v !== answer);
  if (wrong.length < 3) throw Error("Adaptive choices must be distinct.");
  return {
    skill: `weekly:${skill}`,
    name: skill.replaceAll("-", " "),
    prompt,
    answer,
    choices: [
      { text: answer, correct: true },
      ...wrong.map((text) => ({ text, correct: false })),
    ],
    solution: answer,
    manual: false,
    points: 3,
    criteria:
      "Choose the mathematically valid result or interpretation. Supporting work may earn teacher-awarded partial credit.",
    desmos: true,
    supports: "Desmos graphing calculator",
    level,
    generator: `weekly-mc:${skill}`,
    counterpart:
      "Selected-response concept evidence; does not automatically evaluate a written proof or graph.",
  };
}
