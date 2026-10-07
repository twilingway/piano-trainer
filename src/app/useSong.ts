import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, usePreferenceState } from "./storeHooks";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Finger } from "../fingering/fingering";
import { simplifiedSong } from "../song/arrangement";
import { detectKey } from "../song/harmony";
import { fifthsForKey } from "../song/keySignature";
import type { Key } from "../song/keySignature";
import { writtenNotes } from "../song/midiScore";
import { songFromMusicXml, transposeMusicXml } from "../song/musicxml";
import { withFingering } from "../song/song";
import type { Song } from "../song/song";
import { FIRST_LESSON, LESSONS, lessonSong } from "./lessons";
import type { LessonChoice } from "./lessons";
import { loadPlayerPrefs } from "./playerPrefs";

/** The lesson opened last, if it is still there; otherwise the first one. */
function startingLesson(): LessonChoice {
  const kept = loadPlayerPrefs().lesson;
  const exercise = kept && LESSONS.find((item) => item.id === kept.exerciseId);
  return kept && exercise?.levels.some((level) => level.id === kept.levelId) ? kept : FIRST_LESSON;
}

function overridesKey(song: Song): string {
  const version = (song.simplified ? ":simplified" : "") + (song.asWritten ? ":written" : "");
  return `fingering:${song.title}${version}:${String(song.notes.length)}`;
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
 * staff, fingering and names all follow; a MIDI song shifts its keys, and
 * the score written for it is respelled alongside.
 */
function transposeSong(song: Song, semitones: number, sourceKey: Key | undefined): Song {
  if (semitones === 0) return song;
  const sign = semitones > 0 ? "+" : "−";
  const title = `${song.title} (${sign}${String(Math.abs(semitones))})`;
  const xml =
    song.musicXml &&
    transposeMusicXml(song.musicXml, semitones, sourceKey ? fifthsForKey(sourceKey) : 0);
  if (xml && song.source === "musicxml") return { ...songFromMusicXml(xml, title), title };
  // A MIDI song keeps its own notes; its written score moves with them, note for note.
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
  /** Whole octaves on top of the key, to fit the player's keyboard; the key list keeps its name. */
  const [octave, setOctave] = useState(0);
  /** A MIDI song's simpler version, the default; the full one is the song's own choice. */
  const [simplified, setSimplified] = useState(true);
  const arranged = useMemo(
    () => (simplified ? simplifiedSong(sourceSong) : sourceSong),
    [simplified, sourceSong]
  );
  /** A MIDI song's notes as its staff has them; a preference, not the song's. */
  const [asWritten, setAsWritten] = usePreferenceState(
    (state) => state.preferences.player.notesAsWritten,
    (notesAsWritten: boolean) => preferencesActions.playerChanged({ notesAsWritten })
  );
  const written = useMemo(
    () => (asWritten ? writtenNotes(arranged) : arranged),
    [asWritten, arranged]
  );
  const sourceKey = useMemo(() => detectKey(sourceSong), [sourceSong]);
  const baseSong = useMemo(
    () => transposeSong(written, transpose + octave * 12, sourceKey),
    [written, transpose, octave, sourceKey]
  );
  const [overrides, setOverrides] = useState<Map<string, Finger>>(() => loadOverrides(baseSong));
  // Corrections belong to a song in a key: another key starts from its own.
  const [overridesOf, setOverridesOf] = useState(() => overridesKey(baseSong));
  if (overridesOf !== overridesKey(baseSong)) {
    setOverridesOf(overridesKey(baseSong));
    setOverrides(loadOverrides(baseSong));
  }
  const song = useMemo(() => withFingering(baseSong, overrides), [baseSong, overrides]);
  // What is on screen comes back next time: a lesson by its level, a library song by its source.
  const dispatch = useAppDispatch();
  const previousSelection = useRef({ lesson, librarySource });
  useEffect(() => {
    if (
      previousSelection.current.lesson === lesson &&
      previousSelection.current.librarySource === librarySource
    )
      return;
    previousSelection.current = { lesson, librarySource };
    dispatch(
      preferencesActions.playerChanged(lesson ? { lesson, librarySource: null } : { librarySource })
    );
  }, [dispatch, lesson, librarySource]);
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
    setOctave(0);
    setSimplified(true);
  };

  const openLesson = (choice: LessonChoice) => {
    const loaded = lessonSong(choice);
    setLesson(choice);
    setLibrarySource(null);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
    setOctave(0);
    setSimplified(true);
    setOverrides(loadOverrides(loaded));
  };

  return {
    lesson,
    librarySource,
    setLibrarySource,
    sourceKey,
    transpose,
    setTranspose,
    octave,
    setOctave,
    /** The version choice of a MIDI song and whether its notes follow the staff; none for a score. */
    arrangement:
      sourceSong.source === "midi"
        ? {
            simplified,
            onSimplified: setSimplified,
            asWritten,
            onAsWritten: (on: boolean) => {
              setAsWritten(on);
            }
          }
        : undefined,
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
