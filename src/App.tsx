import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { soundNoteOff, soundNoteOn, startPianoSound } from "./audio/pianoSound";
import type { Finger, Hand } from "./fingering/fingering";
import { listenToComputerKeyboard, listenToMidi, midiSupported } from "./input/midiInput";
import type { KeyEvent, MidiDevice } from "./input/midiInput";
import type { PracticeMode, PracticeOptions } from "./practice/session";
import { Trainer } from "./practice/Trainer";
import type { TrainerSnapshot } from "./practice/Trainer";
import { FallingNotesView } from "./render/FallingNotesView";
import { EXERCISES } from "./song/exercises";
import { songFromMidi } from "./song/midi";
import { musicXmlFromMxl, songFromMusicXml } from "./song/musicxml";
import { withFingering } from "./song/song";
import type { Song } from "./song/song";
import { Staff } from "./staff/Staff";

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

function firstExerciseSong(): Song {
  const exercise = EXERCISES[0];
  if (!exercise) throw new Error("No built-in exercises");
  return songFromMusicXml(exercise.musicXml, exercise.title);
}

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const trainerRef = useRef<Trainer | null>(null);
  const noteClickRef = useRef<(noteId: string) => void>(() => undefined);
  const [trainerReady, setTrainerReady] = useState(false);

  const [baseSong, setBaseSong] = useState<Song>(firstExerciseSong);
  const [overrides, setOverrides] = useState<Map<string, Finger>>(() => loadOverrides(baseSong));
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

  const song = useMemo(() => withFingering(baseSong, overrides), [baseSong, overrides]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new FallingNotesView();
    view.onNoteClick = (noteId) => {
      noteClickRef.current(noteId);
    };
    let disposed = false;
    const mounted = view.mount(host).then(() => {
      if (disposed) return;
      const trainer = new Trainer(view);
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
    const stopKeyboard = listenToComputerKeyboard((event) => {
      // The computer keyboard has no voice of its own, unlike the piano.
      if (event.type === "down") soundNoteOn(event.pitch);
      else soundNoteOff(event.pitch);
      onKey(event);
    });
    let stopMidi: (() => void) | undefined;
    let disposed = false;
    if (midiSupported()) {
      listenToMidi(onKey, setDevices).then(
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

  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    trainer.load(song, practiceOptions);
    if (listening) trainer.setPlaying(true);
  }, [trainerReady, song, practiceOptions, listening]);

  useEffect(() => {
    if (trainerRef.current) trainerRef.current.metronome = metronome;
  }, [trainerReady, metronome]);

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
      setBaseSong(loaded);
      setOverrides(loadOverrides(loaded));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  const openExercise = (id: string) => {
    const exercise = EXERCISES.find((item) => item.id === id);
    if (!exercise) return;
    const loaded = songFromMusicXml(exercise.musicXml, exercise.title);
    setBaseSong(loaded);
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
    setListening(false);
    trainerRef.current?.load(song, practiceOptions);
  };

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
          aria-label="Упражнение"
          value=""
          onChange={(event) => {
            openExercise(event.target.value);
          }}
        >
          <option value="" disabled>
            Упражнения…
          </option>
          {EXERCISES.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.title}
            </option>
          ))}
        </select>
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
      </header>

      <div className="status">
        <span>
          {devices.length > 0
            ? `Пианино: ${devices.map((device) => device.name).join(", ")}`
            : (midiError ??
              "Пианино не найдено — подключите USB-кабель или играйте на клавиатуре: Z…/ и Q…P — белые, S D G H J и 2 3 5 6 7 9 0 — чёрные")}
        </span>
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

      {song.musicXml && <Staff musicXml={song.musicXml} beat={snapshot?.beat ?? 0} />}

      <div className="lane" ref={hostRef} />

      {snapshot?.finished && !listening && stats && (
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
