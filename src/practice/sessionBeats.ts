import type { Song } from "../song/song";

/** Beat of the latest note that has started by `time`; notes are sorted by start. */
export function beatAt(song: Song, time: number): number {
  let low = 0;
  let high = song.notes.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const note = song.notes[middle];
    if (!note) break;
    if (note.start <= time) {
      found = note.startBeat;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
