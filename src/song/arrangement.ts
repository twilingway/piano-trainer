import { withWrittenScore } from "./midiScore";
import type { PartRole } from "./midiParts";
import { quartersAt, sortNotes } from "./song";
import type { Song, SongNote } from "./song";

/*
 * A simpler version of a MIDI arrangement for two hands. The right hand keeps
 * the melody on top with at most two notes under it; the left keeps the bass
 * with at most two chord notes folded into the octave above it; an octave
 * doubling stays when the chord has room. A single line is left as it is. Each
 * hand is one voice: a note held into the hand's next start ends there. When
 * the melody keeps sounding under the left hand it moves up by octaves.
 */

/** Notes of a chord, the top or the bass included. */
const MAX_CHORD = 3;
/** Notes starting within this many quarters of each other are one chord. */
const SAME_START = 1 / 8;
/** Intervals over the bass a left-hand chord keeps first: thirds, the fifth, sevenths. */
const LEFT_PREFERENCE = [3, 4, 7, 10, 11, 8, 9, 2, 1, 5, 6];
/** The melody moves up at most this many octaves to clear the left hand. */
const MAX_LIFT = 2;
/** The melody moves up while more than this share of its notes start under the left hand's top key. */
const CROSSING_SHARE = 0.1;
/** Seconds a start may sit off another note's start or end and still count as at it. */
const SAME_TIME = 1e-3;
/** A grand piano's keys, A0 to C8: a note beyond them moves in by octaves. */
const LOWEST_KEY = 21;
const HIGHEST_KEY = 108;
/** Roles whose notes are the melody when the song has parts. */
const MELODY_ROLES: readonly PartRole[] = ["melody", "second"];

/** Notes starting together, by quantized start. */
function chords(notes: readonly SongNote[]): SongNote[][] {
  const groups = new Map<number, SongNote[]>();
  for (const note of notes) {
    const slot = Math.round(note.startBeat / SAME_START);
    const group = groups.get(slot);
    if (group) group.push(note);
    else groups.set(slot, [note]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

const pitchClass = (pitch: number) => ((pitch % 12) + 12) % 12;

/**
 * The right hand's chord: its top melody note and at most two others close
 * under it; the octave under the top when there is room left.
 */
function rightChord(group: readonly SongNote[], melodic: (note: SongNote) => boolean): SongNote[] {
  const melody = group.filter(melodic);
  const top = (melody.length > 0 ? melody : group).reduce((a, b) => (b.pitch > a.pitch ? b : a));
  const kept = [top];
  const under = group
    .filter((note) => note.pitch < top.pitch && top.pitch - note.pitch <= 12)
    .sort((a, b) => b.pitch - a.pitch);
  for (const note of under) {
    if (kept.length >= MAX_CHORD) break;
    if (kept.some((other) => pitchClass(other.pitch) === pitchClass(note.pitch))) continue;
    kept.push(note);
  }
  const octave = group.find((note) => note.pitch === top.pitch - 12);
  if (octave && kept.length < MAX_CHORD) kept.push(octave);
  return kept;
}

/**
 * The left hand's chord: the bass and at most two chord notes folded into the
 * octave above it; the bass's own octave when there is room left.
 */
function leftChord(group: readonly SongNote[]): SongNote[] {
  const bass = group.reduce((a, b) => (b.pitch < a.pitch ? b : a));
  const byInterval = new Map<number, SongNote>();
  for (const note of group) {
    const interval = pitchClass(note.pitch - bass.pitch);
    if (interval !== 0 && !byInterval.has(interval)) byInterval.set(interval, note);
  }
  const kept = [bass];
  for (const interval of LEFT_PREFERENCE) {
    const note = byInterval.get(interval);
    if (!note || kept.length >= MAX_CHORD) continue;
    kept.push({ ...note, pitch: bass.pitch + interval });
  }
  const octave = group.find((note) => note.pitch === bass.pitch + 12);
  if (octave && kept.length < MAX_CHORD) kept.push(octave);
  return kept;
}

/** One voice: every note ends by the hand's next start. */
function oneVoice(notes: readonly SongNote[]): SongNote[] {
  const starts = [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b);
  const after = (time: number): number | undefined => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((starts[middle] ?? Infinity) > time + 1e-6) high = middle;
      else low = middle + 1;
    }
    return starts[low];
  };
  return notes.map((note) => {
    const next = after(note.start);
    return next !== undefined && note.start + note.duration > next
      ? { ...note, duration: next - note.start }
      : note;
  });
}

function onKeyboard(note: SongNote): SongNote {
  let pitch = note.pitch;
  while (pitch > HIGHEST_KEY) pitch -= 12;
  while (pitch < LOWEST_KEY) pitch += 12;
  return pitch === note.pitch ? note : { ...note, pitch };
}

/** The highest left-hand key held when each right-hand note starts, or −∞ when none is. */
function leftAbove(right: readonly SongNote[], left: readonly SongNote[]): number[] {
  return right.map((note) =>
    left.reduce(
      (high, other) =>
        other.start <= note.start + SAME_TIME &&
        other.start + other.duration > note.start + SAME_TIME
          ? Math.max(high, other.pitch)
          : high,
      -Infinity
    )
  );
}

/**
 * The simpler version of a MIDI song, with its own written score. A song from
 * a score is returned as it is: its arrangement is the author's.
 */
export function simplifiedSong(song: Song): Song {
  if (song.source !== "midi") return song;
  const melodyParts = new Set(
    (song.parts ?? []).filter((part) => MELODY_ROLES.includes(part.role)).map((part) => part.id)
  );
  const melodic = (note: SongNote) =>
    melodyParts.size === 0 || (note.part !== undefined && melodyParts.has(note.part));

  let right = oneVoice(
    chords(song.notes.filter((note) => note.hand === "right")).flatMap((group) =>
      rightChord(group, melodic)
    )
  );
  const left = oneVoice(
    chords(song.notes.filter((note) => note.hand === "left")).flatMap(leftChord)
  );

  if (right.length > 0 && left.length > 0) {
    const under = leftAbove(right, left);
    const crossing = (lift: number) =>
      right.filter((note, index) => note.pitch + lift * 12 < (under[index] ?? -Infinity)).length /
      right.length;
    let lift = 0;
    while (lift < MAX_LIFT && crossing(lift) > CROSSING_SHARE) lift++;
    if (lift > 0) right = right.map((note) => ({ ...note, pitch: note.pitch + lift * 12 }));
  }

  const notes = sortNotes([...right, ...left].map(onKeyboard));
  const endBeats = new Map(
    notes.map((note) => [note.id, quartersAt(song, note.start + note.duration)])
  );
  const fifths = Number(/<fifths>(-?\d+)<\/fifths>/.exec(song.musicXml ?? "")?.[1] ?? 0);
  return withWrittenScore({ ...song, notes, simplified: true }, endBeats, fifths);
}
