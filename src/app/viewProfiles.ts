import { normalizeRoadHorizon } from "../render/roadHorizon";
import { CAMERA_PRESETS, normalizeCamera, type CameraPrefs } from "../render/worldCamera";
import { DEFAULT_SCREEN_LAYOUT, normalizeLayout, type ScreenLayout } from "./screenLayout";

export type KeyboardStyle = "classic" | "arcade" | "3d";
export type NotesProjection = "direct" | "perspective";
export type KeyboardOrientation = "follow" | "top";
export interface ViewAxes {
  readonly keyboardStyle: KeyboardStyle;
  readonly notesProjection: NotesProjection;
  readonly keyboardOrientation: KeyboardOrientation;
}
export interface ViewFraming {
  readonly camera: CameraPrefs;
  readonly roadFar: number;
  readonly roadHorizon: number;
  readonly layout: ScreenLayout;
}
export interface ViewProfiles {
  readonly version: 1;
  readonly active: ViewAxes;
  readonly legacySeed: ViewFraming;
  /** Keep unknown keys intact so a newer or older client does not erase other profiles. */
  readonly entries: Record<string, unknown>;
  readonly projectionByStyle: Record<string, unknown>;
  readonly orientationByPair: Record<string, unknown>;
}
export const DEFAULT_VIEW_FRAMING: ViewFraming = {
  camera: CAMERA_PRESETS.top,
  roadFar: 0.1,
  roadHorizon: 0.1,
  layout: DEFAULT_SCREEN_LAYOUT
};
const STYLES: readonly KeyboardStyle[] = ["classic", "arcade", "3d"];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const projection = (value: unknown, fallback: NotesProjection): NotesProjection =>
  value === "direct" || value === "perspective" ? value : fallback;
const orientation = (value: unknown): KeyboardOrientation => (value === "top" ? "top" : "follow");
export function normalizeViewAxes(value: unknown, fallback?: ViewAxes): ViewAxes {
  const raw = record(value);
  const keyboardStyle =
    raw.keyboardStyle === "perspective"
      ? "3d"
      : STYLES.includes(raw.keyboardStyle as KeyboardStyle)
        ? (raw.keyboardStyle as KeyboardStyle)
        : (fallback?.keyboardStyle ?? "3d");
  return {
    keyboardStyle,
    notesProjection: projection(raw.notesProjection, fallback?.notesProjection ?? "direct"),
    keyboardOrientation:
      keyboardStyle === "3d"
        ? orientation(raw.keyboardOrientation ?? fallback?.keyboardOrientation)
        : "follow"
  };
}
export const viewProfileKey = (axes: ViewAxes): string =>
  `${axes.keyboardStyle}:${axes.notesProjection}:${axes.keyboardOrientation}`;
const pairKey = (axes: Pick<ViewAxes, "keyboardStyle" | "notesProjection">) =>
  `${axes.keyboardStyle}:${axes.notesProjection}`;

