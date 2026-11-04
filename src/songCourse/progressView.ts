import { quartersAt, type Song } from "../song/song";

/** The caller passes the existing session time, including its wait/pause freezes. */
export function songCourseProgressRatio(
  song: Song,
  time: number,
  from = 0,
  to = song.duration
): number {
  if (!Number.isFinite(time) || to <= from) return 0;
  const start = quartersAt(song, from),
    end = quartersAt(song, to);
  if (end <= start) return 0;
  return Math.max(0, Math.min(1, (quartersAt(song, time) - start) / (end - start)));
}

/** Never pad a partial ending with copies of the same note. */
export function songCourseNoteWindow<T>(
  expected: readonly T[],
  activeIndex: number,
  count = 4
): readonly T[] {
  return expected.slice(
    Math.max(0, Math.floor(activeIndex)),
    Math.max(0, Math.floor(activeIndex)) + Math.max(0, Math.floor(count))
  );
}

export interface SongCourseStaffAnchor {
  readonly beat: number;
  readonly x: number;
}

/** Interpolates engraved positions; it does not engrave, render, or advance a clock. */
export function songCourseStaffOffset(
  anchors: readonly SongCourseStaffAnchor[],
  beat: number,
  playheadX: number
): number {
  const first = anchors[0];
  if (!first) return 0;
  if (beat <= first.beat) return playheadX - first.x;
  let before = first;
  for (let index = 1; index < anchors.length; index++) {
    const after = anchors[index];
    if (!after) continue;
    if (beat <= after.beat) {
      const fraction =
        after.beat === before.beat ? 0 : (beat - before.beat) / (after.beat - before.beat);
      return playheadX - (before.x + (after.x - before.x) * fraction);
    }
    before = after;
  }
  return playheadX - before.x;
}
