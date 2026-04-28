export const OPEN_MIDDLE_GAME_SLUG = "open_middle";

export const OPEN_MIDDLE_OPERATORS = [
  { value: "+", label: "+" },
  { value: "-", label: "-" },
  { value: "×", label: "×" },
  { value: "÷", label: "÷" },
];

const ASCII_TO_PRETTY_OPERATOR = {
  "*": "×",
  "/": "÷",
};

const PRETTY_TO_ASCII_OPERATOR = {
  "×": "*",
  "÷": "/",
};

const TOKEN_PATTERN = /_+|\d+|[()+\-*/=×÷]/g;
const SAFE_EVAL_PATTERN = /^[0-9+\-*/().\s]+$/;
const DEFAULT_DIGIT_POOL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MAX_VERSION_COUNT = 24;

function normalizeOperatorToken(token) {
  return ASCII_TO_PRETTY_OPERATOR[token] || token;
}

function asciiOperatorToken(token) {
  return PRETTY_TO_ASCII_OPERATOR[token] || token;
}

function normalizeRawInput(rawInput) {
  return String(rawInput || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function tokenizeLine(line) {
  return String(line || "").match(TOKEN_PATTERN) || [];
}

function isArithmeticOperator(token) {
  return ["+", "-", "×", "÷", "*", "/"].includes(token);
}

function replaceOperators(tokens, operatorValuesBySlot) {
  let arithmeticIndex = 0;
  return tokens.map((token) => {
    if (!isArithmeticOperator(token)) return token;
    const nextValue = operatorValuesBySlot[arithmeticIndex] || normalizeOperatorToken(token);
    arithmeticIndex += 1;
    return nextValue;
  });
}

export function normalizeDigitPool(values) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

  const unique = [];
  for (const value of rawValues) {
    const digit = Number(value);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) continue;
    if (!unique.includes(digit)) unique.push(digit);
  }

  return unique.length ? unique : [...DEFAULT_DIGIT_POOL];
}

export function buildDefaultOpenMiddleRules(overrides = {}) {
  const courseId = String(overrides.courseId || "").trim() || null;
  return {
    digitsUnique: true,
    allowStudentAuthoring: true,
    versionOperators: OPEN_MIDDLE_OPERATORS.map((item) => item.value),
    courseId,
  };
}

export function parseOpenMiddleTemplate(rawInput) {
  const normalizedRawInput = normalizeRawInput(rawInput);
  const lines = normalizedRawInput ? normalizedRawInput.split("\n") : [];
  const parsedLines = [];
  const errors = [];
  let blankCounter = 0;
  let arithmeticSlotCounter = 0;

  if (!lines.length) {
    return {
      ok: false,
      normalizedRawInput,
      errors: [{ code: "empty", message: "Add at least one equation line." }],
      structure: null,
    };
  }

  lines.forEach((line, lineIndex) => {
    const tokens = tokenizeLine(line);
    const rebuilt = tokens.join("");

    if (!tokens.length || rebuilt !== line.replace(/\s+/g, "")) {
      errors.push({
        code: "invalid_characters",
        lineIndex,
        message: "Use digits, parentheses, operators, equals signs, and underscores only.",
      });
      return;
    }

    if (!tokens.includes("=")) {
      errors.push({
        code: "missing_equals",
        lineIndex,
        message: "Each line needs an equals sign.",
      });
    }

    const blanks = [];
    const operatorSlots = [];
    const parsedTokens = tokens.map((token) => {
      if (token.startsWith("_")) {
        const blankId = `blank-${blankCounter}`;
        blanks.push(blankId);
        blankCounter += 1;
        return { type: "blank", value: "_", blankId };
      }

      const value = normalizeOperatorToken(token);
      if (isArithmeticOperator(token)) {
        operatorSlots.push({
          slotIndex: arithmeticSlotCounter,
          operator: value,
        });
        arithmeticSlotCounter += 1;
      }

      return { type: "text", value };
    });

    parsedLines.push({
      lineIndex,
      text: tokens.map((token) => normalizeOperatorToken(token)).join(" "),
      blanks,
      operatorSlots,
      tokens: parsedTokens,
    });
  });

  const structure = {
    normalizedRawInput,
    blankCount: blankCounter,
    lines: parsedLines,
    arithmeticSlotCount: arithmeticSlotCounter,
  };

  return {
    ok: errors.length === 0 && blankCounter > 0,
    normalizedRawInput,
    errors:
      blankCounter > 0
        ? errors
        : [...errors, { code: "missing_blank", message: "Use at least one underscore blank." }],
    structure,
  };
}

