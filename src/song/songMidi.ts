import { Midi } from "@tonejs/midi";

import type { Hand } from "../fingering/fingering";
import type { Song } from "./song";

/** Tempo of a song with no beat grid to read one from: the MusicXML reader's default. */
const FALLBACK_BPM = 120;
/** How hard a score note is struck: a score has no velocity of its own. */
const SCORE_VELOCITY = 80 / 127;

const TRACKS: readonly { readonly hand: Hand; readonly name: string; readonly channel: number }[] =
  [
    { hand: "right", name: "Right hand", channel: 0 },
    { hand: "left", name: "Left hand", channel: 1 }
  ];

/** Tempo changes read off the beat grid, one wherever the pace between beats changes. */
function tempoMap(song: Song, ppq: number): { ticks: number; bpm: number }[] {
  const tempos: { ticks: number; bpm: number }[] = [];
  for (let index = 0; index + 1 < song.beats.length; index += 1) {
    const from = song.beats[index];
    const to = song.beats[index + 1];
    if (!from || !to || to.time <= from.time) continue;
    const bpm =
      Math.round(((60 * (to.position - from.position)) / (to.time - from.time)) * 100) / 100;
    if (tempos.at(-1)?.bpm === bpm) continue;
    tempos.push({ ticks: tempos.length === 0 ? 0 : Math.round(from.position * ppq), bpm });
  }
  return tempos.length > 0 ? tempos : [{ ticks: 0, bpm: FALLBACK_BPM }];
}

/**
 * The song as a MIDI file: its notes at the score's tempo and time signature,
 * the right and left hand on tracks of their own. Ticks follow the score's
 * beats, so a sequencer's bar lines fall where the score's do.
 */
export function songToMidi(song: Song): Uint8Array {
  const midi = new Midi();
  // The writer keeps one byte per character: hand it the title's UTF-8 bytes.
  midi.header.name = String.fromCharCode(...new TextEncoder().encode(song.title));
  const ppq = midi.header.ppq;
  midi.header.tempos = tempoMap(song, ppq);
  for (const measure of song.measures) {
    const last = midi.header.timeSignatures.at(-1)?.timeSignature;
    if (last?.[0] === measure.beats && last[1] === measure.beatType) continue;
    midi.header.timeSignatures.push({
      ticks: midi.header.timeSignatures.length === 0 ? 0 : Math.round(measure.start * ppq),
      timeSignature: [measure.beats, measure.beatType]
    });
  }
  midi.header.update();
  for (const { hand, name, channel } of TRACKS) {
    const notes = song.notes.filter((note) => note.hand === hand);
    if (notes.length === 0) continue;
    const track = midi.addTrack();
    track.name = name;
    track.channel = channel;
    for (const note of notes) {
      track.addNote({
        midi: note.pitch,
        time: note.start,
        duration: note.duration,
        velocity: note.velocity === undefined ? SCORE_VELOCITY : note.velocity / 127
      });
    }
  }
  return midi.toArray();
}
