import { useEffect, useEffectEvent } from "react";
import { isTypingTarget } from "../input/computerKeyboard";

interface Actions {
  readonly play: () => void;
  readonly blocked?: boolean;
}

/** Alt belongs to flat notes; transport keeps only Ctrl+Space. */
export function useShortcuts({ play, blocked = false }: Actions) {
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (blocked || event.defaultPrevented || event.repeat || isTypingTarget(event.target)) return;
    const pause = event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Space";
    if (pause) {
      event.preventDefault();
      play();
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
