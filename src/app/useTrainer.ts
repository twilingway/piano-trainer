import { practiceActions } from "./practiceSlice";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { Hand } from "../fingering/fingering";
import type { PracticeMode, PracticeOptions } from "../practice/session";
import { Trainer } from "../practice/Trainer";
import type { Take } from "../recording/take";
import { FallingNotesView } from "../render/FallingNotesView";
import { choosableRoles, ROLE_HAND } from "../song/midiParts";
import type { PartRole } from "../song/midiParts";
import type { Song } from "../song/song";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import type { HandChoice } from "./playerPrefs";
import { createTrainerSnapshotSource } from "./trainerSnapshots";

const HANDS: Readonly<Record<HandChoice, readonly Hand[]>> = {
  right: ["right"],
  left: ["left"],
  both: ["right", "left"],
  listen: []
};

interface Options {
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
  compareSong,
  lastTake,
  replayCount,
  comparing,
  onReplay,
  gameOptions,
  ranked = false,
  wordTyping = false
}: Options) {
  const hostRef = useRef<HTMLDivElement>(null);
  const trainerRef = useRef<Trainer | null>(null);
  const loadedRef = useRef<{
    trainer: Trainer;
    sourceSong: Song;
    replaying?: { song: Song; speed: number; from: number; takeId: string };
    replayCount: number;
    listening?: boolean;
  } | null>(null);
  const viewRef = useRef<FallingNotesView | null>(null);
  const noteClickRef = useRef<(noteId: string) => void>(() => undefined);
  const takeHandlerRef = useRef<(take: Take) => void>(() => undefined);
  const [trainerReady, setTrainerReady] = useState(false);
  const [snapshotSource] = useState(createTrainerSnapshotSource);
  // How the player last played, brought back from the previous visit.
  const dispatch = useAppDispatch();
  const storedMode = useAppSelector((state) => state.preferences.player.mode);
  const setMode = (mode: PracticeMode) => {
    dispatch(preferencesActions.playerChanged({ mode }));
  };
  const mode = ranked ? "tempo" : storedMode;
  const storedHandChoice = useAppSelector((state) => state.preferences.player.handChoice);
  const updateHandChoice = (handChoice: HandChoice) => {
    dispatch(preferencesActions.playerChanged({ handChoice }));
  };
  const handChoice = ranked && storedHandChoice === "listen" ? "both" : storedHandChoice;
  /** A part picked by role; it belongs to the song (a new file drops it, a new key keeps it). */
  const chosenRole = useAppSelector((state) => state.practice.partRole);
  const partRoles = useMemo(
    () => (ranked || wordTyping ? [] : choosableRoles(song.parts)),
    [ranked, wordTyping, song.parts]
  );
  const partRole = chosenRole !== null && partRoles.includes(chosenRole) ? chosenRole : null;
  const setHandChoice = (choice: HandChoice) => {
    if (ranked && snapshotSource.getSnapshot()?.playing) return;
    dispatch(practiceActions.partRoleChosen(null));
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
    updateSpeed(Math.max(0.01, Math.min(1, next)));
  };
  const speed = ranked ? 1 : storedSpeed;
  const [listening, setListening] = useState(false);
  const metronome = useAppSelector((state) => state.preferences.player.metronome);
  const setMetronome = (metronome: boolean) => {
    dispatch(preferencesActions.playerChanged({ metronome }));
  };
  const storedAccompaniment = useAppSelector((state) => state.preferences.player.accompaniment);
  const setAccompaniment = (accompaniment: boolean) => {
    dispatch(preferencesActions.playerChanged({ accompaniment }));
  };
  // Ranked and the word mode keep their own fixed rules: the program always accompanies.
  const accompaniment = ranked || wordTyping || storedAccompaniment;
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
      trainerRef.current?.key({
        ...event,
        timestamp: performance.now(),
        source: "pointer",
        deviceId: "pointer"
      });
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
        snapshotSource.publish(next);
        // A listen-through ends by handing the song back for practice.
        if (next.finished) {
          if (loadedRef.current?.listening) loadedRef.current = null;
          setListening(false);
        }
      };
      trainerRef.current = trainer;
      setTrainerReady(true);
    });
    return () => {
      disposed = true;
      trainerRef.current?.destroy();
      trainerRef.current = null;
      viewRef.current = null;
      snapshotSource.publish(null);
      setTrainerReady(false);
      void mounted.then(() => {
        view.destroy();
      });
    };
  }, [snapshotSource]);

  useEffect(() => {
    // The view and the trainer outlive renders; they always call the latest handlers.
    noteClickRef.current = onNoteClick;
    takeHandlerRef.current = onTake;
  });

  const practiceOptions = useMemo<PracticeOptions>(() => {
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
    return { mode, hands, speed, accompaniment, ...gameOptions };
  }, [
    listening,
    mode,
    handChoice,
    partRole,
    song.parts,
    speed,
    accompaniment,
    gameOptions,
    wordTyping
  ]);

  // The take to play back while comparing. Outside comparing it stays undefined, so a take
  // just finished does not reload the song: the run ends where it ended, with its results.
  const replaying = useMemo(
    () =>
      compareSong && lastTake
        ? {
            song: compareSong,
            speed: lastTake.take.speed,
            from: lastTake.take.from,
            takeId: lastTake.take.id
          }
        : undefined,
    [compareSong, lastTake]
  );

  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    trainer.observeTextNotes(wordTyping ? song.notes.map((note) => note.id) : []);
    const previous = loadedRef.current;
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
      previous?.trainer === trainer && previous.sourceSong === sourceSong && !previous.replaying;
    loadedRef.current = { trainer, sourceSong, replayCount, listening };
    trainer.load(song, practiceOptions, songKey, { preservePosition });
    if (!preservePosition && startFromRef.current !== null) trainer.seek(startFromRef.current);
    if (listening && (!preservePosition || !previous.listening)) trainer.setPlaying(true);
    // replayCount is here only to play the comparison again.
  }, [
    trainerReady,
    song,
    sourceSong,
    practiceOptions,
    listening,
    songKey,
    startFromRef,
    replaying,
    replayCount,
    wordTyping
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
    if (snapshotSource.getSnapshot()?.finished) restart();
    trainerRef.current?.setPlaying(!(snapshotSource.getSnapshot()?.playing ?? false));
  };

  const toggleListening = async () => {
    if (ranked) return;
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
    const trainer = trainerRef.current;
    if (trainer) {
      loadedRef.current = listening ? null : { trainer, sourceSong, replayCount };
      trainer.load(song, practiceOptions, songKey);
    }
  };

  return {
    hostRef,
    trainerRef,
    viewRef,
    trainerReady,
    snapshotSource,
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
        ranked || wordTyping
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
