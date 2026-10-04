import type { DictionaryEntry, InputToken, OptimizerConfig } from "./types";

export const DEFAULT_CONFIG: OptimizerConfig = {
  beamWidth: 48,
  maxWordLength: 16,
  maxCandidatesPerState: 48,
  coverageWeight: 20,
  frequencyWeight: 12,
  longWordWeight: 3,
  shortWordPenalty: 15,
  fallbackPenalty: 18,
  topRowPenalty: 10,
  shiftPenalty: 30,
  altPenalty: 50,
  homeRowBonus: 0.3,
  digitRowLetterPenalty: 25,
  phraseBoundaryBonus: 3,
  bigramWeight: 40
};

const HOME_ROW = new Set([
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon"
]);

export function wordScore(
  entry: DictionaryEntry,
  dictionarySize: number,
  config: OptimizerConfig
): number {
  const length = entry.word.length;
  const frequency =
    Math.log1p(dictionarySize / entry.rank) / Math.log1p(Math.max(1, dictionarySize));
  return (
    config.coverageWeight * length +
    config.frequencyWeight * frequency * length +
    config.longWordWeight * Math.pow(length, 1.5) -
    (length <= 2 ? config.shortWordPenalty : 0)
  );
}

export function inputPenalty(
  token: InputToken,
  isLetter: boolean,
  config: OptimizerConfig
): number {
  if (token.modifier === "alt") return config.altPenalty;
  if (token.modifier === "shift") return config.shiftPenalty;
  return isLetter ? 0 : config.topRowPenalty;
}

export function comfortBonus(token: InputToken, config: OptimizerConfig): number {
  if (token.modifier !== "none") return 0;
  if (token.physicalKey === "Backquote") return -config.digitRowLetterPenalty;
  return HOME_ROW.has(token.physicalKey) ? config.homeRowBonus : 0;
}

export function resolveConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Неверная настройка генератора: ${key}`);
  }
  for (const key of ["beamWidth", "maxWordLength", "maxCandidatesPerState"] as const) {
    if (!Number.isInteger(config[key]) || config[key] < 1)
      throw new Error(`Неверная настройка генератора: ${key}`);
  }
  return config;
}
