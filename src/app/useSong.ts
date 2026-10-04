import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

import type { Finger } from "../fingering/fingering";
import { detectKey } from "../song/harmony";
import { songFromMusicXml, transposeMusicXml } from "../song/musicxml";
import { withFingering } from "../song/song";
import type { Song } from "../song/song";
import { FIRST_LESSON, LESSONS, lessonSong } from "./lessons";
import type { LessonChoice } from "./lessons";
import { loadPlayerPrefs, savePlayerPrefs } from "./playerPrefs";

/** The lesson opened last, if it is still there; otherwise the first one. */
function startingLesson(): LessonChoice {
  const kept = loadPlayerPrefs().lesson;
  const exercise = kept && LESSONS.find((item) => item.id === kept.exerciseId);
  return kept && exercise?.levels.some((level) => level.id === kept.levelId) ? kept : FIRST_LESSON;
}

function overridesKey(song: Song): string {
  return `fingering:${song.title}:${String(song.notes.length)}`;
}

export function loadOverrides(song: Song): Map<string, Finger> {
  try {
    const raw = localStorage.getItem(overridesKey(song));
    return new Map(raw ? (JSON.parse(raw) as [string, Finger][]) : []);
  } catch {
    return new Map();
  }
}

function saveOverrides(song: Song, overrides: ReadonlyMap<string, Finger>): void {
  try {
    localStorage.setItem(overridesKey(song), JSON.stringify([...overrides]));
  } catch {
    // Private mode or a full quota: corrections just don't survive a reload.
  }
}

/**
 * The song moved by `semitones`. A score is respelled and re-read, so its
 * staff, fingering and names all follow; a MIDI song just shifts its keys.
 */
function transposeSong(song: Song, semitones: number): Song {
  if (semitones === 0) return song;
  const sign = semitones > 0 ? "+" : "−";
  const title = `${song.title} (${sign}${String(Math.abs(semitones))})`;
  if (song.musicXml) {
    return { ...songFromMusicXml(transposeMusicXml(song.musicXml, semitones), title), title };
  }
  return {
    ...song,
    title,
    notes: song.notes.map((note) => {
      const { finger, transition, scoreFinger, ...rest } = note;
      return { ...rest, pitch: note.pitch + semitones };
    })
  };
}

/**
 * The song on screen: where it came from, its key and the player's finger
 * corrections. `startFromRef` is cleared whenever another song comes up.
 */
export function useSong(startFromRef: RefObject<number | null>) {
  const [lesson, setLesson] = useState<LessonChoice | null>(startingLesson);
  /** The library song on screen, as the lesson select names it: `my:<id>` or `dir:<path>`. */
  const [librarySource, setLibrarySource] = useState<string | null>(null);
  /** The song as loaded; `baseSong` is it in the chosen key. */
  const [sourceSong, setSourceSong] = useState<Song>(() => lessonSong(startingLesson()));
  const [transpose, setTranspose] = useState(0);
  const baseSong = useMemo(() => transposeSong(sourceSong, transpose), [sourceSong, transpose]);
  const sourceKey = useMemo(() => detectKey(sourceSong), [sourceSong]);
  const [overrides, setOverrides] = useState<Map<string, Finger>>(() => loadOverrides(baseSong));
  // Corrections belong to a song in a key: another key starts from its own.
  const [overridesOf, setOverridesOf] = useState(() => overridesKey(baseSong));
  if (overridesOf !== overridesKey(baseSong)) {
    setOverridesOf(overridesKey(baseSong));
    setOverrides(loadOverrides(baseSong));
  }
  const song = useMemo(() => withFingering(baseSong, overrides), [baseSong, overrides]);
  // What is on screen comes back next time: a lesson by its level, a library song by its source.
  useEffect(() => {
    savePlayerPrefs(lesson ? { lesson, librarySource: null } : { librarySource });
  }, [lesson, librarySource]);
  // Each song and level keeps its own takes and trainer state under this key.
  const songKey = overridesKey(baseSong);

  const resetFingers = () => {
    const cleared = new Map<string, Finger>();
    saveOverrides(baseSong, cleared);
    setOverrides(cleared);
  };

  const cycleFinger = (noteId: string) => {
    const current = song.notes.find((note) => note.id === noteId)?.finger ?? 1;
    const next = ((current % 5) + 1) as Finger;
    const updated = new Map(overrides).set(noteId, next);
    saveOverrides(baseSong, updated);
    setOverrides(updated);
  };

  /** Puts a song read from a file on screen: a new song, not a lesson level. */
  const showSong = (loaded: Song, source: string | null) => {
    setLesson(null);
    setLibrarySource(source);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
  };

  const openLesson = (choice: LessonChoice) => {
    const loaded = lessonSong(choice);
    setLesson(choice);
    setLibrarySource(null);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
    setOverrides(loadOverrides(loaded));
  };

  return {
    lesson,
    librarySource,
    setLibrarySource,
    sourceKey,
    transpose,
    setTranspose,
    baseSong,
    song,
    songKey,
    overrides,
    resetFingers,
    cycleFinger,
    showSong,
    openLesson
  };
}
