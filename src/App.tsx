import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import {
  soundNoteOff,
  soundNoteOn,
  startPianoSound,
  startSoundOnFirstGesture
} from "./audio/pianoSound";
import type { Finger, Hand } from "./fingering/fingering";
import { listenToComputerKeyboard, listenToMidi, midiSupported } from "./input/midiInput";
import type { KeyEvent, MidiDevice, MidiEvent } from "./input/midiInput";
import { compareTake } from "./recording/compare";
import type { Grade, TakeReview } from "./recording/compare";
import { loadTakes, saveTake } from "./recording/history";
import { takeAsSong, takeToMidi } from "./recording/playback";
import type { Take } from "./recording/take";
import { transcribeTake } from "./recording/transcribe";
import type { TranscribedGrade } from "./recording/transcribe";
import type { PracticeMode, PracticeOptions } from "./practice/session";
import { Trainer } from "./practice/Trainer";
import type { TrainerSnapshot } from "./practice/Trainer";
import { FallingNotesView } from "./render/FallingNotesView";
import { EXERCISES } from "./song/exercises";
import { LOCAL_LESSONS } from "./song/localLessons";
import { folderPermission, foldersSupported, pickFolder, readFolderSongs } from "./library/folder";
import type { FolderSong } from "./library/folder";
import {
  listMySongs,
  loadFolderHandle,
  loadMySong,
  removeMySong,
  saveFolderHandle,
  saveMySong
} from "./library/myLibrary";
import type { MySong } from "./library/myLibrary";
import { songFromFileData } from "./library/songFile";
import type { LevelId } from "./song/exercises";
import {
  musicXmlWithFingering,
  musicXmlWithLineBreaks,
  musicXmlWithNoteNames,
  transposeMusicXml,
  songFromMusicXml
} from "./song/musicxml";
import type { NoteNameStyle } from "./song/musicxml";
import { detectChords, detectKey, keyName, musicXmlWithChords } from "./song/harmony";
import type { Key } from "./song/harmony";
import { withFingering } from "./song/song";
import type { Song } from "./song/song";
import { Staff, markKey } from "./staff/Staff";
import { scoreboard } from "./practice/scoreboard";
import { quartersAt } from "./song/song";
import { LibraryDialog } from "./ui/LibraryDialog";
import { GameDialog } from "./ui/GameDialog";
import { PlayerTopBar } from "./ui/PlayerTopBar";
import { SettingsPanel } from "./ui/SettingsPanel";
import { SongProgress } from "./ui/SongProgress";
import { useAutoHide } from "./ui/useAutoHide";
import {
  FallingNotesIcon,
  HandIcon,
  KeyboardIcon,
  NoteCardIcon,
  RoadIcon,
  StaffIcon
} from "./ui/icons";

type HandChoice = "right" | "left" | "both" | "listen";

const HANDS: Readonly<Record<HandChoice, readonly Hand[]>> = {
  right: ["right"],
  left: ["left"],
  both: ["right", "left"],
  listen: []
};

const NOTE_NAMES = [
  "до",
  "до♯",
  "ре",
  "ре♯",
  "ми",
  "фа",
  "фа♯",
  "соль",
  "соль♯",
  "ля",
  "ля♯",
  "си"
];

function noteLabel(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12] ?? "?"}${String(Math.floor(pitch / 12) - 1)}`;
}

function overridesKey(song: Song): string {
  return `fingering:${song.title}:${String(song.notes.length)}`;
}

function loadOverrides(song: Song): Map<string, Finger> {
  try {
    const raw = localStorage.getItem(overridesKey(song));
    return new Map(raw ? (JSON.parse(raw) as [string, Finger][]) : []);
  } catch {
    return new Map();
  }
}

interface StaffPrefs {
  readonly zoom: number;
  readonly singleLine: boolean;
  readonly follow: boolean;
  /** Measures on every line of a wrapped page; 0 lets the width decide. */
  readonly measuresPerLine: 0 | 2 | 4 | 8;
  /** Note names on the staff and the falling notes. */
  readonly noteNames: "off" | NoteNameStyle;
  /** Chord symbols over the staff. */
  readonly chords: boolean;
  /** The staff on screen at all; hidden, the falling notes get the room. */
  readonly visible: boolean;
  /** The falling notes on screen. */
  readonly lane: boolean;
  /** The keyboard on screen. */
  readonly keys: boolean;
  /** Schematic hands over the keyboard. */
  readonly hands: boolean;
  /** The trial road view: notes in perspective, glowing, with sparks. */
  readonly road: boolean;
  /** Falling notes carry the note written on a small staff. */
  readonly noteCards: boolean;
}

const STAFF_PREFS_KEY = "staff-prefs";
const DEFAULT_STAFF_PREFS: StaffPrefs = {
  zoom: 0.8,
  singleLine: false,
  follow: true,
  measuresPerLine: 4,
  noteNames: "off",
  chords: false,
  visible: true,
  lane: true,
  keys: true,
  hands: true,
  road: false,
  noteCards: true
};
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function loadStaffPrefs(): StaffPrefs {
  try {
    const raw = localStorage.getItem(STAFF_PREFS_KEY);
    return raw
      ? { ...DEFAULT_STAFF_PREFS, ...(JSON.parse(raw) as Partial<StaffPrefs>) }
      : DEFAULT_STAFF_PREFS;
  } catch {
    return DEFAULT_STAFF_PREFS;
  }
}

function saveStaffPrefs(prefs: StaffPrefs): void {
  try {
    localStorage.setItem(STAFF_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the staff just starts at the defaults next time.
  }
}

type KeyRange = "song" | "88" | "61" | "49";

/** Fixed ranges of real keyboards: 88 keys A0-C8, 61 keys C2-C7, 49 keys C2-C6. */
const FIXED_RANGES: Readonly<Record<Exclude<KeyRange, "song">, readonly [number, number]>> = {
  "88": [21, 108],
  "61": [36, 96],
  "49": [36, 84]
};

/** The song's notes from the C below them to the C above, at least two octaves wide. */
function songRange(song: Song): readonly [number, number] {
  const pitches = song.notes.map((note) => note.pitch);
  if (pitches.length === 0) return [48, 84];
  let low = Math.floor((Math.min(...pitches) - 1) / 12) * 12;
  let high = Math.ceil((Math.max(...pitches) + 1) / 12) * 12;
  while (high - low < 24) {
    low -= 12;
    if (high - low < 24) high += 12;
  }
  return [Math.max(21, low), Math.min(108, high)];
}

/** The same grades as tints for the falling notes; a key that belongs to no note is red too. */
const GRADE_TINTS: Readonly<Record<Grade, number>> = {
  good: 0x2e9e4f,
  inaccurate: 0xe08a00,
  missed: 0xe63946
};
const EXTRA_TINT = 0xe63946;

type SplitDirection = "row" | "column";
/** The take's own staff: hidden, beside the original, or under it. */
type TakeStaff = "off" | SplitDirection;

/** Staff colours of a written-out take: the review's, and red for a key that matched no note. */
const TRANSCRIBED_COLORS: Readonly<Record<TranscribedGrade, string>> = {
  good: "#2e9e4f",
  inaccurate: "#e08a00",
  missed: "#e63946",
  extra: "#e63946"
};

function takeLabel(take: Take): string {
  const when = new Date(take.createdAt);
  const time = when.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const date = when.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const mode = take.mode === "tempo" ? "в темпе" : "с ожиданием";
  return `${date} ${time} · ${mode} · ${String(Math.round(take.speed * 100))}%`;
}

function downloadTake(take: Take, title: string): void {
  const bytes = new Uint8Array(takeToMidi(take, title));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title} ${take.createdAt.slice(0, 16).replace(/[T:]/g, "-")}.mid`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Staff colours of a reviewed note: clean, off in rhythm, length or touch, not played. */
