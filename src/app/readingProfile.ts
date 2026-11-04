import type { StaffPrefs } from "./staffPreferences";
import { DEFAULT_CAMERA } from "../render/worldCamera";

/** Effective display only: never persists the course's forced defaults over player preferences. */
export function readingDisplayProfile(prefs: StaffPrefs, beginner = false): StaffPrefs {
  return {
    ...prefs,
    ...(beginner
      ? {
          freeCamera: false,
          performanceScene: false,
          camera: { ...DEFAULT_CAMERA, pitch: 18 },
          keyboardOrientation: "follow" as const
        }
      : {}),
    visible: true,
    lane: false,
    keys: true,
    hands: false,
    road: false,
    flatNoteBurning: false,
    flatPressEffects: false,
    noteParticles: false,
    labels: false,
    noteNames: "off",
    fallingNoteNames: "off",
    fallingFingers: true,
    keyboardFingers: true,
    fingers: false,
    fingerColors: "mono",
    chords: false,
    noteCards: false,
    keyRange: "song",
    keyStyle: prefs.keyStyle === "clay" ? "clay" : "classic",
    follow: true,
    singleLine: true,
    autoReview: false
  };
}
