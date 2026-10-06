import { DIVISIONS, headKey, measuresUntil, writeScore } from "./scoreWriter";
import type { WrittenNote } from "./scoreWriter";
import { ROLE_ORDER } from "./midiParts";
import { quartersAt, secondsAt, sortNotes } from "./song";
import type { Song, SongNote } from "./song";

/*
 * A MIDI file has no score: one is written from its notes. Starts and ends are
 * rounded to sixteenths, a short gap before the next start is closed, each hand
 * is one voice on its staff. The song's notes keep their MIDI timing; the score
 * only shows them, and each note points at its written head. `writtenNotes`
 * puts the notes themselves where the score has them, when the player asks.
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
  const closed = placeNotes(song, endBeats);
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

/**
 * The song's notes as its score writes them: on the grid of sixteenths, one
 * note of a pitch at each start of a hand, a chord lasting as its longest note
 * but not past the hand's next start. Of doubled notes the one of the higher
 * part role stays. Seconds follow the song's beats; the score is not rewritten.
 */
export function writtenNotes(song: Song): Song {
  if (song.source !== "midi") return song;
  const endBeats = new Map(
    song.notes.map((note) => [note.id, quartersAt(song, note.start + note.duration)])
  );
  const places = placeNotes(song, endBeats);
  const roleRank = new Map(
    (song.parts ?? []).map((part) => [part.id, ROLE_ORDER.indexOf(part.role)])
  );
  const rank = (note: SongNote) =>
    (note.part === undefined ? undefined : roleRank.get(note.part)) ?? ROLE_ORDER.length;

  const chords = new Map<string, number[]>();
  places.forEach((place, index) => {
    const key = `${String(place.staff)}:${String(place.start)}`;
    const chord = chords.get(key);
    if (chord) chord.push(index);
    else chords.set(key, [index]);
  });
  const onsets = new Map<1 | 2, number[]>();
  for (const staff of [1, 2] as const) {
    onsets.set(
      staff,
      [
        ...new Set(places.filter((place) => place.staff === staff).map((place) => place.start))
      ].sort((a, b) => a - b)
    );
  }

  const notes: SongNote[] = [];
  for (const indices of chords.values()) {
    const first = places[indices[0] ?? 0];
    if (!first) continue;
    const next = onsets.get(first.staff)?.find((start) => start > first.start) ?? Infinity;
    const end = Math.min(Math.max(...indices.map((index) => places[index]?.end ?? 0)), next);
    const byPitch = new Map<number, SongNote>();
    for (const index of indices) {
      const note = song.notes[index];
      if (!note) continue;
      const kept = byPitch.get(note.pitch);
      if (!kept || rank(note) < rank(kept)) byPitch.set(note.pitch, note);
    }
    const start = secondsAt(song, first.start / DIVISIONS);
    const duration = secondsAt(song, end / DIVISIONS) - start;
    for (const note of byPitch.values()) {
      notes.push({ ...note, start, duration, startBeat: first.start / DIVISIONS });
    }
  }

  sortNotes(notes);
  const duration = notes.reduce((last, note) => Math.max(last, note.start + note.duration), 0);
  return { ...song, notes, duration, asWritten: true };
}

/** Each note's place on the grid of sixteenths, by index, as the score writes it. */
function placeNotes(song: Song, endBeats: ReadonlyMap<string, number>): WrittenNote[] {
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
  return closeGaps(written);
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
