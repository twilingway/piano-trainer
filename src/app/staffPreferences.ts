import type { HandStyle } from "../render/handRenderCatalog";
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
  /** The look of the hands: drawn poses or 3D renders. */
  readonly handStyle: HandStyle;
  /** The trial road view: notes in perspective, glowing, with sparks. */
  readonly road: boolean;
  /** Falling notes carry the note written on a small staff. */
  readonly noteCards: boolean;
  readonly noteCardsConfigured: boolean;
  /** Classroom stickers on the keys. */
  readonly labels: boolean;
  /** Optional renderer diagnostics. */
  readonly fps: boolean;
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

export const DEFAULT_STAFF_PREFS: StaffPrefs = {
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
  handStyle: "rendered",
  road: false,
  noteCards: false,
  noteCardsConfigured: true,
  labels: false,
  fps: false,
  keyRange: "song",
  keyStyle: "arcade",
  autoReview: false,
  camera: DEFAULT_CAMERA,
  roadFar: DEFAULT_ROAD_SHAPE.far,
  roadHorizon: DEFAULT_ROAD_SHAPE.horizon
};

export function normalizeStaffPrefs(value: unknown, mobile = false): StaffPrefs {
  const defaults = { ...DEFAULT_STAFF_PREFS, visible: !mobile };
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const boolean = <K extends keyof StaffPrefs>(key: K): StaffPrefs[K] =>
    (typeof raw[key] === "boolean" ? raw[key] : defaults[key]) as StaffPrefs[K];
  const number = (key: "zoom" | "roadFar" | "roadHorizon", low: number, high: number) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.max(low, Math.min(high, v))
      : defaults[key];
  };
  const color = (key: "noteColor" | "scoreColor") =>
    typeof raw[key] === "string" && /^#[\da-f]{6}$/i.test(raw[key]) ? raw[key] : defaults[key];
  const choice = <K extends keyof StaffPrefs>(
    key: K,
    values: readonly StaffPrefs[K][]
  ): StaffPrefs[K] =>
    values.includes(raw[key] as StaffPrefs[K]) ? (raw[key] as StaffPrefs[K]) : defaults[key];
  return {
    zoom: number("zoom", 0.5, 2),
    noteColor: color("noteColor"),
    scoreColor: color("scoreColor"),
    singleLine: boolean("singleLine"),
    follow: boolean("follow"),
    measuresPerLine: choice("measuresPerLine", [0, 2, 4, 8]),
    noteNames: choice("noteNames", ["off", "ru", "en"]),
    chords: boolean("chords"),
    fingers: boolean("fingers"),
    fingerColors: choice("fingerColors", ["mono", "fingers"]),
    visible: boolean("visible"),
    lane: boolean("lane"),
    keys: boolean("keys"),
    hands: boolean("hands"),
    handStyle: choice("handStyle", ["drawn", "rendered"]),
    road: boolean("road"),
    noteCards: boolean("noteCards"),
    noteCardsConfigured: boolean("noteCardsConfigured"),
    labels: boolean("labels"),
    fps: boolean("fps"),
    keyRange: choice("keyRange", ["song", "3oct", "4oct", "88", "61", "49", "25"]),
    keyStyle: choice("keyStyle", ["classic", "arcade", "perspective"]),
    autoReview: boolean("autoReview"),
    camera: normalizeCamera(raw.camera),
    roadFar: number("roadFar", 0.1, 0.9),
    roadHorizon: number("roadHorizon", 0, 0.6)
  };
}
