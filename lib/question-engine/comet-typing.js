export const COMET_TYPING_WORD_BANK = {
  easy: [
    "cat",
    "sun",
    "map",
    "book",
    "math",
    "glow",
    "planet",
    "rocket",
    "school",
    "pencil",
    "number",
    "garden",
    "market",
    "travel",
    "signal",
    "bright",
    "puzzle",
    "helper",
  ],
  medium: [
    "galaxy",
    "typing",
    "starlight",
    "mission",
    "velocity",
    "pattern",
    "teacher",
    "student",
    "problem",
    "fraction",
    "journey",
    "booster",
    "careful",
    "lantern",
    "science",
    "capture",
  ],
  hard: [
    "constellation",
    "navigation",
    "acceleration",
    "coordinate",
    "curriculum",
    "observation",
    "trailblazer",
    "communication",
    "mathematical",
    "interstellar",
    "adventure",
    "celebration",
  ],
};

export function buildCometTypingPrompt(
  difficulty = "medium",
  previousWord = "",
  random = Math.random
) {
  const pool = COMET_TYPING_WORD_BANK[difficulty] || COMET_TYPING_WORD_BANK.medium;
  let nextWord = pool[Math.floor(random() * pool.length)];

  if (pool.length > 1) {
    while (nextWord === previousWord) {
      nextWord = pool[Math.floor(random() * pool.length)];
    }
  }

  return { word: nextWord };
}
