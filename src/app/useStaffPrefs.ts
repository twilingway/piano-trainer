import { useState } from "react";

import type { NoteNameStyle } from "../song/musicxml";

export interface StaffPrefs {
  readonly zoom: number;
  readonly singleLine: boolean;
  readonly follow: boolean;
  /** Measures on every line of a wrapped page; 0 lets the width decide. */
  readonly measuresPerLine: 0 | 2 | 4 | 8;
  /** Note names on the staff and the falling notes. */
  readonly noteNames: "off" | NoteNameStyle;
  /** Chord symbols over the staff. */
  readonly chords: boolean;
  /** The staff on screen at all; hidden, the falling notes get the room. */
  readonly visible: boolean;
  /** The falling notes on screen. */
  readonly lane: boolean;
  /** The keyboard on screen. */
  readonly keys: boolean;
  /** Schematic hands over the keyboard. */
  readonly hands: boolean;
  /** The trial road view: notes in perspective, glowing, with sparks. */
  readonly road: boolean;
  /** Falling notes carry the note written on a small staff. */
  readonly noteCards: boolean;
}

const STAFF_PREFS_KEY = "staff-prefs";
const DEFAULT_STAFF_PREFS: StaffPrefs = {
  zoom: 0.8,
  singleLine: false,
  follow: true,
  measuresPerLine: 4,
  noteNames: "off",
  chords: false,
  visible: true,
  lane: true,
  keys: true,
  hands: true,
  road: false,
  noteCards: true
};

function loadStaffPrefs(): StaffPrefs {
  try {
    const raw = localStorage.getItem(STAFF_PREFS_KEY);
    return raw
      ? { ...DEFAULT_STAFF_PREFS, ...(JSON.parse(raw) as Partial<StaffPrefs>) }
      : DEFAULT_STAFF_PREFS;
  } catch {
    return DEFAULT_STAFF_PREFS;
  }
}

function saveStaffPrefs(prefs: StaffPrefs): void {
  try {
    localStorage.setItem(STAFF_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the staff just starts at the defaults next time.
  }
}

/** What the player shows and how the staff is laid out, kept across reloads. */
export function useStaffPrefs() {
  const [staffPrefs, setStaffPrefs] = useState<StaffPrefs>(loadStaffPrefs);
  const updateStaffPrefs = (change: Partial<StaffPrefs>) => {
    const next = { ...staffPrefs, ...change };
    saveStaffPrefs(next);
    setStaffPrefs(next);
  };
  return { staffPrefs, updateStaffPrefs };
}
