import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { pianoSoundReady, startPianoSound } from "../audio/pianoSound";
import {
  getPianoSampleProgress,
  loadPianoSamples,
  subscribePianoSampleProgress
} from "../audio/pianoSamples";

export type SoundState = "off" | "loading" | "ready" | "error";
export function useSound() {
  const progress = useSyncExternalStore(
    subscribePianoSampleProgress,
    getPianoSampleProgress,
    getPianoSampleProgress
  );
  const [sound, setSound] = useState<SoundState>("off");
  const [foreground, setForeground] = useState(false);
  const pending = useRef<{
    promise: Promise<boolean>;
    finish: (ready: boolean) => void;
    kind: "gesture" | "samples";
  } | null>(null);
  const generation = useRef(0);
  useLayoutEffect(
    () => () => {
      generation.current++;
      pending.current?.finish(false);
      pending.current = null;
    },
    []
  );
  const cancel = () => {
    generation.current++;
    pending.current?.finish(false);
    pending.current = null;
    setForeground(false);
    setSound(pianoSoundReady([60, 67]) ? "ready" : "off");
  };
  const prepare = (start: () => Promise<void>, kind: "gesture" | "samples"): Promise<boolean> => {
    if (pending.current) return pending.current.promise;
    const token = ++generation.current;
    let finish!: (ready: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    pending.current = { promise, finish, kind };
    setForeground(true);
    setSound("loading");
    let request: Promise<void>;
    try {
      request = start();
    } catch {
      request = Promise.reject(new Error("Piano sound is unavailable"));
    }
    void request
      .then(() => {
        if (!pianoSoundReady([60, 67])) throw new Error("Piano sound is unavailable");
        if (token !== generation.current) return;
        setSound("ready");
        setForeground(false);
        pending.current = null;
        finish(true);
      })
      .catch(() => {
        if (token !== generation.current) return;
        setSound("error");
        pending.current = null;
        finish(false);
      });
    return promise;
  };
  const ready = () =>
    getPianoSampleProgress().critical.status === "ready" && pianoSoundReady([60, 67]);
  const ensureSound = (): Promise<boolean> => {
    if (ready()) {
      generation.current++;
      pending.current?.finish(true);
      pending.current = null;
      setForeground(false);
      if (sound !== "ready") setSound("ready");
      return Promise.resolve(true);
    }
    if (pending.current?.kind === "samples") {
      generation.current++;
      pending.current.finish(false);
      pending.current = null;
    }
    return prepare(startPianoSound, "gesture");
  };
  const waitForSound = (): Promise<boolean> => {
    if (pending.current) return pending.current.promise;
    if (ready()) return Promise.resolve(true);
    // Fetch/decode may be awaited here, but AudioContext activation belongs to the original gesture.
    return prepare(loadPianoSamples, "samples");
  };
  const retry = () => {
    if (!foreground && getPianoSampleProgress().critical.status === "ready")
      void loadPianoSamples().catch(() => undefined);
    else void ensureSound();
  };
  return {
    sound,
    ensureSound,
    ensureIntervalSound: ensureSound,
    audioPreparation: {
      foreground,
      progress,
      cancel,
      retry,
      wait: waitForSound,
      prepare: ensureSound
    }
  };
}
/** Both preparations start inside the initiating gesture; neither advances song time. */
export const preparePlaybackSound = (
  audio: () => Promise<boolean>,
  party: () => Promise<boolean>
) => Promise.all([audio(), party()]).then((ready) => ready.every(Boolean));
