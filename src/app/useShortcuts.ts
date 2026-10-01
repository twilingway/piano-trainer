import { useEffect, useEffectEvent } from "react";

interface Actions {
  readonly play: () => void;
  readonly startOver: () => void;
  readonly openLibrary: () => void;
}

/** Keys play notes: the shortcuts take Ctrl or Alt, never a lone key or the space bar. */
export function useShortcuts({ play, startOver, openLibrary }: Actions) {
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    const pause =
      (event.ctrlKey && event.code === "Space") || (event.altKey && event.code === "KeyP");
    if (pause) {
      event.preventDefault();
      play();
    } else if (event.altKey && event.code === "KeyR") {
      event.preventDefault();
      startOver();
    } else if (event.altKey && event.code === "KeyL") {
      event.preventDefault();
      openLibrary();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onShortcut(event);
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);
}
