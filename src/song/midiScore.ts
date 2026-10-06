import { DIVISIONS, headKey, measuresUntil, writeScore } from "./scoreWriter";
import type { WrittenNote } from "./scoreWriter";
import type { Song } from "./song";

/*
 * A MIDI file has no score: one is written from its notes. Starts and ends are
 * rounded to sixteenths, a short gap before the next start is closed, each hand
 * is one voice on its staff. The song's notes keep their MIDI timing; the score
 * only shows them, and each note points at its written head.
 */

/** A gap up to a third of the note before it is a release played early, not a rest. */
const LEGATO_GAP_SHARE = 1 / 3;

/**
 * Key names as @tonejs/midi reports a key signature, by its count of fifths
 * from −7: the name is the major key with that signature, whatever the mode.
 */
const SIGNATURE_KEYS = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#"
];

/** Fifths of a key signature as @tonejs/midi names it, or undefined for an unknown name. */
export function signatureFifths(key: string): number | undefined {
  const index = SIGNATURE_KEYS.indexOf(key);
  return index === -1 ? undefined : index - 7;
}

/**
 * The song with a score written from its notes. `endBeats` is each note's end
 * in quarters by id, read from the file's ticks; `fifths` is the key signature.
 */
export function withWrittenScore(
  song: Song,
  endBeats: ReadonlyMap<string, number>,
  fifths: number
): Song {
  const written = song.notes.map((note): WrittenNote => {
    const start = Math.round(note.startBeat * DIVISIONS);
    const endBeat = endBeats.get(note.id) ?? note.startBeat;
    return {
      pitch: note.pitch,
      start,
      end: Math.max(start + 1, Math.round(endBeat * DIVISIONS)),
      staff: note.hand === "right" ? 1 : 2
    };
  });
  const closed = closeGaps(written);
  const lastEnd = closed.reduce((end, note) => Math.max(end, note.end), 0);
  const { musicXml, heads } = writeScore(closed, {
    title: song.title,
    measures: measuresUntil(song.measures, lastEnd),
    fifths
  });
  const notes = song.notes.map((note, index) => {
    const place = closed[index];
    const sourceIndex = place && heads.get(headKey(place.staff, place.start, place.pitch));
    return sourceIndex === undefined ? note : { ...note, sourceIndex };
  });
  return { ...song, notes, musicXml };
}

/** Lets a note run on to the next start of its staff when the gap is a hurried release. */
function closeGaps(notes: readonly WrittenNote[]): WrittenNote[] {
  const onsets = new Map<1 | 2, number[]>();
  for (const staff of [1, 2] as const) {
    onsets.set(
      staff,
      [...new Set(notes.filter((note) => note.staff === staff).map((note) => note.start))].sort(
        (a, b) => a - b
      )
    );
  }
  return notes.map((note) => {
    const starts = onsets.get(note.staff) ?? [];
    const next = starts.find((start) => start > note.start);
    if (next === undefined) return note;
    const gap = next - note.end;
    return gap > 0 && gap <= (note.end - note.start) * LEGATO_GAP_SHARE
      ? { ...note, end: next }
      : note;
  });
}
