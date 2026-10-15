import type { Song, SongBeat } from "../song/song";
import type { PracticeOptions } from "./practiceTypes";

export function sessionLeadIn(song: Song, options: PracticeOptions, fallback: number): number {
  const beatSeconds =
    song.beats[1] && song.beats[0] ? song.beats[1].time - song.beats[0].time : 0.5;
  return options.hands.size > 0
    ? options.countInBeats === undefined
      ? fallback
      : options.countInBeats * beatSeconds
    : 0;
}

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

/** Clicks at the song's opening beat interval, filling the lead-in before time 0. */
export function countIn(beats: readonly SongBeat[], leadIn = 2, accent = false): SongBeat[] {
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) return [];
  const interval = second.time - first.time;
  const step = second.position - first.position;
  if (interval <= 0) return [];
  const clicks: SongBeat[] = [];
  for (let count = 1; first.time - count * interval >= -leadIn - 1e-9; count++) {
    clicks.unshift({
      time: first.time - count * interval,
      position: first.position - count * step,
      downbeat: accent && (count * step) % 4 === 0
    });
  }
  return clicks;
}
