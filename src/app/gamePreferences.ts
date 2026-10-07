import type { Difficulty } from "../practice/gameRules";

export interface GamePreferences {
  readonly difficulty: Difficulty;
  readonly performance: boolean;
  readonly stopOnError: boolean;
  readonly ranked: boolean;
  readonly learningWindow: boolean;
}
export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  difficulty: "normal",
  performance: false,
  stopOnError: false,
  ranked: false,
  learningWindow: true
};
export function normalizeGamePreferences(value: unknown): GamePreferences {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    difficulty: ["easy", "normal", "hard", "expert"].includes(String(raw.difficulty))
      ? (raw.difficulty as Difficulty)
      : "normal",
    performance: raw.performance === true,
    stopOnError: raw.stopOnError === true,
    ranked: raw.ranked === true,
    learningWindow: typeof raw.learningWindow === "boolean" ? raw.learningWindow : true
  };
}