export function normalizeViewFraming(
  value: unknown,
  fallback: ViewFraming = DEFAULT_VIEW_FRAMING
): ViewFraming {
  const raw = record(value);
  const camera = record(raw.camera);
  const mergedCamera = { ...fallback.camera };
  for (const key of Object.keys(mergedCamera) as (keyof CameraPrefs)[]) {
    const input = camera[key];
    if (typeof input === "number" && Number.isFinite(input)) mergedCamera[key] = input;
  }
  const number = (value: unknown, low: number, high: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(low, Math.min(high, value))
      : fallback;
  const layout = normalizeLayout(raw.layout, fallback.layout);
  const layoutRecord = record(raw.layout);
  return {
    camera: normalizeCamera(mergedCamera),
    roadFar: number(raw.roadFar, -1, 0.9, fallback.roadFar),
    roadHorizon: normalizeRoadHorizon(raw.roadHorizon, fallback.roadHorizon),
    layout:
      raw.layout &&
      typeof raw.layout === "object" &&
      !Array.isArray(raw.layout) &&
      layoutRecord.staffShare === undefined
        ? { ...layout, staffShare: undefined }
        : layout
  };
}

/** The immutable legacy seed is captured before normalizing away unknown legacy fields. */
export function hydrateViewProfiles(
  value: unknown,
  legacyStaff: unknown,
  legacyLayout: unknown
): ViewProfiles {
  const raw = record(value);
  const staff = record(legacyStaff);
  const legacyAxes = normalizeViewAxes({
    keyboardStyle: staff.keyStyle,
    notesProjection: staff.road === true ? "perspective" : "direct",
    keyboardOrientation:
      staff.keyboardOrientation ?? (staff.keyboardTopView === true ? "top" : "follow")
  });
  const migratedSeed = normalizeViewFraming({
    ...staff,
    ...(staff.camera === undefined ? {} : { camera: normalizeCamera(staff.camera) }),
    layout: legacyLayout
  });
  const legacySeed =
    raw.version === 1 ? normalizeViewFraming(raw.legacySeed, migratedSeed) : migratedSeed;
  const oldActive =
    raw.version === 1
      ? record(raw.active)
      : {
          keyboardStyle: staff.keyStyle,
          notesProjection: legacyAxes.notesProjection,
          keyboardOrientation: legacyAxes.keyboardOrientation
        };
  const active = normalizeViewAxes(oldActive, legacyAxes);
  const entries = { ...record(raw.entries) };
  const key = viewProfileKey(active);
  if (oldActive.keyboardStyle === "perspective" && entries[key] === undefined) {
    const oldKey = `perspective:${active.notesProjection}:${orientation(oldActive.keyboardOrientation)}`;
    if (entries[oldKey] !== undefined) entries[key] = entries[oldKey];
  }
  entries[key] = normalizeViewFraming(entries[key], legacySeed);
  return {
    version: 1,
    active,
    legacySeed,
    entries,
    projectionByStyle: {
      ...record(raw.projectionByStyle),
      [active.keyboardStyle]: active.notesProjection
    },
    orientationByPair: {
      ...record(raw.orientationByPair),
      [pairKey(active)]: active.keyboardOrientation
    }
  };
}
export const activeViewFraming = (profiles: ViewProfiles): ViewFraming =>
  normalizeViewFraming(profiles.entries[viewProfileKey(profiles.active)], profiles.legacySeed);

export function saveViewFraming(profiles: ViewProfiles, framing: ViewFraming): ViewProfiles {
  return {
    ...profiles,
    entries: {
      ...profiles.entries,
      [viewProfileKey(profiles.active)]: normalizeViewFraming(framing, profiles.legacySeed)
    }
  };
}

/** Snapshot and restore are one pure transition; no intermediate view can be persisted. */
export function selectViewProfile(
  profiles: ViewProfiles,
  current: ViewFraming,
  selection: Partial<ViewAxes>
): { profiles: ViewProfiles; framing: ViewFraming } {
  const saved = saveViewFraming(profiles, current);
  const keyboardStyle = selection.keyboardStyle ?? profiles.active.keyboardStyle;
  const notesProjection =
    selection.notesProjection ??
    (keyboardStyle === profiles.active.keyboardStyle
      ? profiles.active.notesProjection
      : projection(profiles.projectionByStyle[keyboardStyle], profiles.active.notesProjection));
  const pair = { keyboardStyle, notesProjection };
  const projectionOnly =
    keyboardStyle === profiles.active.keyboardStyle &&
    selection.notesProjection !== undefined &&
    selection.keyboardOrientation === undefined;
  const active = normalizeViewAxes({
    ...pair,
    keyboardOrientation:
      selection.keyboardOrientation ??
      (projectionOnly
        ? profiles.active.keyboardOrientation
        : (profiles.orientationByPair[pairKey(pair)] ?? "follow"))
  });
  const next = {
    ...saved,
    active,
    projectionByStyle: { ...saved.projectionByStyle, [keyboardStyle]: active.notesProjection },
    orientationByPair: {
      ...saved.orientationByPair,
      [pairKey(active)]: active.keyboardOrientation
    }
  };
  const restored = activeViewFraming(next);
  // Projection changes only the notes: even staff/lane heights can move the keyboard's viewport.
  const framing = projectionOnly
    ? { ...restored, camera: current.camera, layout: current.layout }
    : restored;
  return { profiles: saveViewFraming(next, framing), framing };
}

/** Explicit camera controls take precedence over the optional top keyboard override. */
export function editViewCamera(
  profiles: ViewProfiles,
  current: ViewFraming,
  camera: CameraPrefs
): { profiles: ViewProfiles; framing: ViewFraming } {
  const selected = selectViewProfile(
    profiles,
    current,
    profiles.active.keyboardStyle === "3d" ? { keyboardOrientation: "follow" } : {}
  );
  const framing = normalizeViewFraming({ ...current, camera }, profiles.legacySeed);
  return { profiles: saveViewFraming(selected.profiles, framing), framing };
}
