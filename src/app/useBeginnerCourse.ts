import { useEffect, useMemo, useRef, useState } from "react";
import { beginnerStage, type BeginnerSelection } from "../beginner/catalog";
import { generateBeginnerExercise } from "../beginner/generator";
import {
  emptyBeginnerProgress,
  mergeBeginnerProgress,
  nextBeginnerStage,
  type BeginnerProgress
} from "../beginner/progress";
import type { ReadingResult } from "../reading/types";
import { validBeginnerResult } from "../beginner/resultValidation";
import { beginnerRepository } from "./beginnerRepository";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";

/** Selection/history adapter; answers and musical time belong to the existing sessions. */
export function useBeginnerCourse() {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const revision = useAppSelector((s) => s.reading.selectionRevision);
  const [state, setState] = useState<{ progress: BeginnerProgress; revision: number; run: number }>(
    { progress: emptyBeginnerProgress(), revision: -1, run: 0 }
  );
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const edited = useRef(false);
  useEffect(() => {
    let live = true;
    void beginnerRepository
      .load()
      .then((progress) => {
        if (!live) return;
        if (edited.current)
          setState((current) => ({
            ...current,
            progress: mergeBeginnerProgress(progress, current.progress, true)
          }));
        else
          setState({
            progress,
            revision:
              store.getState().reading.activeCourse === null
                ? store.getState().reading.selectionRevision
                : -1,
            run: 0
          });
        setLoaded(true);
      })
      .catch(() => {
        if (live) {
          setError(true);
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [store]);
  const persist = (progress: BeginnerProgress, selectionChanged: boolean) => {
    void beginnerRepository
      .save(progress, selectionChanged)
      .then(() => {
        setError(false);
      })
      .catch(() => {
        setError(true);
      });
  };
  const selection = state.revision === revision ? state.progress.selection : null;
  const exercise = useMemo(
    () => (selection ? generateBeginnerExercise(selection) : null),
    [selection]
  );
  const choose = (value: BeginnerSelection) => {
    edited.current = true;
    dispatch(readingActions.exit());
    const progress = { ...state.progress, selection: value };
    setState({
      progress,
      revision: store.getState().reading.selectionRevision,
      run: state.run + 1
    });
    persist(progress, true);
  };
  const exit = () => {
    dispatch(readingActions.exit());
    edited.current = true;
    const progress = { ...state.progress, selection: null };
    setState({ ...state, progress, revision: -1 });
    persist(progress, true);
  };
  return {
    selection,
    exercise,
    active: selection !== null,
    stage: selection ? beginnerStage(selection.stageId) : null,
    intro: selection?.phase === "intro",
    independent: selection?.phase === "independent",
    completed: state.progress.completed,
    history: state.progress.history,
    loaded,
    error,
    start: (stageId: string) => {
      choose({ stageId, phase: "intro", seed: state.progress.selection?.seed ?? 1 });
    },
    guided: () => {
      if (selection) choose({ ...selection, phase: "guided" });
    },
    independentStart: () => {
      if (selection) choose({ ...selection, phase: "independent" });
    },
    next: () => {
      const id = nextBeginnerStage(state.progress.completed);
      if (id) choose({ stageId: id, phase: "intro", seed: 1 });
      else exit();
    },
    repeat: () => {
      if (selection) choose({ ...selection, seed: (selection.seed + 1) >>> 0 });
    },
    exit,
    retrySave: () => {
      persist(state.progress, true);
    },
    finish: (result: ReadingResult) => {
      if (!selection || state.revision !== store.getState().reading.selectionRevision) return;
      const entry = { selection, generatorVersion: 1 as const, result };
      if (!validBeginnerResult(entry)) return;
      const progress = mergeBeginnerProgress(
        state.progress,
        { ...state.progress, history: [entry] },
        false
      );
      setState({ ...state, progress });
      persist(progress, false);
    }
  };
}
export type BeginnerCourse = ReturnType<typeof useBeginnerCourse>;
