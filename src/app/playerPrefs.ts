import type { PracticeMode } from "../practice/session";
import type { LessonChoice } from "./lessons";

/** Who plays: one hand, both, or nobody (the song just sounds). */
export type HandChoice = "right" | "left" | "both" | "listen";

/** What the player picked last, brought back on the next visit. */
export interface PlayerPrefs {
  readonly mode: PracticeMode;
  readonly handChoice: HandChoice;
  readonly speed: number;
  readonly metronome: boolean;
  /** The program plays what the player does not; off, only the player's notes sound. */
  readonly accompaniment: boolean;
  /** A MIDI song's notes as its staff writes them rather than as the file plays them. */
  readonly notesAsWritten: boolean;
  /** The last lesson and level opened; what comes up when a library song cannot. */
  readonly lesson: LessonChoice | null;
  /** The library song on screen, `my:<id>` or `dir:<path>`; null for a lesson. */
  readonly librarySource: string | null;
}

const PLAYER_PREFS_KEY = "player-prefs";

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  mode: "wait",
  handChoice: "right",
  speed: 0.75,
  metronome: true,
  accompaniment: true,
  notesAsWritten: true,
  lesson: null,
  librarySource: null
};

export function normalizePlayerPrefs(value: unknown): PlayerPrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const bool = (key: "metronome" | "accompaniment" | "notesAsWritten") =>
    typeof raw[key] === "boolean" ? raw[key] : DEFAULT_PLAYER_PREFS[key];
  const lesson =
    raw.lesson && typeof raw.lesson === "object" ? (raw.lesson as Record<string, unknown>) : {};
  return {
    mode: raw.mode === "tempo" ? "tempo" : "wait",
    handChoice: ["right", "left", "both", "listen"].includes(String(raw.handChoice))
      ? (raw.handChoice as HandChoice)
      : "right",
    speed:
      typeof raw.speed === "number" && Number.isFinite(raw.speed)
        ? Math.max(0.01, Math.min(1, raw.speed))
        : DEFAULT_PLAYER_PREFS.speed,
    metronome: bool("metronome"),
    accompaniment: bool("accompaniment"),
    notesAsWritten: bool("notesAsWritten"),
    lesson:
      typeof lesson.exerciseId === "string" && typeof lesson.levelId === "string"
        ? { exerciseId: lesson.exerciseId, levelId: lesson.levelId }
        : null,
    librarySource: typeof raw.librarySource === "string" ? raw.librarySource : null
  };
}

export function loadPlayerPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_KEY);
    return raw ? normalizePlayerPrefs(JSON.parse(raw)) : DEFAULT_PLAYER_PREFS;
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
}

/** Merges `change` into what is kept. */
export function savePlayerPrefs(change: Partial<PlayerPrefs>): void {
  try {
    localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ ...loadPlayerPrefs(), ...change }));
  } catch {
    // Private mode: the player just starts at the defaults next time.
  }
}
