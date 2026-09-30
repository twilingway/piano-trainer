import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { Hand } from "../fingering/fingering";
import type { PracticeMode, PracticeOptions } from "../practice/session";
import { Trainer } from "../practice/Trainer";
import type { TrainerSnapshot } from "../practice/Trainer";
import type { Take } from "../recording/take";
import { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";

type HandChoice = "right" | "left" | "both" | "listen";

const HANDS: Readonly<Record<HandChoice, readonly Hand[]>> = {
  right: ["right"],
  left: ["left"],
  both: ["right", "left"],
  listen: []
};

interface Options {
  readonly song: Song;
  /** The song's key for the trainer's per-song state. */
  readonly songKey: string;
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  readonly startFromRef: RefObject<number | null>;
  readonly ensureSound: () => Promise<void>;
  /** A click on a falling note. */
  readonly onNoteClick: (noteId: string) => void;
  /** A take the trainer finished recording. */
  readonly onTake: (take: Take) => void;
  /** While comparing: the take as a song, and the take it came from. */
  readonly compareSong: Song | undefined;
  readonly lastTake: { readonly take: Take } | null;
  /** Bumped to play the comparison again from its start. */
  readonly replayCount: number;
  readonly comparing: boolean;
  readonly onReplay: () => void;
}

/**
 * The trainer and its Pixi view: created once, outside React. React loads the
 * song and the practice options into it and reads its throttled snapshots.
 */
export function useTrainer({
  song,
  songKey,
  startFromRef,
  ensureSound,
  onNoteClick,
  onTake,
  compareSong,
  lastTake,
  replayCount,
  comparing,
  onReplay
}: Options) {
  const hostRef = useRef<HTMLDivElement>(null);
  const trainerRef = useRef<Trainer | null>(null);
  const viewRef = useRef<FallingNotesView | null>(null);
  const noteClickRef = useRef<(noteId: string) => void>(() => undefined);
  const takeHandlerRef = useRef<(take: Take) => void>(() => undefined);
  const [trainerReady, setTrainerReady] = useState(false);
  const [snapshot, setSnapshot] = useState<TrainerSnapshot | null>(null);
  const [mode, setMode] = useState<PracticeMode>("wait");
  const [handChoice, setHandChoice] = useState<HandChoice>("right");
  const [speed, setSpeed] = useState(0.75);
  const [listening, setListening] = useState(false);
  const [metronome, setMetronome] = useState(true);

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
    // The view and the trainer outlive renders; they always call the latest handlers.
    noteClickRef.current = onNoteClick;
    takeHandlerRef.current = onTake;
  });

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
    if (compareSong && lastTake) {
      trainer.load(
        compareSong,
        { mode: "tempo", hands: new Set<Hand>(), speed: lastTake.take.speed },
        `${songKey}:replay`
      );
      if (lastTake.take.from > 0) trainer.seek(lastTake.take.from);
      trainer.setPlaying(true);
      return;
    }
    trainer.load(song, practiceOptions, songKey);
    if (startFromRef.current !== null) trainer.seek(startFromRef.current);
    if (listening) trainer.setPlaying(true);
    // replayCount is here only to play the comparison again.
  }, [
    trainerReady,
    song,
    practiceOptions,
    listening,
    songKey,
    startFromRef,
    compareSong,
    lastTake,
    replayCount
  ]);

  useEffect(() => {
    if (trainerRef.current) trainerRef.current.metronome = metronome;
  }, [trainerReady, metronome]);

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
      onReplay();
      return;
    }
    setListening(false);
    startFromRef.current = null;
    trainerRef.current?.load(song, practiceOptions, songKey);
  };

  return {
    hostRef,
    trainerRef,
    viewRef,
    trainerReady,
    snapshot,
    mode,
    setMode,
    handChoice,
    setHandChoice,
    speed,
    setSpeed,
    listening,
    metronome,
    setMetronome,
    liveBeat,
    seekToBeat,
    togglePlay,
    toggleListening,
    restart
  };
}
