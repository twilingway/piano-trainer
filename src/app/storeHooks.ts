import { useCallback, type SetStateAction } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import type { Action } from "@reduxjs/toolkit";
import type { AppDispatch, AppStore, RootState } from "./store";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/** Resolve updates against the live store, then dispatch only a serializable value. */
export function usePreferenceState<T>(
  selector: (state: RootState) => T,
  action: (value: T) => Action
) {
  const store = useAppStore();
  const value = useAppSelector(selector);
  const setValue = useCallback(
    (change: SetStateAction<T>) => {
      const next =
        typeof change === "function"
          ? (change as (previous: T) => T)(selector(store.getState()))
          : change;
      store.dispatch(action(next));
    },
    [store, selector, action]
  );
  return [value, setValue] as const;
}
