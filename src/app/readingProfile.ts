import type { StaffPrefs } from "./staffPreferences";

/** Effective display only: never persists the course's forced defaults over player preferences. */
export function readingDisplayProfile(prefs: StaffPrefs): StaffPrefs {
  return {
    ...prefs,
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
