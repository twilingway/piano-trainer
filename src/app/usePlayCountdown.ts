import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { normalizeCountdownSeconds } from "./playerPrefs";

interface Options {
  readonly seconds: number;
  readonly playing: boolean;
  readonly finished?: boolean;
  readonly song: unknown;
  readonly context: string;
  readonly blocked: boolean;
  readonly prepare: () => Promise<boolean>;
  readonly onToggle: () => void;
}
interface Pending {
  readonly generation: number;
  readonly deadline: number;
  prepared: boolean;
}

/** Delays the existing transport command, never advances musical time itself. */
export function usePlayCountdown(options: Options) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const pending = useRef<Pending | null>(null);
  const generation = useRef(0);
  const started = useRef(options.playing);
  const frame = useRef<number | null>(null);
  const action = useRef(options.onToggle);
  useLayoutEffect(() => {
    action.current = options.onToggle;
  }, [options.onToggle]);
  const cancel = useCallback(() => {
    generation.current++;
    pending.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setCountdown(null);
  }, []);
  const resetNewRun = useCallback(() => {
    started.current = false;
    cancel();
  }, [cancel]);
  const { song, context, blocked, seconds, playing } = options;
  useLayoutEffect(() => {
    started.current = false;
    return cancel;
  }, [cancel, song, context]);
  useLayoutEffect(() => {
    if (playing) started.current = true;
  }, [playing]);
  useLayoutEffect(() => cancel, [cancel, blocked, seconds, playing]);

  const toggle = () => {
    if (pending.current) {
      cancel();
      return;
    }
    if (playing) {
      action.current();
      return;
    }
    if (blocked) return;
    if ((started.current && !options.finished) || normalizeCountdownSeconds(seconds) === 0) {
      action.current();
      return;
    }
    const wait = normalizeCountdownSeconds(seconds);
    const request: Pending = {
      generation: ++generation.current,
      deadline: performance.now() + wait * 1000,
      prepared: false
    };
    pending.current = request;
    setCountdown(wait);
    const current = () => pending.current === request && generation.current === request.generation;
    const startIfReady = () => {
      if (!current() || !request.prepared || performance.now() < request.deadline) return;
      pending.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setCountdown(null);
      action.current();
    };
    const tick = () => {
      frame.current = null;
      if (!current()) return;
      const remaining = Math.max(0, Math.ceil((request.deadline - performance.now()) / 1000));
      setCountdown(remaining);
      startIfReady();
      if (current()) frame.current = requestAnimationFrame(tick);
    };
    // AudioContext preparation stays inside the original click/keyboard gesture.
    let preparation: Promise<boolean>;
    try {
      preparation = options.prepare();
    } catch {
      cancel();
      return;
    }
    void preparation.then(
      (ready) => {
        if (!current()) return;
        if (!ready) {
          cancel();
          return;
        }
        request.prepared = true;
        startIfReady();
      },
      () => {
        if (current()) cancel();
      }
    );
    frame.current = requestAnimationFrame(tick);
  };
  return { countdown, active: countdown !== null, toggle, cancel, resetNewRun };
}
