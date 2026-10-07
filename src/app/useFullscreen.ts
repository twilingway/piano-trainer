import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppStore } from "./storeHooks";

/** Fullscreen requires a user gesture; a saved preference waits for the next mobile button click. */
export function useFullscreen() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const [error, setError] = useState<string | null>(null);
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const pending = useRef(false);

  useEffect(() => {
    const onChange = () => {
      const enabled = Boolean(document.fullscreenElement);
      setActive(enabled);
      dispatch(preferencesActions.fullscreenChanged(enabled));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [dispatch]);

  const enter = async (explicit: boolean) => {
    if (pending.current || document.fullscreenElement) return;
    if (!document.fullscreenEnabled) {
      if (explicit) setError("Браузер не поддерживает полноэкранный режим.");
      return;
    }
    dispatch(preferencesActions.fullscreenChanged(true));
    pending.current = true;
    setError(null);
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      if (explicit) setError("Браузер не разрешил открыть игру на весь экран.");
    } finally {
      pending.current = false;
    }
  };

  const toggle = async () => {
    if (!document.fullscreenElement) {
      await enter(true);
      return;
    }
    dispatch(preferencesActions.fullscreenChanged(false));
    setError(null);
    try {
      await document.exitFullscreen();
    } catch {
      setError("Браузер не разрешил выйти из полноэкранного режима.");
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (
      !store.getState().preferences.fullscreen ||
      !window.matchMedia("(pointer: coarse), (max-width: 640px)").matches
    )
      return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-fullscreen-toggle]")) return;
    // Let the button use the gesture first (audio or a file picker can need it too).
    if (target.closest("button, summary, [role='button']")) queueMicrotask(() => void enter(false));
  };

  return { active, error, toggle, onClickCapture };
}
