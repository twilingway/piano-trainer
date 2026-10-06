import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { songFromMidi } from "./midi";

/** A MIDI file from tracks of [pitches starting together, start in quarters, length in quarters]. */
function midiFile(
  tracks: readonly (readonly (readonly [readonly number[], number, number])[])[]
): ArrayBuffer {
  const midi = new Midi();
  for (const notes of tracks) {
    const track = midi.addTrack();
    for (const [pitches, start, length] of notes) {
      for (const pitch of pitches) {
        track.addNote({ midi: pitch, ticks: start * midi.header.ppq, durationTicks: length * 480 });
      }
    }
  }
  const data = midi.toArray();
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

const melody = [50, 52, 55, 57, 55, 52, 50, 48].map(
  (pitch, index) => [[pitch], index * 0.5, 0.5] as const
);
const chords = [0, 2].map((start) => [[55, 59, 62], start, 2] as const);
const bass = [[[43], 0, 4]] as const;

describe("songFromMidi", () => {
  it("gives a melody that lies below the chords to the right hand", () => {
    const song = songFromMidi(midiFile([chords, melody, bass]), "Pirates");
    const handOf = (pitch: number, start: number) =>
      song.notes.find((note) => note.pitch === pitch && Math.abs(note.startBeat - start) < 1e-9)
        ?.hand;
    expect(handOf(50, 0)).toBe("right");
    expect(handOf(59, 0)).toBe("left");
    expect(handOf(43, 0)).toBe("left");
    expect(song.parts?.map((part) => part.title)).toEqual(["Мелодия", "Аккомпанемент", "Бас"]);
    const melodyPart = song.parts?.[0]?.id;
    expect(song.notes.filter((note) => note.part === melodyPart)).toHaveLength(8);
  });

  it("splits a single track at middle C and gives it no parts", () => {
    const song = songFromMidi(
      midiFile([
        [
          [[48], 0, 1],
          [[64], 0, 1]
        ]
      ]),
      "One"
    );
    expect(song.parts).toBeUndefined();
    expect(song.notes.map((note) => [note.pitch, note.hand, note.part])).toEqual([
      [48, "left", undefined],
      [64, "right", undefined]
    ]);
  });
});
