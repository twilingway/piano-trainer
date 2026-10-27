import {
  normalizeCameraComposition,
  normalizeWorldFov,
  type CameraComposition
} from "../render/cameraComposition";
import type { FallingNoteStyle } from "../render/fallingNoteStyle";
import {
  DEFAULT_PROJECTION_PARAMETERS,
  normalizeProjectionParameters,
  type ProjectionParameters
} from "../render/stylizedProjection";
import {
  DEFAULT_FREE_DIRECT_FIELD,
  DEFAULT_FREE_PERSPECTIVE_FIELD,
  normalizeFreeRoadLayout,
  type FreeRoadLayout
} from "../render/freeRoadLayout";
import { DEFAULT_PLAYED_NOTE_COLOR } from "../staff/notationColors";
import type { HandStyle } from "../render/handRenderCatalog";
import type { KeyStyle } from "../render/KeyboardLayer";
import { CAMERA_PRESETS, normalizeCamera } from "../render/worldCamera";
import type { CameraPrefs } from "../render/worldCamera";
import { DEFAULT_ROAD_SHAPE } from "../render/RoadLayer";
import type { NoteNameStyle } from "../song/musicxml";
import type { KeyRange } from "./useFallingView";
import type { KeyboardOrientation } from "./viewProfiles";

export interface StaffPrefs {
  readonly noteProjection: ProjectionParameters;
  readonly zoom: number;
  /** Independent size of piano tab labels. */
  readonly tabsZoom: number;
  readonly noteColor: string;
  readonly playedNoteColor: string;
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
  /** Optional lane guides on the 3D road. */
  readonly roadGuides: boolean;
  readonly fallingNoteStyle: FallingNoteStyle;
  /** The local pianist model at the 3D keys instead of the live hands, when it is there. */
  readonly pianist: boolean;
  /** Inspection mode persists; the manual orbit pose is transient. */
  readonly cameraComposition: CameraComposition;
  readonly worldFov: number;
  readonly freeCamera: boolean;
  readonly freeCameraWasd: boolean;
  readonly freeDirectField: FreeRoadLayout;
  readonly freePerspectiveField: FreeRoadLayout;
  readonly performanceScene: boolean;
  /** Dim physical keys for a demonstration; study stays bright. */
  readonly keyboardDim: boolean;
  /** Independent visual effects in every keyboard view. */
  readonly flatNoteBurning: boolean;
  readonly flatPressEffects: boolean;
  readonly noteParticles: boolean;
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
  /** Independent top keyboard camera inside a native 3D view. */
  readonly keyboardOrientation: KeyboardOrientation;
  /** The take's review opens by itself at the end of a run. */
  readonly autoReview: boolean;
  /** Positive: key-width share; negative: screen-width share in the standard view. */
  readonly roadFar: number;
  readonly camera: CameraPrefs;
  /** The road's horizon, as a share of the way from the top down to the keys. */
  readonly roadHorizon: number;
}

export const DEFAULT_STAFF_PREFS: StaffPrefs = {
  noteProjection: DEFAULT_PROJECTION_PARAMETERS,
  zoom: 1,
  tabsZoom: 1,
  noteColor: "#ffffff",
  playedNoteColor: DEFAULT_PLAYED_NOTE_COLOR,
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
  roadGuides: false,
  fallingNoteStyle: "filled",
  pianist: false,
  cameraComposition: "standard",
  worldFov: 45,
  freeCamera: false,
  freeCameraWasd: false,
  freeDirectField: DEFAULT_FREE_DIRECT_FIELD,
  freePerspectiveField: DEFAULT_FREE_PERSPECTIVE_FIELD,
  performanceScene: false,
  keyboardDim: false,
  flatNoteBurning: true,
  flatPressEffects: true,
  noteParticles: true,
  noteCards: false,
  noteCardsConfigured: true,
  labels: false,
  fps: false,
  keyRange: "song",
  keyStyle: "3d",
  keyboardOrientation: "follow",
  autoReview: false,
  camera: CAMERA_PRESETS.top,
  roadFar: DEFAULT_ROAD_SHAPE.far,
  roadHorizon: DEFAULT_ROAD_SHAPE.horizon
};

export function normalizeStaffPrefs(value: unknown, mobile = false): StaffPrefs {
  const defaults = { ...DEFAULT_STAFF_PREFS, visible: !mobile };
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const boolean = <K extends keyof StaffPrefs>(key: K): StaffPrefs[K] =>
    (typeof raw[key] === "boolean" ? raw[key] : defaults[key]) as StaffPrefs[K];
  const number = (
    key: "zoom" | "tabsZoom" | "roadFar" | "roadHorizon",
    low: number,
    high: number
  ) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.max(low, Math.min(high, v))
      : defaults[key];
  };
  const color = (key: "noteColor" | "playedNoteColor" | "scoreColor") =>
    typeof raw[key] === "string" && /^#[\da-f]{6}$/i.test(raw[key]) ? raw[key] : defaults[key];
  const choice = <K extends keyof StaffPrefs>(
    key: K,
    values: readonly StaffPrefs[K][]
  ): StaffPrefs[K] =>
    values.includes(raw[key] as StaffPrefs[K]) ? (raw[key] as StaffPrefs[K]) : defaults[key];
  const zoom = number("zoom", 0.5, 2);
  return {
    noteProjection: normalizeProjectionParameters(raw.noteProjection),
    zoom,
    tabsZoom: raw.tabsZoom === undefined ? zoom : number("tabsZoom", 0.5, 2),
    noteColor: color("noteColor"),
    playedNoteColor: color("playedNoteColor"),
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
    roadGuides: boolean("roadGuides"),
    fallingNoteStyle: choice("fallingNoteStyle", ["filled", "flat", "glass"]),
    pianist: boolean("pianist"),
    cameraComposition: normalizeCameraComposition(raw.cameraComposition),
    worldFov: normalizeWorldFov(raw.worldFov),
    freeCamera: boolean("freeCamera"),
    freeCameraWasd: boolean("freeCameraWasd"),
    freeDirectField: normalizeFreeRoadLayout(raw.freeDirectField, DEFAULT_FREE_DIRECT_FIELD),
    freePerspectiveField: normalizeFreeRoadLayout(
      raw.freePerspectiveField,
      DEFAULT_FREE_PERSPECTIVE_FIELD
    ),
    performanceScene: boolean("performanceScene"),
    keyboardDim: boolean("keyboardDim"),
    flatNoteBurning: boolean("flatNoteBurning"),
    flatPressEffects: boolean("flatPressEffects"),
    noteParticles: boolean("noteParticles"),
    noteCards: boolean("noteCards"),
    noteCardsConfigured: boolean("noteCardsConfigured"),
    labels: boolean("labels"),
    fps: boolean("fps"),
    keyRange: choice("keyRange", ["song", "3oct", "4oct", "88", "61", "49", "25"]),
    keyStyle: choice("keyStyle", ["classic", "arcade", "3d"]),
    keyboardOrientation:
      raw.keyStyle === "3d" && raw.keyboardOrientation === "top" ? "top" : "follow",
    autoReview: boolean("autoReview"),
    camera: raw.camera === undefined ? CAMERA_PRESETS.top : normalizeCamera(raw.camera),
    roadFar: number("roadFar", -1, 0.9),
    roadHorizon: number("roadHorizon", 0, 0.6)
  };
}
