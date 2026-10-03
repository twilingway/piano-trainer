import type { SongNote } from "../song/song";

/** Mark adjoining repetitions once when loading the time-sorted song. */
export function repeatedNoteEnds(notes: readonly SongNote[]): ReadonlySet<string> {
  const repeated = new Set<string>();
  const previous = new Map<number, SongNote>();
  for (const note of notes) {
    const before = previous.get(note.pitch);
    if (before && Math.abs(note.start - before.start - before.duration) <= 0.03)
      repeated.add(before.id);
    previous.set(note.pitch, note);
  }
  return repeated;
}

/** Convert a small screen-space gap to lane units without erasing short blocks. */
export function repeatGap(height: number, keyWidth: number, screenSlope = 1, scale = 1): number {
  if (!(height > 0)) return 0;
  const pixels = Math.max(3, keyWidth * 0.25 * scale);
  return Math.min(height * 0.25, pixels / Math.max(0.01, Math.abs(screenSlope)));
}
