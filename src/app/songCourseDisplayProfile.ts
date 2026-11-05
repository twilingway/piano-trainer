import type { StaffPrefs } from "./staffPreferences";

export interface SongCourseDisplayInput {
  readonly active: boolean;
  readonly compact: boolean;
  readonly preferred: StaffPrefs;
  readonly display: StaffPrefs;
  readonly learnerRange: readonly [number, number] | undefined;
}

export interface SongCourseDisplayProfile {
  readonly prefs: StaffPrefs;
  readonly displayRange: readonly [number, number] | undefined;
  readonly keyboardMaxHeightShare: number | undefined;
}

/** Course-only framing never changes the persisted preferences or the musical material. */
export function songCourseDisplayProfile({
  active,
  compact,
  preferred,
  display,
  learnerRange
}: SongCourseDisplayInput): SongCourseDisplayProfile {
  if (!active)
    return { prefs: display, displayRange: undefined, keyboardMaxHeightShare: undefined };
  return {
    prefs: {
      ...display,
      keyRange: compact ? "song" : preferred.keyRange === "song" ? "88" : preferred.keyRange,
      keyStyle: preferred.keyStyle
    },
    displayRange: compact ? learnerRange : undefined,
    keyboardMaxHeightShare: 0.3
  };
}