function cartesianOperatorCombos(size, operatorValues, limit = MAX_VERSION_COUNT) {
  if (size <= 0) return [[]];

  const results = [];

  function walk(index, current) {
    if (results.length >= limit) return;
    if (index >= size) {
      results.push([...current]);
      return;
    }

    for (const operator of operatorValues) {
      current.push(operator);
      walk(index + 1, current);
      current.pop();
      if (results.length >= limit) break;
    }
  }

  walk(0, []);
  return results;
}

function operatorSignature(values) {
  return values.join("|") || "base";
}

function structureToRawInput(structure, operatorValues = []) {
  return (structure?.lines || [])
    .map((line) => {
      let slotPointer = 0;
      return line.tokens
        .map((token) => {
          if (token.type === "blank") return "_";
          if (isArithmeticOperator(token.value)) {
            const nextValue = operatorValues[slotPointer] || token.value;
            slotPointer += 1;
            return nextValue;
          }
          return token.value;
        })
        .join(" ");
    })
    .join("\n");
}

export function generateOpenMiddleVersions({
  title,
  rawInput,
  parsedStructure,
  rules = {},
}) {
  const baseStructure =
    parsedStructure && typeof parsedStructure === "object"
      ? parsedStructure
      : parseOpenMiddleTemplate(rawInput).structure;

  if (!baseStructure) return [];

  const operatorValues = normalizeOperatorPool(
    Array.isArray(rules.versionOperators) ? rules.versionOperators : OPEN_MIDDLE_OPERATORS.map((item) => item.value)
  );
  const combos = cartesianOperatorCombos(baseStructure.arithmeticSlotCount, operatorValues);
  const uniqueVersions = new Map();

  combos.forEach((combo, index) => {
    const versionRawInput = structureToRawInput(baseStructure, combo);
    const parsed = parseOpenMiddleTemplate(versionRawInput);
    const signature = operatorSignature(
      combo.length
        ? combo
        : collectArithmeticOperators(parsed.structure)
    );

    if (!parsed.ok || uniqueVersions.has(signature)) return;

    uniqueVersions.set(signature, {
      title:
        index === 0
          ? `${String(title || "Open Middle").trim() || "Open Middle"}`
          : `${String(title || "Open Middle").trim() || "Open Middle"} (${signature.replaceAll("|", " ")})`,
      raw_input: parsed.normalizedRawInput,
      parsed_structure: parsed.structure,
      operator_signature: signature,
      is_base: index === 0,
    });
  });

  return [...uniqueVersions.values()];
}

function collectArithmeticOperators(structure) {
  const values = [];
  for (const line of structure?.lines || []) {
    for (const token of line.tokens || []) {
      if (token.type === "text" && isArithmeticOperator(token.value)) {
        values.push(normalizeOperatorToken(token.value));
      }
    }
  }
  return values;
}

export function normalizeOperatorPool(values) {
  const normalized = [];
  for (const value of values || []) {
    const operator = normalizeOperatorToken(String(value || "").trim());
    if (!OPEN_MIDDLE_OPERATORS.some((item) => item.value === operator)) continue;
    if (!normalized.includes(operator)) normalized.push(operator);
  }
  return normalized.length ? normalized : OPEN_MIDDLE_OPERATORS.map((item) => item.value);
}

function toPlacementMap(placements, blankCount = 0) {
  if (Array.isArray(placements)) {
    return Object.fromEntries(
      placements.map((value, index) => [`blank-${index}`, value])
    );
  }

  if (placements && typeof placements === "object") return placements;

  const empty = {};
  for (let index = 0; index < blankCount; index += 1) {
    empty[`blank-${index}`] = "";
  }
  return empty;
}

function renderExpressionText(line, placements) {
  return (line?.tokens || [])
    .map((token) => {
      if (token.type === "blank") {
        return String(placements[token.blankId] ?? "_");
      }
      return token.value;
    })
    .join(" ");
}

function toEvalExpression(expression) {
  return expression
    .replaceAll("×", "*")
    .replaceAll("÷", "/");
}

function safeEvaluateExpression(expression) {
  const sanitized = toEvalExpression(expression).replace(/\s+/g, "");
  if (!SAFE_EVAL_PATTERN.test(sanitized)) {
    throw new Error("Unsafe expression");
  }
  return Function(`"use strict"; return (${sanitized});`)();
}

