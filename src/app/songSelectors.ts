import { createSelector } from "@reduxjs/toolkit";
import type { Finger } from "../fingering/fingering";
import { simplifiedSong } from "../song/arrangement";
import { detectKey } from "../song/harmony";
import { fifthsForKey, type Key } from "../song/keySignature";
import { writtenNotes } from "../song/midiScore";
import { songFromMusicXml, transposeMusicXml } from "../song/musicxml";
import { withFingering, type Song } from "../song/song";
import type { PreferencesState } from "./preferencesSlice";
import type { SongState } from "./songSlice";

export interface SongRoot {
  song: SongState;
  preferences: PreferencesState;
}
export function overridesKey(song: Song): string {
  const version = (song.simplified ? ":simplified" : "") + (song.asWritten ? ":written" : "");
  return `fingering:${song.title}${version}:${String(song.notes.length)}`;
}
export function transposeSong(song: Song, semitones: number, sourceKey: Key | undefined): Song {
  if (semitones === 0) return song;
  const sign = semitones > 0 ? "+" : "−";
  const title = `${song.title} (${sign}${String(Math.abs(semitones))})`;
  const xml =
    song.musicXml &&
    transposeMusicXml(song.musicXml, semitones, sourceKey ? fifthsForKey(sourceKey) : 0);
  if (xml && song.source === "musicxml") return { ...songFromMusicXml(xml, title), title };
  return {
    ...song,
    title,
    ...(xml ? { musicXml: xml } : {}),
    notes: song.notes.map((note) => {
      const { finger, transition, scoreFinger, ...rest } = note;
      return { ...rest, pitch: note.pitch + semitones };
    })
  };
}
export const selectSourceSong = (state: SongRoot) => state.song.sourceSong;
export const selectSourceKey = createSelector([selectSourceSong], detectKey);
const selectArranged = createSelector(
  [selectSourceSong, (state: SongRoot) => state.song.simplified],
  (song, simplified) => (simplified ? simplifiedSong(song) : song)
);
const selectWritten = createSelector(
  [selectArranged, (state: SongRoot) => state.preferences.player.notesAsWritten],
  (song, asWritten) => (asWritten ? writtenNotes(song) : song)
);
export const selectBaseSong = createSelector(
  [
    selectWritten,
    (state: SongRoot) => state.song.transpose,
    (state: SongRoot) => state.song.octave,
    selectSourceKey
  ],
  (song, transpose, octave, key) => transposeSong(song, transpose + octave * 12, key)
);
export const selectSongKey = createSelector([selectBaseSong], overridesKey);
const EMPTY_OVERRIDES: Readonly<Record<string, Finger>> = {};
const selectOverrideRecord = (state: SongRoot) =>
  state.song.overridesByKey[selectSongKey(state)] ?? EMPTY_OVERRIDES;
export const selectOverrides = createSelector(
  [selectOverrideRecord],
  (values) => new Map<string, Finger>(Object.entries(values))
);
export const selectSong = createSelector([selectBaseSong, selectOverrides], withFingering);
