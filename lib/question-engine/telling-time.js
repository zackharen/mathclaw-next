const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function formatTimeLabel(hour, minute) {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function randomQuestionMode(selectedMode) {
  if (selectedMode === "read" || selectedMode === "set") return selectedMode;
  return Math.random() > 0.5 ? "read" : "set";
}

export function buildTellingTimeChoices(question, count = 4) {
  const choices = new Set([question.label]);

  while (choices.size < count) {
    const hour = HOUR_OPTIONS[Math.floor(Math.random() * HOUR_OPTIONS.length)];
    const minute = MINUTE_OPTIONS[Math.floor(Math.random() * MINUTE_OPTIONS.length)];
    choices.add(formatTimeLabel(hour, minute));
  }

  return [...choices].sort(() => Math.random() - 0.5);
}

export function buildClockSetting(excludeLabel = "") {
  let label = excludeLabel;
  let hour = HOUR_OPTIONS[0];
  let minute = MINUTE_OPTIONS[0];

  while (label === excludeLabel) {
    hour = HOUR_OPTIONS[Math.floor(Math.random() * HOUR_OPTIONS.length)];
    minute = MINUTE_OPTIONS[Math.floor(Math.random() * MINUTE_OPTIONS.length)];
    label = formatTimeLabel(hour, minute);
  }

  return { hour, minute };
}

export function buildTellingTimeQuestion(
  selectedMode = "mixed",
  readAnswerMode = "multiple_choice",
  choiceCount = 4
) {
  const mode = randomQuestionMode(selectedMode);
  const hour = HOUR_OPTIONS[Math.floor(Math.random() * HOUR_OPTIONS.length)];
  const minute = MINUTE_OPTIONS[Math.floor(Math.random() * MINUTE_OPTIONS.length)];
  const question = {
    mode,
    hour,
    minute,
    label: formatTimeLabel(hour, minute),
  };

  return {
    ...question,
    choices: buildTellingTimeChoices(question, choiceCount),
    setting: mode === "set" ? buildClockSetting(question.label) : { hour, minute },
    readAnswerMode,
  };
}
