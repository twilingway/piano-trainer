import { useRef, useState } from "react";

import { pianoSoundReady, startPianoSound } from "../audio/pianoSound";

export type SoundState = "off" | "loading" | "ready" | "error";

/** The piano's samples: loaded on the first action that needs them. */
export function useSound() {
  const [sound, setSound] = useState<SoundState>("off");
  const pending = useRef<Promise<boolean> | null>(null);

  const ensureIntervalSound = (): Promise<boolean> => {
    if (pending.current) return pending.current;
    setSound("loading");
    const request = startPianoSound()
      .then(() => {
        if (!pianoSoundReady([60, 67])) throw new Error("Piano sound is unavailable");
        setSound("ready");
        return true;
      })
      .catch(() => {
        setSound("error");
        return false;
      })
      .finally(() => {
        pending.current = null;
      });
    pending.current = request;
    return request;
  };

  const ensureSound = async (): Promise<void> => {
    await ensureIntervalSound();
  };

  return { sound, ensureSound, ensureIntervalSound };
}
