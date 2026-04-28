export const INTEGER_MASTERY_SETTINGS_GAME = {
  slug: "integer_mastery_settings",
  name: "Integer Mastery Settings",
  category: "math_skills",
  description: "Owner-managed global level-up rules for Adding & Subtracting Integers.",
  is_multiplayer: false,
};

export const DEFAULT_INTEGER_MASTERY_SETTINGS = {
  minAttempts: 10,
  recentWindowSize: 10,
  minCorrectInRecentWindow: 8,
  minCorrectStreak: 5,
  minBlendedAccuracy: 0.8,
  historicalWeight: 0.25,
  countRetriesAsCorrect: true,
  useSpeedGate: false,
  maxMedianResponseMs: 9000,
  useHintGate: true,
  maxHintRate: 0.2,
  closeBuffer: 0.08,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInteger(value, fallback, min, max) {
  return Math.round(clamp(finiteNumber(value, fallback), min, max));
}

function normalizeDecimal(value, fallback, min, max) {
  return Math.round(clamp(finiteNumber(value, fallback), min, max) * 100) / 100;
}

export function normalizeIntegerMasterySettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const minAttempts = normalizeInteger(source.minAttempts, DEFAULT_INTEGER_MASTERY_SETTINGS.minAttempts, 1, 50);
  const recentWindowSize = normalizeInteger(
    source.recentWindowSize,
    DEFAULT_INTEGER_MASTERY_SETTINGS.recentWindowSize,
    1,
    50
  );
  const minCorrectInRecentWindow = normalizeInteger(
    source.minCorrectInRecentWindow,
    DEFAULT_INTEGER_MASTERY_SETTINGS.minCorrectInRecentWindow,
    1,
    recentWindowSize
  );

  return {
    minAttempts,
    recentWindowSize,
    minCorrectInRecentWindow,
    minCorrectStreak: normalizeInteger(
      source.minCorrectStreak,
      DEFAULT_INTEGER_MASTERY_SETTINGS.minCorrectStreak,
      0,
      50
    ),
    minBlendedAccuracy: normalizeDecimal(
      source.minBlendedAccuracy,
      DEFAULT_INTEGER_MASTERY_SETTINGS.minBlendedAccuracy,
      0.5,
      1
    ),
    historicalWeight: normalizeDecimal(
      source.historicalWeight,
      DEFAULT_INTEGER_MASTERY_SETTINGS.historicalWeight,
      0,
      1
    ),
    countRetriesAsCorrect: source.countRetriesAsCorrect !== false,
    useSpeedGate: source.useSpeedGate === true,
    maxMedianResponseMs: normalizeInteger(
      source.maxMedianResponseMs,
      DEFAULT_INTEGER_MASTERY_SETTINGS.maxMedianResponseMs,
      1000,
      30000
    ),
    useHintGate: source.useHintGate !== false,
    maxHintRate: normalizeDecimal(
      source.maxHintRate,
      DEFAULT_INTEGER_MASTERY_SETTINGS.maxHintRate,
      0,
      1
    ),
    closeBuffer: normalizeDecimal(
      source.closeBuffer,
      DEFAULT_INTEGER_MASTERY_SETTINGS.closeBuffer,
      0,
      0.5
    ),
  };
}

export function integerMasterySettingsFromForm(formData) {
  return normalizeIntegerMasterySettings({
    minAttempts: formData.get("min_attempts"),
    recentWindowSize: formData.get("recent_window_size"),
    minCorrectInRecentWindow: formData.get("min_correct_in_recent_window"),
    minCorrectStreak: formData.get("min_correct_streak"),
    minBlendedAccuracy: Number(formData.get("min_blended_accuracy") || 0) / 100,
    historicalWeight: Number(formData.get("historical_weight") || 0) / 100,
    countRetriesAsCorrect: formData.get("count_retries_as_correct") === "on",
    useSpeedGate: formData.get("use_speed_gate") === "on",
    maxMedianResponseMs: Number(formData.get("max_median_response_seconds") || 0) * 1000,
    useHintGate: formData.get("use_hint_gate") === "on",
    maxHintRate: Number(formData.get("max_hint_rate") || 0) / 100,
    closeBuffer: Number(formData.get("close_buffer") || 0) / 100,
  });
}

export function formatIntegerMasterySettingsSummary(settingsInput) {
  const settings = normalizeIntegerMasterySettings(settingsInput);
  return `${settings.minCorrectInRecentWindow}/${settings.recentWindowSize} recent correct, streak ${settings.minCorrectStreak}, ${Math.round(settings.minBlendedAccuracy * 100)}% blended accuracy`;
}
