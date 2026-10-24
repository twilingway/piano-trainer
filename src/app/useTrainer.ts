import { practiceActions } from "./practiceSlice";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Hand } from "../fingering/fingering";
import type { PracticeMode, PracticeOptions } from "../practice/session";
import { Trainer } from "../practice/Trainer";
import { INDEPENDENT_RHYTHM_PRACTICE_OPTIONS } from "../practice/independentRhythmPolicy";
import { RHYTHM_PRACTICE_OPTIONS } from "../practice/rhythmPolicy";
import { TWO_HAND_PRACTICE_OPTIONS } from "../practice/twoHandPolicy";
import { BASS_READING_PRACTICE_OPTIONS, READING_PRACTICE_OPTIONS } from "../practice/readingPolicy";
import type { RunCompletion } from "../practice/runCompletion";
import type { Take } from "../recording/take";
import { FallingNotesView } from "../render/FallingNotesView";
import { choosableRoles, ROLE_HAND } from "../song/midiParts";
import type { PartRole } from "../song/midiParts";
import type { Song } from "../song/song";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import type { HandChoice } from "./playerPrefs";
import { createTrainerSnapshotSource } from "./trainerSnapshots";
import { courseActions } from "./courseSlice";
import { useGraphicsAvailability } from "./useGraphicsAvailability";
import { forwardViewPointer } from "./viewPointerInput";

const HANDS: Readonly<Record<HandChoice, readonly Hand[]>> = {
  right: ["right"],
  left: ["left"],
  both: ["right", "left"],
  listen: []
};

