import { Midi } from "@tonejs/midi";

import type { Hand } from "../fingering/fingering";
import { handByPitch, sortNotes } from "./song";
import type { Song, SongNote } from "./song";

/**
 * A MIDI file carries no hands, so they are guessed: with two or more melodic
 * tracks the higher one is the right hand and the next the left (the usual
 * layout of a piano MIDI); a single track is split at middle C.
 */
export function songFromMidi(data: ArrayBuffer, fallbackTitle: string): Song {
  const midi = new Midi(data);
  const tracks = midi.tracks.filter(
    (track) => !track.instrument.percussion && track.notes.length > 0
  );

  const averagePitch = (index: number): number => {
    const notes = tracks[index]?.notes ?? [];
    return notes.reduce((sum, note) => sum + note.midi, 0) / Math.max(notes.length, 1);
  };
  const byHeight = tracks
    .map((_, index) => index)
    .sort((a, b) => averagePitch(b) - averagePitch(a));
  const trackHand = new Map<number, Hand>();
  if (tracks.length >= 2) {
    const [right, left] = byHeight;
    if (right !== undefined) trackHand.set(right, "right");
    if (left !== undefined) trackHand.set(left, "left");
  }

  const notes: SongNote[] = [];
  tracks.forEach((track, trackIndex) => {
    track.notes.forEach((note, noteIndex) => {
      notes.push({
        id: `t${String(trackIndex)}n${String(noteIndex)}`,
        pitch: note.midi,
        start: note.time,
        duration: note.duration,
        startBeat: note.ticks / midi.header.ppq,
        hand: trackHand.get(trackIndex) ?? handByPitch(note.midi)
      });
    });
  });

  sortNotes(notes);
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return { title: midi.name || fallbackTitle, source: "midi", notes, duration };
}
