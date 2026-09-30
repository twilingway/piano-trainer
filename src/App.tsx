import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { LevelId } from "./song/exercises";
import { songFromMidi } from "./song/midi";
import {
  musicXmlFromMxl,
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
  hands: true
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

async function readSongFile(file: File): Promise<Song> {
  const name = file.name.toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, "");
  if (name.endsWith(".mid") || name.endsWith(".midi")) {
    return songFromMidi(await file.arrayBuffer(), title);
  }
  if (name.endsWith(".mxl"))
    return songFromMusicXml(musicXmlFromMxl(await file.arrayBuffer()), title);
  if (name.endsWith(".xml") || name.endsWith(".musicxml")) {
    return songFromMusicXml(await file.text(), title);
  }
  throw new Error("Нужен файл .mid, .musicxml, .xml или .mxl");
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

/** The side rail's icons: small line drawings in the current text colour. */
function StaffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {[6, 9, 12, 15, 18].map((y) => (
        <line key={y} x1="2" x2="22" y1={y} y2={y} />
      ))}
      <ellipse cx="10" cy="15" rx="3" ry="2.2" className="filled" />
      <line x1="13" x2="13" y1="15" y2="4" />
    </svg>
  );
}

function FallingNotesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="4" height="8" rx="1" className="filled" />
      <rect x="10" y="7" width="4" height="10" rx="1" className="filled" />
      <rect x="17" y="2" width="4" height="6" rx="1" className="filled" />
      <line x1="2" x2="22" y1="21" y2="21" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="1.5" />
      {[7, 12, 17].map((x) => (
        <line key={x} x1={x} x2={x} y1="12" y2="19" />
      ))}
      {[5.5, 9.5, 15.5].map((x) => (
        <rect key={x} x={x} y="5" width="2.6" height="7" className="filled" />
      ))}
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 12V6.5a1.3 1.3 0 0 1 2.6 0V11V4.8a1.3 1.3 0 0 1 2.6 0V11V5.6a1.3 1.3 0 0 1 2.6 0V11.5V8a1.3 1.3 0 0 1 2.6 0v6.5a6.5 6.5 0 0 1-6.5 6.5h-.5a5.5 5.5 0 0 1-4.6-2.5L3.4 13.6a1.3 1.3 0 0 1 2-1.6L7 13.6" />
    </svg>
  );
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
  }, [trainerReady, showLabels, fallingNames, staffPrefs.lane, staffPrefs.keys, staffPrefs.hands]);

  const [rangeLow, rangeHigh] = keyRange === "song" ? songRange(baseSong) : FIXED_RANGES[keyRange];
  useEffect(() => {
    viewRef.current?.setRange(rangeLow, rangeHigh);
  }, [trainerReady, rangeLow, rangeHigh]);

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
      mirror.setParts({ notes: staffPrefs.lane, keys: staffPrefs.keys });
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
    staffPrefs.keys
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

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const loaded = await readSongFile(file);
      if (loaded.notes.length === 0) throw new Error("В файле нет нот");
      setLoadError(null);
      setLesson(null);
      startFromRef.current = null;
      setSourceSong(loaded);
      setTranspose(0);
      setOverrides(loadOverrides(loaded));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  const openLesson = (choice: LessonChoice) => {
    const loaded = lessonSong(choice);
    setLesson(choice);
    startFromRef.current = null;
    setSourceSong(loaded);
    setTranspose(0);
    setOverrides(loadOverrides(loaded));
  };

  const lessonLevels = LESSONS.find((item) => item.id === lesson?.exerciseId)?.levels ?? [];

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

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="title">{song.title}</strong>
        <label className="button">
          Открыть файл
          <input
            type="file"
            accept=".mid,.midi,.musicxml,.xml,.mxl"
            hidden
            onChange={(event) => void openFile(event)}
          />
        </label>
        <select
          aria-label="Урок"
          value={lesson?.exerciseId ?? ""}
          onChange={(event) => {
            const first = LESSONS.find((item) => item.id === event.target.value)?.levels[0];
            openLesson({ exerciseId: event.target.value, levelId: first?.id ?? "easy" });
          }}
        >
          <option value="" disabled>
            Уроки…
          </option>
          {LESSONS.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.title}
            </option>
          ))}
        </select>
        {lesson && (
          <select
            aria-label="Уровень"
            value={lesson.levelId}
            onChange={(event) => {
              openLesson({ ...lesson, levelId: event.target.value });
            }}
          >
            {lessonLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.title}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Режим"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as PracticeMode);
          }}
        >
          <option value="wait">Ждать ноту</option>
          <option value="tempo">В темпе</option>
        </select>
        <select
          aria-label="Руки"
          value={handChoice}
          onChange={(event) => {
            setHandChoice(event.target.value as HandChoice);
          }}
        >
          <option value="right">Правая рука</option>
          <option value="left">Левая рука</option>
          <option value="both">Обе руки</option>
          <option value="listen">Только слушать</option>
        </select>
        <label className="speed">
          Скорость {Math.round(speed * 100)}%
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value));
            }}
          />
        </label>
        <button type="button" onClick={() => void togglePlay()} disabled={sound === "loading"}>
          {sound === "loading" ? "Загружаю звук…" : snapshot?.playing ? "Пауза" : "Играть"}
        </button>
        <button type="button" onClick={restart}>
          Сначала
        </button>
        <button type="button" onClick={() => void toggleListening()} disabled={sound === "loading"}>
          {listening ? "Стоп" : "Прослушать"}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={metronome}
            onChange={(event) => {
              setMetronome(event.target.checked);
            }}
          />
          Метроном
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(event) => {
              setShowLabels(event.target.checked);
            }}
          />
          Названия нот
        </label>
        <select
          aria-label="Клавиши"
          value={keyRange}
          onChange={(event) => {
            setKeyRange(event.target.value as KeyRange);
          }}
        >
          <option value="song">Клавиши по песне</option>
          <option value="88">88 клавиш</option>
          <option value="61">61 клавиша</option>
          <option value="49">49 клавиш</option>
        </select>
      </header>

      <div className="status">
        {devices.length > 1 ? (
          <label className="device">
            MIDI:{" "}
            <select
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
          <span>
            {devices.length === 1
              ? `Пианино: ${devices[0]?.name ?? ""}`
              : (midiError ??
                "Пианино не найдено — подключите USB-кабель или играйте на клавиатуре: Z…/ и Q…P — белые, S D G H J и 2 3 5 6 7 9 0 — чёрные")}
          </span>
        )}
        {stats && (
          <span>
            Попадания {stats.hits} · Промахи {stats.misses} · Лишние {stats.wrong}
            {mode === "tempo" && stats.hits > 0
              ? ` · Смещение ${String(Math.round(stats.meanOffset * 1000))} мс`
              : ""}
          </span>
        )}
        {snapshot?.waiting && <span className="waiting">Жду ноту</span>}
        {loadError && <span className="error">{loadError}</span>}
        <span className="hint">Клик по ноте меняет палец</span>
      </div>

      <div className="staff-bar">
        {staffXml && (
          <>
            <span>Ноты</span>
            <button
              type="button"
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
            <span className="zoom">{Math.round(staffPrefs.zoom * 100)}%</span>
            <button
              type="button"
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
            <label className="check">
              <input
                type="checkbox"
                checked={!staffPrefs.singleLine}
                onChange={(event) => {
                  updateStaffPrefs({ singleLine: !event.target.checked });
                }}
              />
              По строкам
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={staffPrefs.follow}
                onChange={(event) => {
                  updateStaffPrefs({ follow: event.target.checked });
                }}
              />
              Следовать за игрой
            </label>
            {!staffPrefs.singleLine && (
              <select
                aria-label="Тактов в строке"
                value={staffPrefs.measuresPerLine}
                onChange={(event) => {
                  updateStaffPrefs({
                    measuresPerLine: Number(event.target.value) as StaffPrefs["measuresPerLine"]
                  });
                }}
              >
                <option value={0}>Тактов в строке: авто</option>
                <option value={2}>По 2 такта</option>
                <option value={4}>По 4 такта</option>
                <option value={8}>По 8 тактов</option>
              </select>
            )}
            {staffXml && (
              <select
                aria-label="Названия нот на нотах"
                value={staffPrefs.noteNames}
                onChange={(event) => {
                  updateStaffPrefs({ noteNames: event.target.value as StaffPrefs["noteNames"] });
                }}
              >
                <option value="off">Названия: нет</option>
                <option value="ru">Названия: до ре ми</option>
                <option value="en">Названия: C D E</option>
              </select>
            )}
            {staffXml && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={staffPrefs.chords}
                  onChange={(event) => {
                    updateStaffPrefs({ chords: event.target.checked });
                  }}
                />
                Аккорды
              </label>
            )}
            {sourceKey && (
              <span className="key-name">
                Тональность:{" "}
                <select
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
                </select>{" "}
                <button
                  type="button"
                  aria-label="На полтона ниже"
                  onClick={() => {
                    setTranspose((value) => Math.max(-11, value - 1));
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="На полтона выше"
                  onClick={() => {
                    setTranspose((value) => Math.min(11, value + 1));
                  }}
                >
                  +
                </button>
              </span>
            )}
            <span className="hint">Клик по нотам — играть с этого места</span>
          </>
        )}
        <button type="button" onClick={resetFingers} disabled={overrides.size === 0}>
          Сбросить пальцы
        </button>
      </div>

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
            </div>
            {comparing && (
              <div className="lane" ref={mirrorHostRef}>
                <span className="lane-label">Оригинал</span>
              </div>
            )}
          </div>
        </div>

        <nav className="side-rail" aria-label="Что показывать">
          <button
            type="button"
            className="rail-button"
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
            className="rail-button"
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
            className="rail-button"
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
            className="rail-button"
            aria-pressed={staffPrefs.hands}
            disabled={!staffPrefs.keys}
            title={staffPrefs.hands ? "Скрыть руки" : "Показать руки"}
            onClick={() => {
              updateStaffPrefs({ hands: !staffPrefs.hands });
            }}
          >
            <HandIcon />
          </button>
        </nav>
      </div>

      {snapshot?.finished && !listening && !comparing && stats && (
        <div className="result">
          <h2>Готово</h2>
          <p>Точность {Math.round(accuracy * 100)}%</p>
          {stats.troubleSpots.length > 0 && (
            <p>
              Трудные ноты:{" "}
              {stats.troubleSpots
                .map((spot) => `${noteLabel(spot.pitch)} (${String(spot.errors)})`)
                .join(", ")}
            </p>
          )}
          <button type="button" onClick={restart}>
            Ещё раз
          </button>
        </div>
      )}
    </div>
  );
}
