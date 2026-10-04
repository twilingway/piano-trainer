import type { Song, SongNote } from "../song/song";
import type { Part } from "./types";

export function extractLine(
  song: Song,
  part: Part
): {
  song: Song;
  notes: readonly SongNote[];
  discardedNotes: number;
} {
  const hand = part === "melody" ? "right" : "left";
  const candidates = song.notes
    .filter((note) => note.hand === hand)
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const selected: SongNote[] = [];
  for (let index = 0; index < candidates.length;) {
    const first = candidates[index];
    if (!first) break;
    let chosen = first;
    let end = index + 1;
    while (end < candidates.length) {
      const next = candidates[end];
      if (!next || Math.abs(next.start - first.start) > 1e-6) break;
      if (part === "melody" ? next.pitch > chosen.pitch : next.pitch < chosen.pitch) chosen = next;
      end++;
    }
    selected.push({ ...chosen, start: first.start, hand: "right" });
    index = end;
  }
  const notes = selected.map((note, index) => ({
    ...note,
    duration: Math.max(
      0,
      Math.min(note.duration, (selected[index + 1]?.start ?? Infinity) - note.start)
    )
  }));
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return {
    song: { ...song, notes, duration },
    notes,
    discardedNotes: candidates.length - notes.length
  };
}
