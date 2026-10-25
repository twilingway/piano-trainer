import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import type { MusicCourse } from "../musicLearning/types";
import type {
  MusicCourseCommand,
  MusicCoursePreferences,
  MusicCourseView
} from "../ui/musicCourseTypes";
import { MusicCourseController } from "./musicCourseController";
import type {
  MusicCourseCallbacks,
  MusicCourseConnection,
  MusicCourseControllerContract
} from "./musicCourseContracts";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";

const emptySubscribe = () => () => undefined;
const emptySnapshot = () => null;
const INACTIVE_VIEW: MusicCourseView = {
  course: "sight-reading",
  status: "preparation",
  taskKind: "sight-reading",
  ready: false,
  allReleased: true,
  canStart: false,
  canListen: false,
  canFinish: false,
  canNext: false,
  canHelp: false,
  showHelp: false
};

export function useMusicCourse() {
  const active = useAppSelector((state) => state.reading.activeCourse === "music-learning");
  const saved = useAppSelector((state) => state.reading.music);
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const course = saved.course;
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const [retry, setRetry] = useState(0);
  const retrySelection = useCallback(() => {
    const current = store.getState().reading.music;
    if (!current.course) return;
    dispatch(
      readingActions.musicSelected({
        course: current.course,
        seed: (current.seed + 1) >>> 0,
        purpose: current.purpose
      })
    );
  }, [store, dispatch]);
  const controller = useMemo<MusicCourseControllerContract | null>(() => {
    if (!active || !course) return null;
    const captured = store.getState().reading.music;
    const callbacks: MusicCourseCallbacks = {
      readSelection: () => store.getState().reading.music,
      save: (result) => {
        dispatch(readingActions.musicResultAdded(result));
      },
      saveIntegrated: (progress) => {
        dispatch(readingActions.musicIntegratedChanged(progress));
      },
      rememberSeed: (seed) => {
        dispatch(readingActions.musicMaterialPrepared({ seed, selectionRevision: revision }));
      },
      known: async () => {
        const values = await store.knownReadingFingerprints();
        if (values === null) throw new Error("Music history unavailable");
        return new Set(values);
      },
      claim: (fingerprint) => store.claimReadingMaterial(fingerprint),
      persistenceReady: () => store.readingPersistenceReady,
      retry: retrySelection,
      exit: () => {
        dispatch(readingActions.exit());
      }
    };
    return new MusicCourseController({ active, saved: captured, revision }, callbacks);
  }, [active, revision, course, store, dispatch, retrySelection]);
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
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    controller?.getSnapshot ?? emptySnapshot
  );
  const scene = snapshot?.scene ?? null;
  const policy = useMemo(
    () => (controller && scene ? controller.policy(scene.id) : null),
    [controller, scene]
  );
  const presentation = useMemo(
    () =>
      controller && scene
        ? {
            id: scene.id,
            onPresented(id: string, atMs: number) {
              if (currentRef.current === controller) controller.present(id, atMs);
            },
            onError(id: string) {
              if (currentRef.current === controller) controller.staffError(id);
            }
          }
        : undefined,
    [controller, scene]
  );
  const refreshConnection = useCallback(
    (connection: MusicCourseConnection) => {
      controller?.refreshConnection(connection);
    },
    [controller]
  );
  const cancel = useCallback(() => {
    controller?.cancel();
  }, [controller]);
  const command = useCallback(
    (value: MusicCourseCommand) => {
      if (value === "retry") setRetry((count) => count + 1);
      controller?.command(value);
    },
    [controller]
  );
  const choose = useCallback(
    (value: string, source: "keyboard" | "pointer") => {
      controller?.choose(value, source);
    },
    [controller]
  );
  const setPreferences = useCallback(
    (patch: Partial<MusicCoursePreferences>) => {
      dispatch(readingActions.musicPreferencesChanged(patch));
    },
    [dispatch]
  );
  const open = useCallback(
    (selected: MusicCourse) => {
      controller?.cancel();
      const current = store.getState().reading.music;
      const seed =
        selected === "integrated" &&
        current.integrated &&
        current.integrated.state.completedPhases.length < 7
          ? current.integrated.plan.seed
          : (current.seed + 1) >>> 0;
      dispatch(readingActions.musicSelected({ course: selected, seed, purpose: current.purpose }));
    },
    [controller, store, dispatch]
  );
  const preferences: MusicCoursePreferences = saved;
  return {
    active,
    scene,
    exercise: scene,
    ready: snapshot?.view.ready ?? false,
    source: saved.inputSource,
    view: snapshot?.view ?? INACTIVE_VIEW,
    options: active ? snapshot?.options : undefined,
    staffXml: snapshot?.staffXml,
    staffVisible: snapshot?.staffVisible ?? false,
    fingeringVisible: snapshot?.fingeringVisible ?? false,
    keysVisible: snapshot?.keysVisible ?? true,
    policy,
    presentation,
    retry,
    preferences,
    history: saved.history,
    integrated: saved.integrated,
    command,
    choose,
    setPreferences,
    open,
    cancel,
    refreshConnection
  };
}
export type MusicCourseHook = ReturnType<typeof useMusicCourse>;
