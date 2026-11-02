import type { Hand } from "../../fingering/fingering";
import type { SongNote } from "../../song/song";
import { KEYBOARD88_REPEAT_GAP_SECONDS } from "./keyboard88Motion";

type Note = Pick<SongNote, "pitch" | "start" | "duration" | "sourceFinger">;
export type NativeContactNotes = Readonly<Record<Hand, readonly Note[]>>;
interface Window {
  start: number;
  end: number;
}

/** Source physical holds and explicitly separate unknown MIDI holds; no acoustic tails or solver. */
export class NativeKeyContacts {
  private left: readonly Note[] | undefined;
  private right: readonly Note[] | undefined;
  private readonly byPitch = new Map<number, Window[]>();

  /** HandsLayer exposes immutable hand arrays. Rebuild only when either array changes. */
  setNotes(notes: NativeContactNotes | undefined): boolean {
    if (notes?.left === this.left && notes?.right === this.right) return false;
    this.left = notes?.left;
    this.right = notes?.right;
    this.byPitch.clear();
    for (const hand of [this.left, this.right]) {
      for (const note of hand ?? []) {
        const source = note.sourceFinger;
        const contact =
          source?.finger != null &&
          Number.isFinite(source.onset) &&
          typeof source.estimatedContactEnd === "number" &&
          Number.isFinite(source.estimatedContactEnd) &&
          source.estimatedContactEnd >= source.onset;
        const start = contact ? source.onset : note.start;
        const end = contact ? source.estimatedContactEnd : note.start + note.duration;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        let windows = this.byPitch.get(note.pitch);
        if (!windows) this.byPitch.set(note.pitch, (windows = []));
        windows.push({ start, end });
      }
    }
    for (const windows of this.byPitch.values()) {
      windows.sort((a, b) => a.start - b.start);
      let count = 0;
      for (const window of windows) {
        const previous = windows[count - 1];
        // A key cannot be struck again while down: a following repeat lifts it first.
        if (previous && window.start > previous.start)
          previous.end = Math.min(
            previous.end,
            window.start -
              Math.min(KEYBOARD88_REPEAT_GAP_SECONDS, (window.start - previous.start) / 2)
          );
        else if (previous && window.start <= previous.end) {
          previous.end = Math.max(previous.end, window.end);
          continue;
        }
        windows[count++] = window;
      }
      windows.length = count;
    }
    return true;
  }

  has(pitch: number): boolean {
    return this.byPitch.has(pitch);
  }

  down(pitch: number, time: number): boolean {
    if (!Number.isFinite(time)) return false;
    const windows = this.byPitch.get(pitch);
    if (!windows) return false;
    let low = 0,
      high = windows.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((windows[middle]?.start ?? Infinity) <= time) low = middle + 1;
      else high = middle;
    }
    return time < (windows[low - 1]?.end ?? -Infinity);
  }
}
