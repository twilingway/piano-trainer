import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

const PREF_KEY = "fullscreen-preferred";

function loadPreference(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

function savePreference(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
}

/** Fullscreen requires a user gesture; a saved preference waits for the next mobile button click. */
export function useFullscreen() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  const [error, setError] = useState<string | null>(null);
  const preferred = useRef(loadPreference());
  const pending = useRef(false);

  useEffect(() => {
    const onChange = () => {
      const enabled = Boolean(document.fullscreenElement);
      setActive(enabled);
      preferred.current = enabled;
      savePreference(enabled);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const enter = async (explicit: boolean) => {
    if (pending.current || document.fullscreenElement) return;
    if (!document.fullscreenEnabled) {
      if (explicit) setError("Этот браузер не поддерживает полный экран для игры.");
      return;
    }
    preferred.current = true;
    savePreference(true);
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
    preferred.current = false;
    savePreference(false);
    setError(null);
    try {
      await document.exitFullscreen();
    } catch {
      setError("Браузер не разрешил свернуть полный экран.");
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!preferred.current || !window.matchMedia("(pointer: coarse), (max-width: 640px)").matches)
      return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-fullscreen-toggle]")) return;
    // Let the button use the gesture first (audio or a file picker can need it too).
    if (target.closest("button, summary, [role='button']")) queueMicrotask(() => void enter(false));
  };

  return { active, error, toggle, onClickCapture };
}
