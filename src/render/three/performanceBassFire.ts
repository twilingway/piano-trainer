/** Left-hand notes this close together start one onset: a rolled or slightly loose chord. */
const ONSET_SECONDS = 0.04;
/** A burst flares at once and dies out over this many song seconds. */
export const BASS_FIRE_SECONDS = 0.7;

export interface BassOnset {
  readonly time: number;
  readonly pitch: number;
}

/** The lowest note of each left-hand onset, in song order: the bass the stage flares on. */
export function performanceBassOnsets(
  left: readonly { readonly start: number; readonly pitch: number }[]
): BassOnset[] {
  const notes = left
    .filter((note) => Number.isFinite(note.start))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const onsets: BassOnset[] = [];
  let groupStart = -Infinity;
  for (const note of notes) {
    const last = onsets.at(-1);
    if (last && note.start - groupStart < ONSET_SECONDS) {
      if (note.pitch < last.pitch)
        onsets[onsets.length - 1] = { time: last.time, pitch: note.pitch };
      continue;
    }
    groupStart = note.start;
    onsets.push({ time: note.start, pitch: note.pitch });
  }
  return onsets;
}

/** The latest bass burst's strength at a song time, 1 at its onset and 0 once it has died out. */
export function bassFireStrength(time: number, onsets: readonly BassOnset[]): number {
  if (!Number.isFinite(time)) return 0;
  let low = 0,
    high = onsets.length;
  // The first onset after `time`; the one before it is the burst still burning.
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((onsets[middle]?.time ?? Infinity) <= time) low = middle + 1;
    else high = middle;
  }
  const onset = onsets[low - 1];
  if (!onset) return 0;
  const left = 1 - (time - onset.time) / BASS_FIRE_SECONDS;
  return left > 0 ? left * left : 0;
}
