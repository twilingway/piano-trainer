import { Midi } from "@tonejs/midi";
import type { Track } from "@tonejs/midi";

import { songParts, trackRoles } from "./midiParts";
import type { TrackStats } from "./midiParts";
import { handByPitch, sortNotes } from "./song";
import type { Song, SongBeat, SongMeasure, SongNote } from "./song";

/**
 * A MIDI file carries no hands. With two or more melodic tracks each track is
 * a part whose role (melody, second voice, accompaniment, bass) gives its hand;
 * a single track is split at middle C.
 *
 * The title is the file's: the name a MIDI carries is its first track's
 * ("Piano", "Track 1"), often in an encoding the file does not declare.
 */
export function songFromMidi(data: ArrayBuffer, title: string): Song {
  const midi = new Midi(data);
  const tracks = midi.tracks.filter(
    (track) => !track.instrument.percussion && track.notes.length > 0
  );

  const stats = tracks.map(trackStats);
  const parts = tracks.length >= 2 ? songParts(stats, trackRoles(stats)) : undefined;
  const partOf = new Map(parts?.map((part) => [part.id, part]));

  const notes: SongNote[] = [];
  tracks.forEach((track, trackIndex) => {
    const part = partOf.get(`p${String(trackIndex)}`);
    track.notes.forEach((note, noteIndex) => {
      notes.push({
        id: `t${String(trackIndex)}n${String(noteIndex)}`,
        pitch: note.midi,
        start: note.time,
        duration: note.duration,
        startBeat: note.ticks / midi.header.ppq,
        hand: part?.hand ?? handByPitch(note.midi),
        ...(part ? { part: part.id } : {})
      });
    });
  });

  sortNotes(notes);
  const duration = notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return {
    title,
    source: "midi",
    notes,
    beats: midiBeats(midi, duration),
    measures: midiMeasures(midi, duration),
    duration,
    ...(parts ? { parts } : {})
  };
}

function trackStats(track: Track): TrackStats {
  const starts = new Map<number, number>();
  for (const note of track.notes) starts.set(note.ticks, (starts.get(note.ticks) ?? 0) + 1);
  const pitches = track.notes.reduce((sum, note) => sum + note.midi, 0);
  return {
    onsets: starts.size,
    chordOnsets: [...starts.values()].filter((count) => count > 1).length,
    meanPitch: pitches / Math.max(track.notes.length, 1)
  };
}

/** One click per beat of the file's time signatures (4/4 when it names none). */
function midiBeats(midi: Midi, duration: number): SongBeat[] {
  const header = midi.header;
  const signatures =
    header.timeSignatures.length > 0
      ? [...header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
      : [{ ticks: 0, timeSignature: [4, 4] }];
  const endTicks = header.secondsToTicks(duration);
  const beats: SongBeat[] = [];
  signatures.forEach((signature, index) => {
    const [perMeasure = 4, beatType = 4] = signature.timeSignature;
    const unit = (header.ppq * 4) / beatType;
    const until = signatures[index + 1]?.ticks ?? endTicks;
    for (let count = 0; signature.ticks + count * unit < until; count++) {
      beats.push({
        time: header.ticksToSeconds(signature.ticks + count * unit),
        position: (signature.ticks + count * unit) / header.ppq,
        downbeat: count % perMeasure === 0
      });
    }
  });
  return beats;
}

/** Measures from the file's time signatures, in quarter notes, 4/4 when it names none. */
function midiMeasures(midi: Midi, duration: number): SongMeasure[] {
  const header = midi.header;
  const signatures =
    header.timeSignatures.length > 0
      ? [...header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
      : [{ ticks: 0, timeSignature: [4, 4] }];
  const end = header.secondsToTicks(duration) / header.ppq;
  const measures: SongMeasure[] = [];
  signatures.forEach((signature, index) => {
    const [beats = 4, beatType = 4] = signature.timeSignature;
    const length = (beats * 4) / beatType;
    const until = (signatures[index + 1]?.ticks ?? Number.POSITIVE_INFINITY) / header.ppq;
    for (let start = signature.ticks / header.ppq; start < Math.min(until, end); start += length) {
      measures.push({ start, length, beats, beatType });
    }
  });
  return measures;
}
