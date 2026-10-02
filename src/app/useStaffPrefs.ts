import { useState } from "react";

import type { KeyStyle } from "../render/KeyboardLayer";
import { DEFAULT_CAMERA, normalizeCamera } from "../render/worldCamera";
import type { CameraPrefs } from "../render/worldCamera";
import { DEFAULT_ROAD_SHAPE } from "../render/RoadLayer";
import type { NoteNameStyle } from "../song/musicxml";
import type { KeyRange } from "./useFallingView";

export interface StaffPrefs {
  readonly zoom: number;
  readonly noteColor: string;
  readonly scoreColor: string;
  readonly singleLine: boolean;
  readonly follow: boolean;
  /** Measures on every line of a wrapped page; 0 lets the width decide. */
  readonly measuresPerLine: 0 | 2 | 4 | 8;
  /** Note names on the staff and the falling notes. */
  readonly noteNames: "off" | NoteNameStyle;
  /** Chord symbols over the staff. */
  readonly chords: boolean;
  /** Finger numbers on the staff. */
  readonly fingers: boolean;
  readonly fingerColors: "mono" | "fingers";
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
  readonly noteCardsConfigured: boolean;
  /** Classroom stickers on the keys. */
  readonly labels: boolean;
  /** The keys shown: fitted to the song, or a real keyboard's range. */
  readonly keyRange: KeyRange;
  /** The look of the keys. */
  readonly keyStyle: KeyStyle;
  /** The take's review opens by itself at the end of a run. */
  readonly autoReview: boolean;
  /** The road's width at the horizon, as a share of its width at the keys. */
  readonly roadFar: number;
  readonly camera: CameraPrefs;
  /** The road's horizon, as a share of the way from the top down to the keys. */
  readonly roadHorizon: number;
}

const STAFF_PREFS_KEY = "staff-prefs";
const DEFAULT_STAFF_PREFS: StaffPrefs = {
  zoom: 1,
  noteColor: "#62d9ff",
  scoreColor: "#ffffff",
  singleLine: true,
  follow: true,
  measuresPerLine: 4,
  noteNames: "off",
  chords: false,
  fingers: true,
  fingerColors: "mono",
  visible: true,
  lane: true,
  keys: true,
  hands: false,
  road: true,
  noteCards: false,
  noteCardsConfigured: false,
  labels: true,
  keyRange: "song",
  keyStyle: "arcade",
  autoReview: false,
  camera: DEFAULT_CAMERA,
  roadFar: DEFAULT_ROAD_SHAPE.far,
  roadHorizon: DEFAULT_ROAD_SHAPE.horizon
};

function loadStaffPrefs(): StaffPrefs {
  const mobile = window.matchMedia(
    "(max-width: 640px), (pointer: coarse) and (max-height: 640px)"
  ).matches;
  const defaults = {
    ...DEFAULT_STAFF_PREFS,
    visible: !mobile,
    labels: !mobile
  };
  try {
    const raw = localStorage.getItem(STAFF_PREFS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<StaffPrefs>) : {};
    const color = (value: unknown, fallback: string) =>
      typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
    return {
      ...defaults,
      ...saved,
      visible: typeof saved.visible === "boolean" ? saved.visible : defaults.visible,
      labels: typeof saved.labels === "boolean" ? saved.labels : defaults.labels,
      noteColor: color(saved.noteColor, DEFAULT_STAFF_PREFS.noteColor),
      scoreColor: color(saved.scoreColor, DEFAULT_STAFF_PREFS.scoreColor),
      camera: normalizeCamera(saved.camera),
      noteCards: typeof saved.noteCards === "boolean" ? saved.noteCards : saved.road === false,
      noteCardsConfigured:
        typeof saved.noteCardsConfigured === "boolean"
          ? saved.noteCardsConfigured
          : typeof saved.noteCards === "boolean",
      fingerColors: saved.fingerColors === "fingers" ? "fingers" : "mono"
    };
  } catch {
    return defaults;
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
    const next = {
      ...staffPrefs,
      ...change,
      ...(change.noteCards === undefined ? {} : { noteCardsConfigured: true })
    };
    if (change.road !== undefined && !next.noteCardsConfigured) next.noteCards = !change.road;
    saveStaffPrefs(next);
    setStaffPrefs(next);
  };
  return { staffPrefs, updateStaffPrefs };
}
