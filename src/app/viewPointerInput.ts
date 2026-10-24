import type { RefObject } from "react";
import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { KeyEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";

/** Screen keys share the trainer's input clock and have no external instrument voice. */
export function forwardViewPointer(
  trainerRef: RefObject<Trainer | null>,
  blockedRef: RefObject<boolean>
): (event: KeyEvent) => void {
  return (event) => {
    if (blockedRef.current && event.type === "down") return;
    if (!blockedRef.current) {
      if (event.type === "down") soundNoteOn(event.pitch);
      else soundNoteOff(event.pitch);
    }
    trainerRef.current?.key({
      ...event,
      timestamp: event.timestamp ?? performance.now(),
      source: "pointer",
      deviceId: "pointer"
    });
  };
}
