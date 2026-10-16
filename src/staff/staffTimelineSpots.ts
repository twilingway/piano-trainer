import type { BeatSpot } from "./liveCursor";

export interface StaffTimeAxis {
  readonly originX: number;
  readonly pixelsPerSecond: number;
  readonly timeAtBeat: (beat: number) => number;
}

/** Include tempo boundaries so the existing beat interpolator stays linear in seconds. */
export function timelineSpots(
  axis: StaffTimeAxis,
  entries: readonly BeatSpot[],
  timingBeats: readonly number[],
  startBeat: number,
  endBeat: number,
  line: number
): BeatSpot[] {
  const beats = new Set([
    startBeat,
    endBeat,
    ...timingBeats,
    ...entries.map((entry) => entry.beat)
  ]);
  return [...beats]
    .filter((beat) => Number.isFinite(beat) && beat >= startBeat && beat <= endBeat)
    .sort((a, b) => a - b)
    .map((beat) => ({
      beat,
      x: axis.originX + axis.pixelsPerSecond * axis.timeAtBeat(beat),
      line
    }));
}