export function validateOpenMiddleResponse({
  parsedStructure,
  placements,
  digitPool = DEFAULT_DIGIT_POOL,
  rules = {},
}) {
  const structure = parsedStructure && typeof parsedStructure === "object" ? parsedStructure : null;
  const placementMap = toPlacementMap(placements, structure?.blankCount || 0);
  const normalizedDigitPool = normalizeDigitPool(digitPool);
  const errors = [];
  const usedDigits = [];
  const lines = [];

  if (!structure?.lines?.length) {
    return {
      isCorrect: false,
      isComplete: false,
      errors: [{ code: "invalid_structure", message: "Template structure is missing." }],
      lines: [],
      usedDigits: [],
    };
  }

  for (let index = 0; index < structure.blankCount; index += 1) {
    const blankId = `blank-${index}`;
    const rawValue = String(placementMap[blankId] ?? "").trim();
    if (!rawValue) {
      errors.push({ code: "missing_blank", blankId, message: "Fill every box before reveal." });
      continue;
    }

    const digit = Number(rawValue);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
      errors.push({ code: "invalid_digit", blankId, message: "Each box must contain one digit 0-9." });
      continue;
    }

    if (!normalizedDigitPool.includes(digit)) {
      errors.push({ code: "digit_not_allowed", blankId, message: `${digit} is not in this digit pool.` });
    }

    if ((rules?.digitsUnique ?? true) && usedDigits.includes(digit)) {
      errors.push({ code: "digit_reused", blankId, message: "Each digit can only be used once." });
    }

    usedDigits.push(digit);
  }

  for (const line of structure.lines) {
    const expression = renderExpressionText(line, placementMap);
    const [leftSide, rightSide, ...extra] = expression.split("=");

    if (!leftSide || !rightSide || extra.length > 0) {
      errors.push({
        code: "invalid_equation",
        lineIndex: line.lineIndex,
        message: "Each line must evaluate as one equation.",
      });
      lines.push({
        lineIndex: line.lineIndex,
        expression,
        isTrue: false,
      });
      continue;
    }

    let leftValue = null;
    let rightValue = null;
    let isTrue = false;

    try {
      leftValue = safeEvaluateExpression(leftSide);
      rightValue = safeEvaluateExpression(rightSide);
      isTrue = Math.abs(Number(leftValue) - Number(rightValue)) < 1e-9;
    } catch (error) {
      errors.push({
        code: "eval_failed",
        lineIndex: line.lineIndex,
        message: "One of the expressions could not be evaluated.",
      });
    }

    if (!isTrue) {
      errors.push({
        code: "equation_false",
        lineIndex: line.lineIndex,
        message: "At least one equation is not true yet.",
      });
    }

    lines.push({
      lineIndex: line.lineIndex,
      expression,
      leftValue,
      rightValue,
      isTrue,
    });
  }

  return {
    isCorrect: errors.length === 0,
    isComplete: errors.every((error) => error.code !== "missing_blank"),
    errors,
    lines,
    usedDigits,
    placements: placementMap,
  };
}

export function buildBlankPlacements(blankCount, seed = {}) {
  const placements = {};
  for (let index = 0; index < blankCount; index += 1) {
    placements[`blank-${index}`] = seed[`blank-${index}`] ?? "";
  }
  return placements;
}

export function nextEmptyBlankId(placements, blankCount) {
  for (let index = 0; index < blankCount; index += 1) {
    const blankId = `blank-${index}`;
    if (!String(placements?.[blankId] ?? "").trim()) {
      return blankId;
    }
  }
  return null;
}

export function useDigitInPlacements(placements, blankCount, digit) {
  const nextPlacements = {
    ...buildBlankPlacements(blankCount, placements),
  };
  const targetBlankId = nextEmptyBlankId(nextPlacements, blankCount);
  if (!targetBlankId) return nextPlacements;
  nextPlacements[targetBlankId] = String(digit);
  return nextPlacements;
}

export function clearBlankFromPlacements(placements, blankId) {
  return {
    ...(placements || {}),
    [blankId]: "",
  };
}

export function usedDigitsFromPlacements(placements) {
  return Object.values(placements || {})
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

export function buildOpenMiddleLineDisplay(line, placements) {
  return {
    ...line,
    renderedText: renderExpressionText(line, placements),
  };
}

export function getOpenMiddleVisibilityLabel(value) {
  return {
    private: "Private",
    class: "Class",
    school: "School",
    public: "Public",
  }[value] || "Private";
}
