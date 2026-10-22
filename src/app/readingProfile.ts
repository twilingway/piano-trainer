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
    labels: false,
    noteNames: "off",
    fingers: false,
    fingerColors: "mono",
    chords: false,
    noteCards: false,
    keyRange: "song",
    keyStyle: "classic",
    follow: true,
    singleLine: true,
    autoReview: false
  };
}
