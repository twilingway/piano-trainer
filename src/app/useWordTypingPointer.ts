import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import { WordKeyboardState } from "../input/wordKeyboardState";
import type { Trainer } from "../practice/Trainer";
import { inputTokenId } from "../wordTyping/inputTokens";
import type { InputToken, WordTypingResult } from "../wordTyping/types";

export function useWordTypingPointer(
  trainerRef: RefObject<Trainer | null>,
  result: WordTypingResult | undefined,
  enabled: boolean,
  blocked: boolean
) {
  const state = useRef(new WordKeyboardState());
  const emit = (actions: ReturnType<WordKeyboardState["clear"]>) => {
    for (const action of actions) {
      if (action.type === "pedal") continue;
      if (action.type === "down") soundNoteOn(action.pitch);
      else soundNoteOff(action.pitch);
      trainerRef.current?.key({
        ...action,
        velocity: 90,
        timestamp: performance.now(),
        source: "pointer",
        deviceId: "pointer"
      });
    }
  };
  useEffect(() => {
    const holds = state.current;
    const clear = () => {
      for (const action of holds.clear()) {
        if (action.type === "pedal") continue;
        soundNoteOff(action.pitch);
        trainerRef.current?.key({
          ...action,
          velocity: 90,
          timestamp: performance.now(),
          source: "pointer",
          deviceId: "pointer"
        });
      }
    };
    window.addEventListener("blur", clear);
    const visibility = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [trainerRef, result, enabled, blocked]);
  return {
    press: (token: InputToken) => {
      if (!enabled || blocked) return;
      const id = inputTokenId(token);
      const pitch = result?.tokenToPitch[id];
      if (pitch !== undefined) emit(state.current.press(id, pitch));
    },
    release: (token: InputToken) => {
      emit(state.current.release(inputTokenId(token)));
    }
  };
}
