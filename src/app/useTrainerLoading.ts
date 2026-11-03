import { useLayoutEffect, useState, useRef, useSyncExternalStore, type RefObject } from "react";
import type { Hand } from "../fingering/fingering";
import type { Trainer } from "../practice/Trainer";
import type { PracticeOptions } from "../practice/session";
import type { Song } from "../song/song";
import type { FallingNotesView } from "../render/FallingNotesView";
import { TrainerPreparation } from "./TrainerPreparation";
import type { createTrainerSnapshotSource } from "./trainerSnapshots";

export interface LoadedTrainer {
  trainer: Trainer;
  sourceSong: Song;
  song?: Song;
  songKey?: string;
  options?: PracticeOptions;
  replaying?: { song: Song; speed: number; from: number; takeId: string };
  replayCount: number;
  listening?: boolean;
  listenOnly?: boolean;
  courseContext?: string | undefined;
  music?: boolean;
}
interface Options {
  readonly trainerReady: boolean;
  readonly waitForSound: () => Promise<boolean>;
  readonly trainerRef: RefObject<Trainer | null>;
  readonly viewRef: RefObject<FallingNotesView | null>;
  readonly loadedRef: RefObject<LoadedTrainer | null>;
  readonly assignmentRef: RefObject<{
    sourceSong: Song;
    courseContext: string | undefined;
    music: PracticeOptions | undefined;
    generation: number;
  }>;
  readonly snapshotSource: ReturnType<typeof createTrainerSnapshotSource>;
  readonly setListeningSource: (value: null) => void;
  readonly song: Song;
  readonly sourceSong: Song;
  readonly songKey: string;
  readonly courseContext: string | undefined;
  readonly music: PracticeOptions | undefined;
  readonly fixedPractice: boolean;
  readonly wordTyping: boolean;
  readonly practiceOptions: PracticeOptions;
  readonly replaying: LoadedTrainer["replaying"];
  readonly replayCount: number;
  readonly listening: boolean;
  readonly listenOnly: boolean;
  readonly startFromRef: RefObject<number | null>;
}
function onlySpeedChanged(previous: PracticeOptions, next: PracticeOptions): boolean {
  if (previous.speed === next.speed) return false;
  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next)
  ] as (keyof PracticeOptions)[]);
  for (const key of keys) {
    if (key === "speed" || previous[key] === next[key]) continue;
    const before = previous[key],
      after = next[key];
    if (!(before instanceof Set) || !(after instanceof Set)) return false;
    const left: ReadonlySet<unknown> = before,
      right: ReadonlySet<unknown> = after;
    if (left.size !== right.size || [...left].some((value) => !right.has(value))) return false;
  }
  return true;
}
export function useTrainerLoading(options: Options) {
  const sound = useRef(options.waitForSound);
  useLayoutEffect(() => {
    sound.current = options.waitForSound;
  });
  const [preparation] = useState(() => new TrainerPreparation());
  const [attempt, retry] = useState(0);
  const status = useSyncExternalStore(
    preparation.subscribe,
    preparation.getSnapshot,
    preparation.getSnapshot
  );
  const {
    trainerReady,
    trainerRef,
    viewRef,
    loadedRef,
    assignmentRef,
    snapshotSource,
    setListeningSource,
    song,
    sourceSong,
    songKey,
    courseContext,
    music,
    fixedPractice,
    wordTyping,
    practiceOptions,
    replaying,
    replayCount,
    listening,
    listenOnly,
    startFromRef
  } = options;
  useLayoutEffect(
    () => () => {
      preparation.stop();
    },
    [preparation]
  );
  useLayoutEffect(() => {
    const trainer = trainerRef.current;
    const view = viewRef.current;
    if (!trainer || !view) {
      preparation.stop();
      return;
    }
    if (
      assignmentRef.current.sourceSong !== sourceSong ||
      assignmentRef.current.courseContext !== courseContext ||
      assignmentRef.current.music !== music
    ) {
      assignmentRef.current = {
        sourceSong,
        courseContext,
        music,
        generation: assignmentRef.current.generation + 1
      };
      setListeningSource(null);
    }
    const apply = () => {
      trainer.observeTextNotes(wordTyping ? song.notes.map((note) => note.id) : []);
      const previous = loadedRef.current;
      if (replaying) {
        const preserve =
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
          songKey + ":replay",
          { preservePosition: preserve }
        );
        if (!preserve && replaying.from > 0) trainer.seek(replaying.from);
        return { preserve, autostart: !preserve };
      }
      const preserve =
        !music &&
        previous?.music !== true &&
        previous?.trainer === trainer &&
        previous.sourceSong === sourceSong &&
        !previous.replaying &&
        (courseContext === undefined || previous.courseContext === courseContext);
      loadedRef.current = {
        trainer,
        sourceSong,
        song,
        songKey,
        options: practiceOptions,
        replayCount,
        listening,
        listenOnly,
        courseContext,
        music: music !== undefined
      };
      trainer.load(song, practiceOptions, songKey, {
        preservePosition: preserve,
        ...(courseContext === undefined ? {} : { runContext: courseContext })
      });
      if (!fixedPractice && !preserve && startFromRef.current !== null)
        trainer.seek(startFromRef.current);
      return {
        preserve,
        autostart:
          listening &&
          (listenOnly ? preserve && !previous.listening : !preserve || !previous.listening)
      };
    };
    const prior = loadedRef.current;
    if (
      prior?.trainer === trainer &&
      prior.song === song &&
      prior.sourceSong === sourceSong &&
      prior.songKey === songKey &&
      !replaying &&
      !prior.replaying &&
      prior.listening === listening &&
      prior.listenOnly === listenOnly &&
      prior.courseContext === courseContext &&
      prior.music === (music !== undefined) &&
      prior.options &&
      onlySpeedChanged(prior.options, practiceOptions)
    ) {
      apply();
      return;
    }
    preparation.start({
      foreground: loadedRef.current !== null,
      prepareSound: () => sound.current(),
      playing: snapshotSource.getSnapshot()?.playing ?? false,
      pause: () => {
        trainer.onPreparationPause = preparation.cancel;
        trainer.setPreparing(true);
      },
      release: () => {
        trainer.setPreparing(false);
        trainer.onPreparationPause = undefined;
      },
      frame: (signal) => view.waitForFrame(signal),
      resume: () => {
        trainer.setPlaying(true);
      },
      apply
    });
  }, [
    preparation,
    attempt,
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
    music,
    fixedPractice,
    courseContext,
    trainerRef,
    viewRef,
    loadedRef,
    assignmentRef,
    snapshotSource,
    setListeningSource
  ]);
  return {
    status,
    wait: preparation.wait,
    wantsResume: preparation.wantsResume,
    cancel: preparation.cancel,
    retry: () => {
      retry((value) => value + 1);
    }
  };
}
