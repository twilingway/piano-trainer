import { useCallback, useRef, useState } from "react";
import {
  balancedReadingPlan,
  buildAdaptivePlan,
  chooseNewReadingCheck
} from "../reading/adaptation";
import { nextReadingSeed } from "../reading/generator";
import type { ReadingPurpose, ReadingSourceFilter } from "../reading/progressTypes";
import type { ReadingTask } from "../reading/types";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppStore } from "./storeHooks";

/** Selecting a series freezes its plan; viewing the profile never mutates it. */
export function useReadingGeneration(onSelected: () => void) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const [generationError, setGenerationError] = useState(false);
  const [failedPurpose, setFailedPurpose] = useState<ReadingPurpose>("check");
  const request = useRef(0);
  const select = useCallback(
    async (purpose: ReadingPurpose) => {
      const requestId = ++request.current;
      const revision = store.getState().reading.selectionRevision;
      const task: ReadingTask =
        purpose === "adaptive" ? "notes" : purpose === "delayed-check" ? "check" : purpose;
      if (task === "check") {
        const fingerprints = await store.knownReadingFingerprints();
        if (
          request.current !== requestId ||
          store.getState().reading.selectionRevision !== revision
        )
          return false;
        const state = store.getState().reading;
        const choice =
          fingerprints &&
          chooseNewReadingCheck(
            state.seed,
            fingerprints,
            purpose === "delayed-check" ? "delayed-check" : "check",
            state.sourceFilter
          );
        if (!choice) {
          setFailedPurpose(purpose);
          setGenerationError(true);
          return false;
        }
        dispatch(readingActions.select({ task, seed: choice.seed, plan: choice.plan }));
      } else {
        const state = store.getState().reading;
        const plan =
          purpose === "adaptive"
            ? buildAdaptivePlan(state.profile, state.sourceFilter, Date.now())
            : balancedReadingPlan(task, purpose, state.sourceFilter);
        dispatch(readingActions.select({ task, seed: nextReadingSeed(state.seed, task), plan }));
      }
      setGenerationError(false);
      onSelected();
      return true;
    },
    [store, dispatch, onSelected]
  );
  return {
    select,
    start: (task: ReadingTask) => {
      return select(task);
    },
    startAdaptive: () => {
      return select("adaptive");
    },
    startDelayed: () => {
      return select("delayed-check");
    },
    generationError,
    retryGeneration: () => {
      void select(failedPurpose);
    },
    setSourceFilter: (source: ReadingSourceFilter) =>
      dispatch(readingActions.sourceFilterChanged(source))
  };
}