interface Options {
  readonly pianoBlocked?: boolean;
  readonly reading?: boolean;
  readonly readingHand?: Hand | "both";
  readonly rhythm?: boolean;
  readonly independentRhythm?: boolean;
  readonly course?:
    | {
        readonly stage: "right" | "left" | "both";
        readonly context: string;
        readonly accompaniment: boolean;
        readonly onStage: (stage: "right" | "left" | "both") => void;
        readonly onAccompaniment: (value: boolean) => void;
      }
    | undefined;
  readonly onRunFinished?: ((result: RunCompletion) => void) | undefined;
  readonly wordTyping?: boolean;
  readonly gameOptions?: Pick<
    PracticeOptions,
    "difficulty" | "learningWindow" | "from" | "to" | "playable"
  >;
  readonly ranked?: boolean;
  readonly song: Song;
  /** Raw selection identity, shared by its transposed and arranged variants. */
  readonly sourceSong?: Song;
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
  sourceSong = song,
  songKey,
  startFromRef,
  ensureSound,
  onNoteClick,
  onTake,
  onRunFinished,
  course,
  compareSong,
  lastTake,
  replayCount,
  comparing,
  onReplay,
  gameOptions,
  ranked = false,
  reading = false,
  readingHand = "right",
  rhythm = false,
  independentRhythm = false,
  pianoBlocked = false,
  wordTyping = false
}: Options) {
  const hostRef = useRef<HTMLDivElement>(null);
  const trainerRef = useRef<Trainer | null>(null);
  const graphics = useGraphicsAvailability(trainerRef);
  const graphicsGeneration = graphics.generation;
  const graphicsFail = graphics.fail;
  const graphicsAttach = graphics.attach;
  const graphicsAvailable = graphics.available;
  const loadedRef = useRef<{
    trainer: Trainer;
    sourceSong: Song;
    replaying?: { song: Song; speed: number; from: number; takeId: string };
    replayCount: number;
    listening?: boolean;
    listenOnly?: boolean;
    courseContext?: string | undefined;
  } | null>(null);
  const viewRef = useRef<FallingNotesView | null>(null);
  const pianoBlockedRef = useRef(pianoBlocked);
  useLayoutEffect(() => {
    pianoBlockedRef.current = pianoBlocked;
  }, [pianoBlocked]);
  const noteClickRef = useRef<(noteId: string) => void>(() => undefined);
  const takeHandlerRef = useRef<(take: Take) => void>(() => undefined);
  const finishHandlerRef = useRef<((result: RunCompletion) => void) | undefined>(undefined);
  const courseContext = course?.context;
  const assignmentRef = useRef({ sourceSong, courseContext, generation: 0 });
  const [listeningSource, setListeningSource] = useState<{
    song: Song;
    courseContext: string | undefined;
  } | null>(null);
  const storedListenOnly = useAppSelector((state) => state.course.listenOnly);
  const listenOnly = !!course && storedListenOnly;
  const temporaryListening =
    listeningSource?.song === sourceSong && listeningSource.courseContext === courseContext;
  const listening = listenOnly || temporaryListening;
  const setListening = (next: boolean | ((current: boolean) => boolean)) => {
    setListeningSource((previous) =>
      (
        typeof next === "function"
          ? next(previous?.song === sourceSong && previous.courseContext === courseContext)
          : next
      )
        ? { song: sourceSong, courseContext }
        : null
    );
  };
  const [trainerReady, setTrainerReady] = useState(false);
  const [snapshotSource] = useState(createTrainerSnapshotSource);
  // How the player last played, brought back from the previous visit.
  const dispatch = useAppDispatch();
  const storedMode = useAppSelector((state) => state.preferences.player.mode);
  const setMode = (mode: PracticeMode) => {
    if (reading || rhythm || independentRhythm) return;
    dispatch(preferencesActions.playerChanged({ mode }));
  };
  const mode = reading ? "wait" : rhythm || independentRhythm || ranked ? "tempo" : storedMode;
  const storedHandChoice = useAppSelector((state) => state.preferences.player.handChoice);
  const updateHandChoice = (handChoice: HandChoice) => {
    if (reading || rhythm || independentRhythm) return;
    if (course) {
      dispatch(courseActions.listenOnlyChanged(handChoice === "listen"));
      setListening(false);
      if (handChoice !== "listen") course.onStage(handChoice);
      return;
    }
    dispatch(preferencesActions.playerChanged({ handChoice }));
  };
  const handChoice = independentRhythm
    ? "both"
    : reading || rhythm
      ? reading
        ? readingHand
        : "right"
      : course
        ? listening
          ? "listen"
          : course.stage
        : ranked && storedHandChoice === "listen"
          ? "both"
          : storedHandChoice;
  /** A part picked by role; it belongs to the song (a new file drops it, a new key keeps it). */
  const chosenRole = useAppSelector((state) => state.practice.partRole);
  const partRoles = useMemo(
    () =>
      reading || rhythm || independentRhythm || ranked || wordTyping || courseContext !== undefined
        ? []
        : choosableRoles(song.parts),
    [reading, rhythm, independentRhythm, ranked, wordTyping, courseContext, song.parts]
  );
  const partRole = chosenRole !== null && partRoles.includes(chosenRole) ? chosenRole : null;
  const setHandChoice = (choice: HandChoice) => {
    if (reading || rhythm || independentRhythm) return;
    if (ranked && snapshotSource.getSnapshot()?.playing) return;
    if (!course) dispatch(practiceActions.partRoleChosen(null));
    updateHandChoice(choice);
  };
  const choosePart = (role: PartRole) => {
    dispatch(practiceActions.partRoleChosen(role));
  };
  const storedSpeed = useAppSelector((state) => state.preferences.player.speed);
  const updateSpeed = (speed: number) => {
    dispatch(preferencesActions.playerChanged({ speed }));
  };
  const setSpeed = (next: number) => {
    if (reading || rhythm || independentRhythm) return;
    updateSpeed(Math.max(0.01, Math.min(1, next)));
  };
  const speed = reading || rhythm || independentRhythm || ranked ? 1 : storedSpeed;
  const storedMetronome = useAppSelector((state) => state.preferences.player.metronome);
  const metronome = independentRhythm || rhythm || (!reading && storedMetronome);
  const setMetronome = (metronome: boolean) => {
    if (reading || rhythm || independentRhythm) return;
    dispatch(preferencesActions.playerChanged({ metronome }));
  };
  const storedAccompaniment = useAppSelector((state) => state.preferences.player.accompaniment);
  const setAccompaniment = (accompaniment: boolean) => {
    if (reading || rhythm || independentRhythm) return;
    if (course) {
      course.onAccompaniment(accompaniment);
      return;
    }
    dispatch(preferencesActions.playerChanged({ accompaniment }));
  };
  // Ranked and the word mode keep their own fixed rules: the program always accompanies.
  const accompaniment =
    !reading &&
    !rhythm &&
    !independentRhythm &&
    (ranked || wordTyping || (course?.accompaniment ?? storedAccompaniment));
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const detachGraphics = graphicsAttach(host);
    const view = new FallingNotesView();
    view.onNoteClick = (noteId) => {
      noteClickRef.current(noteId);
    };
    view.onKeyPointer = forwardViewPointer(trainerRef, pianoBlockedRef);
    view.onInputCancel = (resetAll) => trainerRef.current?.cancelInput(resetAll);
    let disposed = false;
    const mounted = view
      .mount(host)
      .then(() => {
        if (disposed) return;
        viewRef.current = view;
        const trainer = new Trainer(view);
        trainer.setGraphicsAvailable(graphicsAvailable());
        trainer.onTake = (take) => {
          takeHandlerRef.current(take);
        };
        trainer.onRunFinished = (result) => {
          finishHandlerRef.current?.(result);
        };
        trainer.onSnapshot = (next) => {
          snapshotSource.publish(next);
          // A temporary listen-through hands the song back for practice.
          if (next.finished && !loadedRef.current?.listenOnly) {
            if (loadedRef.current?.listening) loadedRef.current = null;
            setListeningSource(null);
          }
        };
        trainerRef.current = trainer;
        setTrainerReady(true);
      })
      .catch((error: unknown) => {
        if (!disposed) graphicsFail(error);
      });
    return () => {
      disposed = true;
      detachGraphics();
      assignmentRef.current.generation++;
      trainerRef.current?.destroy();
      trainerRef.current = null;
      viewRef.current = null;
      snapshotSource.publish(null);
      setTrainerReady(false);
      void mounted.then(() => {
        view.destroy();
      });
    };
  }, [snapshotSource, graphicsGeneration, graphicsFail, graphicsAttach, graphicsAvailable]);

  useEffect(() => {
    // The view and the trainer outlive renders; they always call the latest handlers.
    noteClickRef.current = onNoteClick;
    takeHandlerRef.current = onTake;
    finishHandlerRef.current = onRunFinished;
  });

  const practiceOptions = useMemo<PracticeOptions>(() => {
    if (independentRhythm) return INDEPENDENT_RHYTHM_PRACTICE_OPTIONS;
    if (rhythm) return RHYTHM_PRACTICE_OPTIONS;
    if (reading)
      return readingHand === "both"
        ? TWO_HAND_PRACTICE_OPTIONS
        : readingHand === "left"
          ? BASS_READING_PRACTICE_OPTIONS
          : READING_PRACTICE_OPTIONS;
    if (listening) return { mode: "tempo", hands: new Set<Hand>(), speed };
    if (partRole) {
      const parts = (song.parts ?? []).filter((part) => part.role === partRole);
      return {
        mode,
        hands: new Set([ROLE_HAND[partRole]]),
        parts: new Set(parts.map((part) => part.id)),
        speed,
        accompaniment,
        ...gameOptions
      };
    }
    const hands = new Set(HANDS[wordTyping ? "right" : handChoice]);
    return { mode, hands, speed, accompaniment, ...gameOptions, noteResult: !wordTyping };
  }, [
    listening,
    mode,
    handChoice,
    partRole,
    song.parts,
    speed,
    accompaniment,
    gameOptions,
    wordTyping,
    reading,
    readingHand,
    rhythm,
    independentRhythm
  ]);

  // The take to play back while comparing. Outside comparing it stays undefined, so a take
  // just finished does not reload the song: the run ends where it ended, with its results.
  const replaying = useMemo(
    () =>
      !reading && !rhythm && !independentRhythm && compareSong && lastTake
        ? {
            song: compareSong,
            speed: lastTake.take.speed,
            from: lastTake.take.from,
            takeId: lastTake.take.id
          }
        : undefined,
    [reading, rhythm, independentRhythm, compareSong, lastTake]
  );

  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    trainer.observeTextNotes(wordTyping ? song.notes.map((note) => note.id) : []);
    const previous = loadedRef.current;
    if (
      assignmentRef.current.sourceSong !== sourceSong ||
      assignmentRef.current.courseContext !== courseContext
    ) {
      assignmentRef.current = {
        sourceSong,
        courseContext,
        generation: assignmentRef.current.generation + 1
      };
      setListeningSource(null);
    }
    if (replaying) {
      const preservePosition =
        previous?.trainer === trainer &&
        previous.sourceSong === sourceSong &&
        previous.replaying?.takeId === replaying.takeId &&
        previous.replaying.from === replaying.from &&
        previous.replaying.speed === replaying.speed &&
        previous.replayCount === replayCount;
      loadedRef.current = { trainer, sourceSong, replaying, replayCount };
      trainer.load(
        replaying.song,
        { mode: "tempo", hands: new Set<Hand>(), speed: replaying.speed },
        `${songKey}:replay`,
        { preservePosition }
      );
      if (!preservePosition) {
        if (replaying.from > 0) trainer.seek(replaying.from);
        trainer.setPlaying(true);
      }
      return;
    }
    const preservePosition =
      previous?.trainer === trainer &&
      previous.sourceSong === sourceSong &&
      !previous.replaying &&
      (courseContext === undefined || previous.courseContext === courseContext);
    loadedRef.current = { trainer, sourceSong, replayCount, listening, listenOnly, courseContext };
    trainer.load(song, practiceOptions, songKey, {
      preservePosition,
      ...(courseContext === undefined ? {} : { runContext: courseContext })
    });
    if (
      !reading &&
      !rhythm &&
      !independentRhythm &&
      !preservePosition &&
      startFromRef.current !== null
    )
      trainer.seek(startFromRef.current);
    if (
      listening &&
      (listenOnly
        ? preservePosition && !previous.listening
        : !preservePosition || !previous.listening)
    )
      trainer.setPlaying(true);
    // replayCount is here only to play the comparison again.
  }, [
    trainerReady,
    song,
    sourceSong,
    practiceOptions,
    listening,
    listenOnly,
    songKey,
    startFromRef,
    replaying,
    replayCount,
    wordTyping,
    reading,
    rhythm,
    independentRhythm,
    courseContext
  ]);

  useEffect(() => {
    if (trainerRef.current) trainerRef.current.metronome = metronome;
  }, [trainerReady, metronome]);

  // Read by the staff every frame; stable, so the staff never re-subscribes.
  const liveBeat = useCallback(() => trainerRef.current?.quarters() ?? 0, []);

  /** Seek to the first note at or after the beat, preserving play or pause. */
  const seekToBeat = (beat: number) => {
    if (reading || rhythm || independentRhythm) return;
    const target = song.notes.find((note) => note.startBeat >= beat - 1e-6);
    const trainer = trainerRef.current;
    if (!target || !trainer) return;
    startFromRef.current = target.start;
    trainer.seek(target.start);
  };

  const togglePlay = async () => {
    if (graphics.blocked()) return;
    const generation = assignmentRef.current.generation,
      trainer = trainerRef.current;
    await ensureSound();
    if (generation !== assignmentRef.current.generation || trainer !== trainerRef.current) return;
    const state = snapshotSource.getSnapshot();
    if (state?.finished && !state.playing) restart();
    trainer?.setPlaying(!(state?.playing ?? false));
  };

  const toggleListening = async () => {
    if (graphics.blocked()) return;
    if (reading || rhythm || independentRhythm) return;
    if (ranked) return;
    if (listenOnly) {
      trainerRef.current?.setPlaying(false);
      return;
    }
    const generation = assignmentRef.current.generation;
    await ensureSound();
    const current = loadedRef.current;
    if (
      generation !== assignmentRef.current.generation ||
      current?.sourceSong !== sourceSong ||
      current.courseContext !== courseContext
    )
      return;
    setListening((current) => !current);
  };

  const restart = () => {
    if (comparing) {
      onReplay();
      return;
    }
    setListening(false);
    startFromRef.current = null;
    const trainer = trainerRef.current;
    if (trainer) {
      loadedRef.current =
        listening && !listenOnly
          ? null
          : { trainer, sourceSong, replayCount, listening: listenOnly, listenOnly, courseContext };
      if (courseContext === undefined) trainer.load(song, practiceOptions, songKey);
      else trainer.load(song, practiceOptions, songKey, { runContext: courseContext });
    }
  };

  return {
    hostRef,
    trainerRef,
    viewRef,
    trainerReady,
    snapshotSource,
    graphics,
    mode,
    setMode,
    handChoice,
    setHandChoice,
    /** Who plays, for the hand selects: the hand, or a part of the song, and the accompaniment. */
    playChoice: {
      // A part is played by its hand, even when the hand choice was «listen».
      hands: partRole ? ROLE_HAND[partRole] : handChoice,
      onHands: setHandChoice,
      // Ranked and the word mode keep their own rules: no parts, no accompaniment switch.
      parts:
        reading || rhythm || independentRhythm || ranked || wordTyping
          ? undefined
          : {
              roles: partRoles,
              role: partRole,
              onRole: choosePart,
              accompaniment,
              onAccompaniment: setAccompaniment
            }
    },
    /** The hands the player plays in the run: none while listening. */
    playerHands: practiceOptions.hands,
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
