import { useState } from "react";

import { startPianoSound } from "../audio/pianoSound";

export type SoundState = "off" | "loading" | "ready";

/** The piano's samples: loaded on the first action that needs them. */
export function useSound() {
  const [sound, setSound] = useState<SoundState>("off");

  const ensureSound = async () => {
    if (sound !== "off") return;
    setSound("loading");
    try {
      await startPianoSound();
      setSound("ready");
    } catch {
      setSound("off");
    }
  };

  return { sound, ensureSound };
}
