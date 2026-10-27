import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import { nextIndependentRhythmSeed } from "../independentRhythm/generator";
import { lessonFingerCues, musicXmlWithLessonFingerCues } from "../reading/fingerCues";
import { lessonFingerLabel } from "../reading/fingerCueLabel";
import { useI18n } from "./useI18n";
import type { ReadingInputSource } from "../reading/types";
import type {
  IndependentRhythmConnection,
  IndependentRhythmSelection
} from "./independentRhythmController";
import { IndependentRhythmController } from "./independentRhythmController";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
export { useIndependentRhythmTrainer } from "./useIndependentRhythmTrainer";

function controllerFor(
  selection: IndependentRhythmSelection,
  save: ConstructorParameters<typeof IndependentRhythmController>[1]
) {
  return selection.active ? new IndependentRhythmController(selection, save) : null;
}
const emptySubscribe = () => () => undefined;
const emptySnapshot = () => null;
export function useIndependentRhythmCourse() {
  const { locale } = useI18n();
  const active = useAppSelector(
    (state) => state.reading.activeCourse === "independent-rhythm-reading"
  );
  const saved = useAppSelector((state) => state.reading.independentRhythm);
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const dispatch = useAppDispatch();
  const [intro, setIntro] = useState(false);
  const [retry, setRetry] = useState(0);
  const selection = useMemo(
    () => ({
      active,
      seed: saved.seed,
      version: saved.generatorVersion,
      source: saved.inputSource,
      revision
    }),
    [active, saved.seed, saved.generatorVersion, saved.inputSource, revision]
  );
  const save = useCallback(
    (result: Parameters<typeof readingActions.independentRhythmResultAdded>[0]) => {
      dispatch(readingActions.independentRhythmResultAdded(result));
    },
    [dispatch]
  );
  const controller = useMemo(() => controllerFor(selection, save), [selection, save]);
  const currentRef = useRef(controller);
  useLayoutEffect(() => {
    currentRef.current = controller;
  }, [controller]);
  useLayoutEffect(() => {
    controller?.activate();
    return () => {
      controller?.dispose();
    };
  }, [controller]);
  const state = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot
  );
  useLayoutEffect(() => {
    controller?.configureHints(saved.showKeyHints);
  }, [controller, saved.showKeyHints]);
  const scene = state?.scene ?? null;
  const cueAllowed =
    saved.showKeyHints && !!state?.ready && ["preparation", "passed"].includes(state.status);
  const prompt = useMemo(() => {
    if (!scene) return null;
    const cues = cueAllowed
      ? lessonFingerCues(scene.song.notes.filter((note) => note.start === 0))
      : [];
    return {
      musicXml: cues.length
        ? musicXmlWithLessonFingerCues(scene.musicXml, cues, scene.song.notes, (cue) =>
            lessonFingerLabel(cue, locale)
          )
        : scene.musicXml,
      beat: undefined
    };
  }, [scene, cueAllowed, locale]);
  const policy = useMemo(
    () => (controller && scene ? controller.policy(scene.id) : null),
    [controller, scene]
  );
  const presentation = useMemo(
    () =>
      controller && scene
        ? {
            id: scene.id,
            onPresented(id: string, at: number) {
              if (currentRef.current === controller) controller.present(id, at);
            },
            onError(id: string) {
              if (currentRef.current === controller) controller.staffError(id);
            }
          }
        : undefined,
    [controller, scene]
  );
  const connectionRef = useRef<IndependentRhythmConnection | null>(null);
  const refreshConnection = useCallback(
    (value: IndependentRhythmConnection) => {
      connectionRef.current = value;
      controller?.refreshConnection(value);
    },
    [controller]
  );
  const cancel = useCallback(() => {
    controller?.cancel();
  }, [controller]);
  const select = (seed: number) => {
    controller?.cancel();
    dispatch(
      readingActions.independentRhythmSelected({ seed, generatorVersion: saved.generatorVersion })
    );
  };
  return {
    active,
    exercise: controller?.exercise ?? null,
    scene,
    phase: state?.phase ?? "pulse",
    status: state?.status ?? "preparation",
    ready: state?.ready ?? false,
    allReleased: state?.allReleased ?? true,
    source: saved.inputSource,
    midiAvailable: state?.midiAvailable ?? false,
    midiChannel: state?.midiChannel ?? null,
    showKeyHints: saved.showKeyHints,
    countInBeat: state?.countInBeat,
    error: state?.error ?? null,
    result: state?.result ?? null,
    pulseSummary: state?.pulseSummary ?? null,
    history: saved.history,
    sourceFilter: saved.sourceFilter,
    policy,
    presentation,
    prompt,
    renderError: state?.error === "staff",
    retry,
    intro,
    setIntro,
    connectionRef,
    refreshConnection,
    cancel,
    start: () => {
      setIntro(false);
      select(saved.seed);
    },
    onStart: async () => {
      await controller?.start();
    },
    onRepeat: () => {
      controller?.repeat();
    },
    newSeries: () => {
      select(nextIndependentRhythmSeed(saved.seed));
    },
    exit: () => {
      controller?.cancel();
      dispatch(readingActions.exit());
    },
    setSource: (source: ReadingInputSource) => {
      controller?.cancel();
      dispatch(readingActions.independentRhythmSourceChanged(source));
    },
    setSourceFilter: (value: typeof saved.sourceFilter) => {
      dispatch(readingActions.independentRhythmSourceFilterChanged(value));
    },
    setShowKeyHints: (value: boolean) => {
      dispatch(readingActions.independentRhythmKeyHintsChanged(value));
    },
    onGoToRhythm: () => {
      controller?.cancel();
      dispatch(
        readingActions.rhythmSelected({ seed: saved.seed, bpm: 60, inputSource: saved.inputSource })
      );
    },
    onRetryStaff: () => {
      controller?.retryStaff();
      setRetry((value) => value + 1);
    }
  };
}
export type IndependentRhythmCourseController = ReturnType<typeof useIndependentRhythmCourse>;