const GRADE_COLORS: Readonly<Record<Grade, string>> = {
  good: "#2e9e4f",
  inaccurate: "#e08a00",
  missed: "#e63946"
};

function saveOverrides(song: Song, overrides: ReadonlyMap<string, Finger>): void {
  try {
    localStorage.setItem(overridesKey(song), JSON.stringify([...overrides]));
  } catch {
    // Private mode or a full quota: corrections just don't survive a reload.
  }
}

interface LessonChoice {
  readonly exerciseId: string;
  readonly levelId: LevelId;
}

const LESSONS = [...EXERCISES, ...LOCAL_LESSONS];

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
 * The shift that takes `from` to `to`, -4..+7 semitones: up a fifth rather than
 * down a fourth, as C major to G major is usually written out.
 */
function shiftBetween(from: number, to: number): number {
  const up = (((to - from) % 12) + 12) % 12;
  return up > 7 ? up - 12 : up;
}

const FIRST_LESSON: LessonChoice = { exerciseId: LESSONS[0]?.id ?? "", levelId: "easy" };

/** A built-in lesson at one level; the level is part of the title, so corrections stay per level. */
function lessonSong(choice: LessonChoice): Song {
  const exercise = LESSONS.find((item) => item.id === choice.exerciseId);
  const level = exercise?.levels.find((item) => item.id === choice.levelId) ?? exercise?.levels[0];
  if (!exercise || !level) throw new Error(`No lesson ${choice.exerciseId}`);
  const song = songFromMusicXml(level.musicXml, exercise.title);
  return { ...song, title: `${exercise.title} · ${level.title}` };
}

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const trainerRef = useRef<Trainer | null>(null);
  const noteClickRef = useRef<(noteId: string) => void>(() => undefined);
  const [trainerReady, setTrainerReady] = useState(false);

  const [lesson, setLesson] = useState<LessonChoice | null>(FIRST_LESSON);
  /** The song as loaded; `baseSong` is it in the chosen key. */
  const [sourceSong, setSourceSong] = useState<Song>(() => lessonSong(FIRST_LESSON));
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
  const [mode, setMode] = useState<PracticeMode>("wait");
  const [handChoice, setHandChoice] = useState<HandChoice>("right");
  const [speed, setSpeed] = useState(0.75);
  const [snapshot, setSnapshot] = useState<TrainerSnapshot | null>(null);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [midiError, setMidiError] = useState<string | null>(() =>
    midiSupported()
      ? null
      : // Chrome hides Web MIDI on plain http unless the host is localhost.
        !window.isSecureContext
        ? "MIDI доступен только по https или на localhost — откройте http://localhost:5190"
        : "Этот браузер не поддерживает Web MIDI — откройте тренажёр в Chrome или Edge"
  );
  const [sound, setSound] = useState<"off" | "loading" | "ready">("off");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The player's library: songs kept in this browser, and the linked folder. */
  const [mySongs, setMySongs] = useState<MySong[]>([]);
  const [folder, setFolder] = useState<{
    handle: FileSystemDirectoryHandle;
    access: PermissionState;
    songs: FolderSong[];
  } | null>(null);
  /** The library song on screen, as the lesson select names it: `my:<id>` or `dir:<path>`. */
  const [librarySource, setLibrarySource] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [keyRange, setKeyRange] = useState<KeyRange>("song");
  /** Which MIDI input plays; "all" listens to every one. */
  const [midiDeviceId, setMidiDeviceId] = useState("all");
  const midiDeviceRef = useRef("all");
  /** The last take and how it compares with the score. */
  const [lastTake, setLastTake] = useState<{ take: Take; review: TakeReview } | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  /** The take playing on one screen against the original on the other. */
  const [comparing, setComparing] = useState(false);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("row");
  /** Bumped to play the comparison again from its start. */
  const [replayCount, setReplayCount] = useState(0);
  const mirrorHostRef = useRef<HTMLDivElement>(null);
  const [takeStaff, setTakeStaff] = useState<TakeStaff>("off");
  const takeHandlerRef = useRef<(take: Take) => void>(() => undefined);
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  const startFromRef = useRef<number | null>(null);
  const viewRef = useRef<FallingNotesView | null>(null);

  const song = useMemo(() => withFingering(baseSong, overrides), [baseSong, overrides]);
  // The staff shows the same fingers as the falling notes, corrections included.
  const [staffPrefs, setStaffPrefs] = useState<StaffPrefs>(loadStaffPrefs);
  const fixedLines = !staffPrefs.singleLine && staffPrefs.measuresPerLine > 0;
  // Harmony of the song as written: the chords over the staff and its key.
  const chords = useMemo(() => detectChords(baseSong), [baseSong]);
  const nameStyle = staffPrefs.noteNames === "off" ? undefined : staffPrefs.noteNames;
  const fallingNames = nameStyle;
  const withNames = useCallback(
    (xml: string) => (nameStyle ? musicXmlWithNoteNames(xml, nameStyle) : xml),
    [nameStyle]
  );
  const staffXml = useMemo(() => {
    if (!song.musicXml) return undefined;
    const named = withNames(musicXmlWithFingering(song.musicXml, song.notes));
    const fingered = staffPrefs.chords ? musicXmlWithChords(named, chords) : named;
    return fixedLines ? musicXmlWithLineBreaks(fingered, staffPrefs.measuresPerLine) : fingered;
  }, [song, fixedLines, staffPrefs.measuresPerLine, withNames, staffPrefs.chords, chords]);
  // Read by the staff every frame; stable, so the staff never re-subscribes.
  const liveBeat = useCallback(() => trainerRef.current?.quarters() ?? 0, []);

  /** A click on the staff: play from the first note at or after that beat. */
  const seekToBeat = (beat: number) => {
    const target = song.notes.find((note) => note.startBeat >= beat - 1e-6);
    const trainer = trainerRef.current;
    if (!target || !trainer) return;
    startFromRef.current = target.start;
    trainer.seek(target.start);
    void ensureSound().then(() => {
      trainerRef.current?.setPlaying(true);
    });
  };
  const updateStaffPrefs = (change: Partial<StaffPrefs>) => {
    const next = { ...staffPrefs, ...change };
    saveStaffPrefs(next);
    setStaffPrefs(next);
  };
  const resetFingers = () => {
    const cleared = new Map<string, Finger>();
    saveOverrides(baseSong, cleared);
    setOverrides(cleared);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new FallingNotesView();
    view.onNoteClick = (noteId) => {
      noteClickRef.current(noteId);
    };
    view.onKeyPointer = (event) => {
      // A clicked key has no voice of its own, unlike the piano.
      if (event.type === "down") soundNoteOn(event.pitch);
      else soundNoteOff(event.pitch);
      trainerRef.current?.key(event);
    };
    let disposed = false;
    const mounted = view.mount(host).then(() => {
      if (disposed) return;
      viewRef.current = view;
      const trainer = new Trainer(view);
      trainer.onTake = (take) => {
        takeHandlerRef.current(take);
      };
      trainer.onSnapshot = (next) => {
        setSnapshot(next);
        // A listen-through ends by handing the song back for practice.
        if (next.finished) setListening(false);
      };
      trainerRef.current = trainer;
      setTrainerReady(true);
    });
    return () => {
      disposed = true;
      trainerRef.current = null;
      setTrainerReady(false);
      void mounted.then(() => {
        view.destroy();
      });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyEvent) => trainerRef.current?.key(event);
    const stopWarmUp = startSoundOnFirstGesture();
    const stopKeyboard = listenToComputerKeyboard((event) => {
      // The computer keyboard has no voice of its own, unlike the piano.
      if (event.type === "down") soundNoteOn(event.pitch);
      else soundNoteOff(event.pitch);
      onKey(event);
    });
    let stopMidi: (() => void) | undefined;
    let disposed = false;
    if (midiSupported()) {
      const onMidiKey = (event: MidiEvent, deviceId: string) => {
        const chosen = midiDeviceRef.current;
        if (chosen !== "all" && chosen !== deviceId) return;
        if (event.type === "pedal") trainerRef.current?.pedal(event.down);
        else onKey(event);
      };
      listenToMidi(onMidiKey, setDevices).then(
        (stop) => {
          if (disposed) stop();
          else stopMidi = stop;
        },
        (error: unknown) => {
          setMidiError(error instanceof Error ? error.message : String(error));
        }
      );
    }
    return () => {
      disposed = true;
      stopWarmUp();
      stopKeyboard();
      stopMidi?.();
    };
  }, []);

  const practiceOptions = useMemo<PracticeOptions>(
    () =>
      listening
        ? { mode: "tempo", hands: new Set<Hand>(), speed }
        : { mode, hands: new Set(HANDS[handChoice]), speed },
    [listening, mode, handChoice, speed]
  );

  // The take as a song, sounding with its own velocities, while comparing.
  const compareSong = useMemo(
    () => (comparing && lastTake ? takeAsSong(lastTake.take, song, lastTake.review) : undefined),
    [comparing, lastTake, song]
  );

  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    if (compareSong && lastTake) {
      trainer.load(
        compareSong,
        { mode: "tempo", hands: new Set<Hand>(), speed: lastTake.take.speed },
        `${overridesKey(baseSong)}:replay`
      );
      if (lastTake.take.from > 0) trainer.seek(lastTake.take.from);
      trainer.setPlaying(true);
      return;
    }
    trainer.load(song, practiceOptions, overridesKey(baseSong));
    if (startFromRef.current !== null) trainer.seek(startFromRef.current);
    if (listening) trainer.setPlaying(true);
    // replayCount is here only to play the comparison again.
  }, [
    trainerReady,
    song,
    practiceOptions,
    listening,
    baseSong,
    compareSong,
    lastTake,
    replayCount
  ]);

  useEffect(() => {
    if (trainerRef.current) trainerRef.current.metronome = metronome;
  }, [trainerReady, metronome]);

  useEffect(() => {
    viewRef.current?.setShowLabels(showLabels);
    viewRef.current?.setNoteNames(fallingNames);
    viewRef.current?.setParts({
      notes: staffPrefs.lane,
      keys: staffPrefs.keys,
      hands: staffPrefs.hands
    });
    viewRef.current?.setRoad(staffPrefs.road);
    viewRef.current?.setNoteCards(staffPrefs.noteCards);
  }, [
    trainerReady,
    showLabels,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands,
    staffPrefs.road,
    staffPrefs.noteCards
  ]);

  const [rangeLow, rangeHigh] = keyRange === "song" ? songRange(baseSong) : FIXED_RANGES[keyRange];
  useEffect(() => {
    viewRef.current?.setRange(rangeLow, rangeHigh, keyRange === "song");
  }, [trainerReady, rangeLow, rangeHigh, keyRange]);

  // The original on a second screen, drawn by the trainer at the take's song time.
  useEffect(() => {
    const host = mirrorHostRef.current;
    const trainer = trainerRef.current;
    if (!comparing || !host || !trainer || !lastTake) return;
    const { take, review: taken } = lastTake;
    const gradeOf = new Map(taken.notes.map((item) => [item.note.id, GRADE_TINTS[item.grade]]));
    const playedTint = new Map<string, number>();
    take.notes.forEach((played, index) => {
      const owed = taken.notes.find((item) => item.played === played);
      playedTint.set(`take${String(index)}`, owed ? GRADE_TINTS[owed.grade] : EXTRA_TINT);
    });
    const mirror = new FallingNotesView();
    let disposed = false;
    const mounted = mirror.mount(host).then(() => {
      if (disposed) return;
      mirror.setSong(song);
      mirror.setShowLabels(showLabels);
      mirror.setNoteNames(fallingNames);
      // The same parts as the main view, or the two lanes run at different speeds.
      mirror.setParts({ notes: staffPrefs.lane, keys: staffPrefs.keys, hands: staffPrefs.hands });
      mirror.setRange(rangeLow, rangeHigh);
      trainer.setComparison({
        colorOf: (note) => playedTint.get(note.id),
        mirror: { view: mirror, colorOf: (note) => gradeOf.get(note.id) }
      });
    });
    return () => {
      disposed = true;
      trainer.setComparison(undefined);
      void mounted.then(() => {
        mirror.destroy();
      });
    };
  }, [
    comparing,
    lastTake,
    song,
    showLabels,
    rangeLow,
    rangeHigh,
    fallingNames,
    staffPrefs.lane,
    staffPrefs.keys,
    staffPrefs.hands
  ]);

  useEffect(() => {
    midiDeviceRef.current = midiDeviceId;
  }, [midiDeviceId]);

  const cycleFinger = (noteId: string) => {
    const current = song.notes.find((note) => note.id === noteId)?.finger ?? 1;
    const next = ((current % 5) + 1) as Finger;
    const updated = new Map(overrides).set(noteId, next);
    saveOverrides(baseSong, updated);
    setOverrides(updated);
  };

  useEffect(() => {
    // The view outlives renders; it always calls the latest handler.
    noteClickRef.current = cycleFinger;
  });

  /** Puts a song read from a file on screen: a new song, not a lesson level. */
  const showFileSong = (fileName: string, data: ArrayBuffer, source: string | null) => {
    const loaded = songFromFileData(fileName, data);
    if (loaded.notes.length === 0) throw new Error("В файле нет нот");
    setLoadError(null);
    setLesson(null);
    setLibrarySource(source);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
    return loaded;
  };

  const reportError = (error: unknown) => {
    setLoadError(error instanceof Error ? error.message : String(error));
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const loaded = showFileSong(file.name, data, null);
      // Kept only once it read as a song: a broken file never reaches the library.
      const saved = await saveMySong(file.name, loaded.title, data);
      setMySongs(await listMySongs());
      setLibrarySource(`my:${saved.id}`);
    } catch (error) {
      reportError(error);
    }
  };

  const openMySong = async (id: string) => {
    try {
      const stored = await loadMySong(id);
      if (!stored) throw new Error("Песни больше нет в библиотеке");
      showFileSong(stored.fileName, stored.data, `my:${id}`);
    } catch (error) {
      reportError(error);
    }
  };

  const openFolderSong = async (songPath: string) => {
    const entry = folder?.songs.find((item) => item.path === songPath);
    try {
      if (!entry) throw new Error("Песни больше нет в папке");
      const file = await entry.handle.getFile();
      showFileSong(file.name, await file.arrayBuffer(), `dir:${songPath}`);
    } catch (error) {
      reportError(error);
      // The file may be gone from the disk: read the folder again.
      if (folder) void refreshFolder(folder.handle, false);
    }
  };

  const deleteMySong = async (id: string) => {
    try {
      await removeMySong(id);
      setMySongs(await listMySongs());
      const first = LESSONS[0];
      if (first) openLesson({ exerciseId: first.id, levelId: first.levels[0]?.id ?? "easy" });
    } catch (error) {
      reportError(error);
    }
  };

  /** Reads the linked folder if the browser grants it; `ask` prompts, and needs a click. */
  const refreshFolder = async (handle: FileSystemDirectoryHandle, ask: boolean) => {
    try {
      const access = await folderPermission(handle, ask);
      const songs = access === "granted" ? await readFolderSongs(handle) : [];
      setFolder({ handle, access, songs });
    } catch (error) {
      reportError(error);
    }
  };

  const chooseFolder = async () => {
    try {
      const handle = await pickFolder();
      await saveFolderHandle(handle);
      await refreshFolder(handle, false);
    } catch (error) {
      // Closing the picker is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  };

  const forgetFolder = async () => {
    await saveFolderHandle(undefined);
    setFolder(null);
  };

  // The library as it was left: the kept songs, and the folder if the browser still grants it.
  useEffect(() => {
    let disposed = false;
    // Read through a call: the cleanup changes the flag where narrowing cannot see it.
    const alive = () => !disposed;
    void (async () => {
      try {
        const songs = await listMySongs();
        if (alive()) setMySongs(songs);
        const handle = await loadFolderHandle();
        if (!handle || !alive()) return;
        const access = await folderPermission(handle, false);
        const folderSongs = access === "granted" ? await readFolderSongs(handle) : [];
        if (alive()) setFolder({ handle, access, songs: folderSongs });
      } catch {
        // No IndexedDB (a private window): the library just starts empty.
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const openLesson = (choice: LessonChoice) => {
    const loaded = lessonSong(choice);
    setLesson(choice);
    setLibrarySource(null);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
    setOverrides(loadOverrides(loaded));
  };

  const ensureSound = async () => {
    if (sound !== "off") return;
    setSound("loading");
    try {
      await startPianoSound();
      setSound("ready");
    } catch {
      setSound("off");
    }
  };

  const togglePlay = async () => {
    await ensureSound();
    trainerRef.current?.setPlaying(!(snapshot?.playing ?? false));
  };

  const toggleListening = async () => {
    await ensureSound();
    setListening((current) => !current);
  };

  const restart = () => {
    if (comparing) {
      setReplayCount((count) => count + 1);
      return;
    }
    setListening(false);
    startFromRef.current = null;
    trainerRef.current?.load(song, practiceOptions, overridesKey(baseSong));
  };

  useEffect(() => {
    // The trainer outlives renders; a finished take is compared with the song on screen now.
    takeHandlerRef.current = (take) => {
      setTakes(saveTake(take));
      setLastTake({ take, review: compareTake(song, take) });
    };
  });

  // Each song and level keeps its own takes.
  const songKey = overridesKey(baseSong);
  const [takesOf, setTakesOf] = useState<string | null>(null);
  if (takesOf !== songKey) {
    // Another song or level: its own history, and nothing of the last one on screen.
    setTakesOf(songKey);
    setTakes(loadTakes(songKey));
    setLastTake(null);
    setComparing(false);
  }

  const selectTake = (id: string) => {
    const take = takes.find((item) => item.id === id);
    if (take) setLastTake({ take, review: compareTake(song, take) });
  };

  const startComparing = async () => {
    await ensureSound();
    setComparing(true);
  };

  // A take belongs to the song and level it was played on; another song shows no review.
  const review = lastTake?.take.songKey === overridesKey(baseSong) ? lastTake.review : undefined;
  const reviewMarks = useMemo(
    () =>
      review
        ? new Map(
            review.notes.map((item) => [
              markKey(item.note.startBeat, item.note.pitch),
              GRADE_COLORS[item.grade]
            ])
          )
        : undefined,
    [review]
  );

  // The take written out as a score, laid out in the same lines as the original.
  const transcription = useMemo(() => {
    if (!review || !lastTake || takeStaff === "off") return undefined;
    const written = transcribeTake(song, lastTake.take, review);
    const named = withNames(written.musicXml);
    const musicXml = fixedLines ? musicXmlWithLineBreaks(named, staffPrefs.measuresPerLine) : named;
    const marks = new Map(
      [...written.grades].map(([key, grade]) => {
        const [beat = "0", pitch = "0"] = key.split(":");
        return [markKey(Number(beat), Number(pitch)), TRANSCRIBED_COLORS[grade]] as const;
      })
    );
    return { musicXml, marks };
  }, [review, lastTake, takeStaff, song, fixedLines, staffPrefs.measuresPerLine, withNames]);

  // The lane shows notes and keys, only the keys (a strip), or nothing at all.
  const laneMode = staffPrefs.lane ? "full" : staffPrefs.keys ? "keys" : "hidden";
  // With the lane hidden or cut to its keys, the staff may take more of the screen.
  const staffRoom = laneMode === "hidden" ? 1.9 : laneMode === "keys" ? 1.4 : 1;

  const stats = snapshot?.stats;
  const played = stats ? stats.hits + stats.misses : 0;
  const accuracy = stats && played + stats.wrong > 0 ? stats.hits / (played + stats.wrong) : 0;

  // The shell: one bar, the song's progress, windows for the library and the settings.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultClosed, setResultClosed] = useState(false);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const playing = snapshot?.playing ?? false;
  const barHidden = useAutoHide(playing && !settingsOpen && !libraryOpen, bar);
  const board = scoreboard(song, snapshot?.time ?? 0, speed);
  const totalQuarters = Math.max(1e-6, quartersAt(song, song.duration));
  const progress = Math.min(1, quartersAt(song, snapshot?.time ?? 0) / totalQuarters);
  const ticks = useMemo(
    () => song.measures.map((measure) => measure.start / totalQuarters),
    [song, totalQuarters]
  );
  const midiName = devices.length > 0 ? (devices[0]?.name ?? "MIDI") : undefined;

  const play = () => {
    setResultClosed(false);
    void togglePlay();
  };
  const startOver = () => {
    setResultClosed(false);
    restart();
  };

  // Keys play notes: the shortcuts take Ctrl or Alt, never a lone key or the space bar.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    const pause =
      (event.ctrlKey && event.code === "Space") || (event.altKey && event.code === "KeyP");
    if (pause) {
      event.preventDefault();
      play();
    } else if (event.altKey && event.code === "KeyR") {
      event.preventDefault();
      startOver();
    } else if (event.altKey && event.code === "KeyL") {
      event.preventDefault();
      setLibraryOpen(true);
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onShortcut(event);
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);

  const toggles = (
    <>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.visible}
        title={staffPrefs.visible ? "Скрыть нотный стан" : "Показать нотный стан"}
        disabled={!staffXml}
        onClick={() => {
          updateStaffPrefs({ visible: !staffPrefs.visible });
        }}
      >
        <StaffIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.lane}
        title={staffPrefs.lane ? "Скрыть падающие ноты" : "Показать падающие ноты"}
        onClick={() => {
          updateStaffPrefs({ lane: !staffPrefs.lane });
        }}
      >
        <FallingNotesIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.keys}
        title={staffPrefs.keys ? "Скрыть клавиатуру" : "Показать клавиатуру"}
        onClick={() => {
          updateStaffPrefs({ keys: !staffPrefs.keys });
        }}
      >
        <KeyboardIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.hands}
        disabled={!staffPrefs.keys}
        title={staffPrefs.hands ? "Скрыть руки" : "Показать руки"}
        onClick={() => {
          updateStaffPrefs({ hands: !staffPrefs.hands });
        }}
      >
        <HandIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.road}
        disabled={!staffPrefs.lane}
        title={staffPrefs.road ? "Обычный вид нот" : "Дорога: ноты в перспективе"}
        onClick={() => {
          updateStaffPrefs({ road: !staffPrefs.road });
        }}
      >
        <RoadIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={staffPrefs.noteCards}
        disabled={!staffPrefs.lane}
        title={staffPrefs.noteCards ? "Падающие ноты полосками" : "Падающие ноты нотами на стане"}
        onClick={() => {
          updateStaffPrefs({ noteCards: !staffPrefs.noteCards });
        }}
      >
        <NoteCardIcon />
      </button>
    </>
  );

  const settingsTabs = [
    {
      id: "song",
      title: "Песня",
      content: (
        <div className="settings-list">
          {sourceKey && (
            <label className="setting">
              <span>Тональность</span>
              <span className="setting-control">
                <button
                  type="button"
                  className="game-button"
                  aria-label="На полтона ниже"
                  onClick={() => {
                    setTranspose((value) => Math.max(-11, value - 1));
                  }}
                >
                  −
                </button>
                <select
                  className="game-select"
                  aria-label="Тональность"
                  value={(sourceKey.tonic + transpose + 12) % 12}
                  onChange={(event) => {
                    setTranspose(shiftBetween(sourceKey.tonic, Number(event.target.value)));
                  }}
                >
                  {Array.from({ length: 12 }, (_, tonic) => {
                    const moved: Key = { tonic, mode: sourceKey.mode };
                    const shift = shiftBetween(sourceKey.tonic, tonic);
                    return (
                      <option key={tonic} value={tonic}>
                        {keyName(moved)}
                        {shift === 0 ? " (как в нотах)" : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className="game-button"
                  aria-label="На полтона выше"
                  onClick={() => {
                    setTranspose((value) => Math.min(11, value + 1));
                  }}
                >
                  +
                </button>
              </span>
            </label>
          )}
          <div className="setting">
            <span>Пальцы, исправленные кликом по ноте</span>
            <button
              type="button"
              className="game-button"
              onClick={resetFingers}
              disabled={overrides.size === 0}
            >
              Сбросить пальцы
            </button>
          </div>
          <p className="setting-hint">
            Клик по падающей ноте меняет палец; клик по нотам на стане — играть с этого места.
          </p>
        </div>
      )
    },
    {
      id: "play",
      title: "Игра",
      content: (
        <div className="settings-list">
          <label className="setting">
            <span>Метроном</span>
            <input
              type="checkbox"
              checked={metronome}
              onChange={(event) => {
                setMetronome(event.target.checked);
              }}
            />
          </label>
          <div className="setting">
            <span>Послушать, как звучит песня</span>
            <button
              type="button"
              className="game-button"
              onClick={() => void toggleListening()}
              disabled={sound === "loading"}
            >
              {listening ? "Стоп" : "Прослушать"}
            </button>
          </div>
          {stats && (
            <p className="setting-hint">
              Попадания {stats.hits} · Промахи {stats.misses} · Лишние {stats.wrong}
              {mode === "tempo" && stats.hits > 0
                ? ` · Смещение ${String(Math.round(stats.meanOffset * 1000))} мс`
                : ""}
            </p>
          )}
          <p className="setting-hint">
            Горячие клавиши: Ctrl+Пробел или Alt+P — играть и пауза, Alt+R — сначала, Alt+L —
            библиотека.
          </p>
        </div>
      )
    },
    {
      id: "staff",
      title: "Вид нот",
      content: staffXml ? (
        <div className="settings-list">
          <div className="setting">
            <span>Масштаб</span>
            <span className="setting-control">
              <button
                type="button"
                className="game-button"
                aria-label="Мельче"
                disabled={staffPrefs.zoom <= ZOOM_MIN + 1e-9}
                onClick={() => {
                  updateStaffPrefs({
                    zoom: Math.max(ZOOM_MIN, Math.round((staffPrefs.zoom - ZOOM_STEP) * 10) / 10)
                  });
                }}
              >
                −
              </button>
              <span className="digits">{Math.round(staffPrefs.zoom * 100)}%</span>
              <button
                type="button"
                className="game-button"
                aria-label="Крупнее"
                disabled={staffPrefs.zoom >= ZOOM_MAX - 1e-9}
                onClick={() => {
                  updateStaffPrefs({
                    zoom: Math.min(ZOOM_MAX, Math.round((staffPrefs.zoom + ZOOM_STEP) * 10) / 10)
                  });
                }}
              >
                +
              </button>
            </span>
          </div>
          <label className="setting">
            <span>По строкам</span>
            <input
              type="checkbox"
              checked={!staffPrefs.singleLine}
              onChange={(event) => {
                updateStaffPrefs({ singleLine: !event.target.checked });
              }}
            />
          </label>
          <label className="setting">
            <span>Следовать за игрой</span>
            <input
              type="checkbox"
              checked={staffPrefs.follow}
              onChange={(event) => {
                updateStaffPrefs({ follow: event.target.checked });
              }}
            />
          </label>
          {!staffPrefs.singleLine && (
            <label className="setting">
              <span>Тактов в строке</span>
              <select
                className="game-select"
                value={staffPrefs.measuresPerLine}
                onChange={(event) => {
                  updateStaffPrefs({
                    measuresPerLine: Number(event.target.value) as StaffPrefs["measuresPerLine"]
                  });
                }}
              >
                <option value={0}>Авто</option>
                <option value={2}>По 2 такта</option>
                <option value={4}>По 4 такта</option>
                <option value={8}>По 8 тактов</option>
              </select>
            </label>
          )}
          <label className="setting">
            <span>Названия на нотах</span>
            <select
              className="game-select"
              value={staffPrefs.noteNames}
              onChange={(event) => {
                updateStaffPrefs({ noteNames: event.target.value as StaffPrefs["noteNames"] });
              }}
            >
              <option value="off">Нет</option>
              <option value="ru">до ре ми</option>
              <option value="en">C D E</option>
            </select>
          </label>
          <label className="setting">
            <span>Аккорды</span>
            <input
              type="checkbox"
              checked={staffPrefs.chords}
              onChange={(event) => {
                updateStaffPrefs({ chords: event.target.checked });
              }}
            />
          </label>
        </div>
      ) : (
        <p className="setting-hint">У этой песни нет нотной записи: она открыта из MIDI.</p>
      )
    },
    {
      id: "keys",
      title: "Клавиатура",
      content: (
        <div className="settings-list">
          <label className="setting">
            <span>Клавиши</span>
            <select
              className="game-select"
              value={keyRange}
              onChange={(event) => {
                setKeyRange(event.target.value as KeyRange);
              }}
            >
              <option value="song">По песне</option>
              <option value="88">88 клавиш</option>
              <option value="61">61 клавиша</option>
              <option value="49">49 клавиш</option>
            </select>
          </label>
          <label className="setting">
            <span>Наклейки с названиями на клавишах</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => {
                setShowLabels(event.target.checked);
              }}
            />
          </label>
          <div className="setting">
            <span>Что показывать</span>
            <span className="setting-control">{toggles}</span>
          </div>
        </div>
      )
    },
    {
      id: "midi",
      title: "Звук и MIDI",
      content: (
        <div className="settings-list">
          {devices.length > 1 ? (
            <label className="setting">
              <span>Пианино</span>
              <select
                className="game-select"
                value={midiDeviceId}
                onChange={(event) => {
                  setMidiDeviceId(event.target.value);
                }}
              >
                <option value="all">Все устройства</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="setting-hint">
              {devices.length === 1
                ? `Пианино: ${devices[0]?.name ?? ""}`
                : (midiError ??
                  "Пианино не найдено — подключите USB-кабель или играйте на клавиатуре: Z…/ и Q…P — белые, S D G H J и 2 3 5 6 7 9 0 — чёрные")}
            </p>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="app">
      <div ref={setBar} className="shell-top" data-hidden={barHidden}>
        <PlayerTopBar
          title={song.title}
          hidden={barHidden}
          playing={playing}
          soundLoading={sound === "loading"}
          mode={mode}
          hands={handChoice}
          speed={speed}
          board={board}
          midi={midiName}
          settingsOpen={settingsOpen}
          toggles={toggles}
          onLibrary={() => {
            setLibraryOpen(true);
          }}
          onRestart={startOver}
          onTogglePlay={play}
          onMode={setMode}
          onHands={setHandChoice}
          onSpeed={setSpeed}
          onSettings={() => {
            setSettingsOpen((open) => !open);
          }}
        />
        <SongProgress
          progress={progress}
          ticks={ticks}
          hidden={barHidden}
          onSeek={(share) => {
            seekToBeat(share * totalQuarters);
          }}
        />
      </div>

      {loadError && <div className="toast toast--error">{loadError}</div>}

      {review && lastTake && (
        <div className="review-bar">
          <strong>Разбор дубля</strong>
          <span className="good">чисто {review.summary.good}</span>
          <span className="inaccurate">неточно {review.summary.inaccurate}</span>
          <span className="missed">пропущено {review.summary.missed}</span>
          <span>лишние нажатия {review.summary.extras}</span>
          {lastTake.take.mode === "tempo" && (
            <span>ритм ±{Math.round(review.summary.meanAbsOffsetMs)} мс</span>
          )}
          <span>ровность удара ±{Math.round(review.summary.velocitySpread)}</span>
          {takes.length > 1 && (
            <select
              aria-label="Дубль"
              value={lastTake.take.id}
              onChange={(event) => {
                selectTake(event.target.value);
              }}
            >
              {takes.map((take) => (
                <option key={take.id} value={take.id}>
                  {takeLabel(take)}
                </option>
              ))}
            </select>
          )}
          {comparing ? (
            <>
              <button
                type="button"
                aria-pressed={splitDirection === "row"}
                onClick={() => {
                  setSplitDirection("row");
                }}
              >
                Рядом
              </button>
              <button
                type="button"
                aria-pressed={splitDirection === "column"}
                onClick={() => {
                  setSplitDirection("column");
                }}
              >
                Друг под другом
              </button>
              <button
                type="button"
                onClick={() => {
                  setComparing(false);
                }}
              >
                Закрыть сравнение
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void startComparing()}>
              Сравнить с оригиналом
            </button>
          )}
          <select
            aria-label="Ноты дубля"
            value={takeStaff}
            onChange={(event) => {
              setTakeStaff(event.target.value as TakeStaff);
            }}
          >
            <option value="off">Ноты дубля: скрыть</option>
            <option value="column">Ноты дубля: под оригиналом</option>
            <option value="row">Ноты дубля: рядом</option>
          </select>
          <button
            type="button"
            onClick={() => {
              downloadTake(lastTake.take, song.title);
            }}
          >
            Скачать .mid
          </button>
          <button
            type="button"
            onClick={() => {
              setComparing(false);
              setLastTake(null);
            }}
          >
            Скрыть
          </button>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-main">
          {staffXml && staffPrefs.visible && (
            <div className={`staves staves--${transcription ? takeStaff : "single"}`}>
              <div className="staff-slot">
                {transcription && <span className="staff-label">Оригинал</span>}
                <Staff
                  musicXml={staffXml}
                  beat={snapshot?.beat ?? 0}
                  zoom={staffPrefs.zoom}
                  singleLine={staffPrefs.singleLine}
                  follow={staffPrefs.follow}
                  breaksFromScore={fixedLines}
                  onSeek={seekToBeat}
                  liveBeat={liveBeat}
                  marks={reviewMarks}
                  maxShare={(transcription && takeStaff === "column" ? 0.26 : 0.45) * staffRoom}
                />
              </div>
              {transcription && (
                <div className="staff-slot">
                  <span className="staff-label">Твой дубль</span>
                  <Staff
                    musicXml={transcription.musicXml}
                    beat={snapshot?.beat ?? 0}
                    zoom={staffPrefs.zoom}
                    singleLine={staffPrefs.singleLine}
                    follow={staffPrefs.follow}
                    breaksFromScore={fixedLines}
                    onSeek={seekToBeat}
                    liveBeat={liveBeat}
                    marks={transcription.marks}
                    maxShare={(takeStaff === "column" ? 0.26 : 0.45) * staffRoom}
                  />
                </div>
              )}
            </div>
          )}

          {/* Hidden, not removed: the view under it keeps the keys, the sound and the take going. */}
          <div className={`lanes lanes--${splitDirection} lanes--${laneMode}`}>
            <div className="lane" ref={hostRef}>
              {comparing && <span className="lane-label">Твой дубль</span>}
              {snapshot?.waiting && <span className="waiting-pill">Жду ноту</span>}
            </div>
            {comparing && (
              <div className="lane" ref={mirrorHostRef}>
                <span className="lane-label">Оригинал</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <LibraryDialog
        open={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
        }}
        lessons={LESSONS}
        current={lesson}
        currentSource={librarySource}
        onLesson={(exerciseId, levelId) => {
          openLesson({ exerciseId, levelId });
        }}
        mySongs={mySongs}
        onMySong={(id) => void openMySong(id)}
        onDeleteMySong={(id) => void deleteMySong(id)}
        folder={
          folder
            ? {
                name: folder.handle.name,
                needsAccess: folder.access === "prompt",
                songs: folder.songs
              }
            : undefined
        }
        foldersSupported={foldersSupported()}
        onFolderSong={(path) => void openFolderSong(path)}
        onChooseFolder={() => void chooseFolder()}
        onGrantFolder={() => {
          if (folder) void refreshFolder(folder.handle, true);
        }}
        onForgetFolder={() => void forgetFolder()}
        onOpenFile={(event) => void openFile(event)}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
        tabs={settingsTabs}
      />

      <GameDialog
        open={Boolean(snapshot?.finished && !listening && !comparing && stats && !resultClosed)}
        title="Готово"
        className="result"
        onClose={() => {
          setResultClosed(true);
        }}
      >
        <p className="result-score digits">{Math.round(accuracy * 100)}%</p>
        <p className="result-caption">точность</p>
        {stats && stats.troubleSpots.length > 0 && (
          <p>
            Трудные ноты:{" "}
            {stats.troubleSpots
              .map((spot) => `${noteLabel(spot.pitch)} (${String(spot.errors)})`)
              .join(", ")}
          </p>
        )}
        <div className="result-actions">
          <button type="button" className="game-button game-button--play" onClick={startOver}>
            Ещё раз
          </button>
          {review && (
            <button
              type="button"
              className="game-button"
              onClick={() => {
                setResultClosed(true);
              }}
            >
              Разобрать дубль
            </button>
          )}
        </div>
      </GameDialog>
    </div>
  );
}
