import { Midi } from "@tonejs/midi";

import { handByPitch } from "../song/song";
import type { Song, SongNote } from "../song/song";
import type { TakeReview } from "./compare";
import type { Take } from "./take";

/** Shortest a played note is drawn and sounded: a take from wait mode can hold keys for no song time at all. */
const MIN_NOTE_S = 0.08;

/** The score's beat at a song time, between the notes around it. */
function beatAtTime(song: Song, time: number): number {
  const notes = song.notes;
  let before: SongNote | undefined;
  let after: SongNote | undefined;
  for (const note of notes) {
    if (note.start <= time) before = note;
    else {
      after = note;
      break;
    }
  }
  if (!before) return 0;
  if (!after || after.start === before.start) return before.startBeat;
  const share = (time - before.start) / (after.start - before.start);
  return before.startBeat + share * (after.startBeat - before.startBeat);
}

/**
 * A take as a song the trainer can play: every key where and how long it was
 * held on the score's timeline, with the velocity it was struck with, so it
 * falls and sounds in step with the original on the other screen.
 */
export function takeAsSong(take: Take, original: Song, review: TakeReview): Song {
  const handOf = new Map(
    review.notes.flatMap((item) => (item.played ? [[item.played, item.note.hand] as const] : []))
  );
  const notes: SongNote[] = take.notes.map((played, index) => ({
    id: `take${String(index)}`,
    pitch: played.pitch,
    start: played.start,
    duration: Math.max(played.end - played.start, MIN_NOTE_S),
    startBeat: beatAtTime(original, played.start),
    hand: handOf.get(played) ?? handByPitch(played.pitch),
    velocity: played.velocity
  }));
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return {
    title: original.title,
    source: "midi",
    notes,
    beats: original.beats,
    measures: original.measures,
    duration
  };
}

/** The take as a MIDI file, in real time as it was played, with velocities and the pedal. */
export function takeToMidi(take: Take, title: string): Uint8Array {
  const midi = new Midi();
  midi.header.name = title;
  const track = midi.addTrack();
  track.name = "Piano";
  for (const played of take.notes) {
    track.addNote({
      midi: played.pitch,
      time: played.realStart,
      duration: Math.max(played.realEnd - played.realStart, 0.01),
      velocity: played.velocity / 127
    });
  }
  for (const span of take.pedal) {
    track.addCC({ number: 64, value: 1, time: span.realStart });
    track.addCC({ number: 64, value: 0, time: span.realEnd });
  }
  return midi.toArray();
}
