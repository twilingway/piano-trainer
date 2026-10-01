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
  lesson: null,
  librarySource: null
};

export function loadPlayerPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_KEY);
    return raw
      ? { ...DEFAULT_PLAYER_PREFS, ...(JSON.parse(raw) as Partial<PlayerPrefs>) }
      : DEFAULT_PLAYER_PREFS;
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
