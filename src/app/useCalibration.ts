import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalibrationSession,
  CALIBRATION_LEAD_IN,
  CALIBRATION_PERIOD_MS,
  CALIBRATION_SAMPLES,
  CALIBRATION_WARMUP,
  type CalibrationProgress,
  type CalibrationPhase,
  type CalibrationResult
} from "../practice/calibration";

export interface CalibrationOptions {
  audioOffsetMs: number;
  audioOutputId: string;
  playBeat: (performanceTimestampMs: number) => void;
  onComplete: (
    result: CalibrationResult,
    audio: { audioOffsetMs: number; audioOutputId: string }
  ) => void;
}
export function useCalibration(options: CalibrationOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  const active = useRef<CalibrationSession | null>(null);
  const readyAt = useRef(0);
  const audio = useRef({ audioOffsetMs: 0, audioOutputId: "default" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [progress, setProgress] = useState<CalibrationProgress | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<CalibrationPhase | null>(null);
  const cancel = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    active.current = null;
    setRunning(false);
    setCountdown(null);
    setPhase(null);
  }, []);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
      active.current = null;
    },
    []
  );
  const start = useCallback(() => {
    cancel();
    const current = optionsRef.current;
    audio.current = { audioOffsetMs: current.audioOffsetMs, audioOutputId: current.audioOutputId };
    readyAt.current = performance.now() + 3000;
    const startMs = readyAt.current + Math.max(300, current.audioOffsetMs + 150);
    const session = new CalibrationSession(startMs);
    active.current = session;
    setProgress(session.snapshot());
    setRunning(true);
    setCountdown(3);
    setPhase("preparation");
    for (let second = 1; second <= 3; second++) {
      timers.current.push(
        setTimeout(() => {
          if (active.current !== session) return;
          setCountdown(second === 3 ? null : 3 - second);
          if (second === 3) setPhase("lead-in");
        }, second * 1000)
      );
    }
    const totalBeats = CALIBRATION_LEAD_IN + CALIBRATION_WARMUP + CALIBRATION_SAMPLES;
    for (let beat = 0; beat < totalBeats; beat++) {
      const timestamp = startMs + beat * CALIBRATION_PERIOD_MS;
      timers.current.push(
        setTimeout(
          () => {
            if (active.current !== session) return;
            optionsRef.current.playBeat(timestamp);
          },
          Math.max(0, timestamp - performance.now() - current.audioOffsetMs - 100)
        )
      );
    }
    for (const [nextPhase, firstBeat] of [
      ["warmup", CALIBRATION_LEAD_IN],
      ["measurement", CALIBRATION_LEAD_IN + CALIBRATION_WARMUP]
    ] as const) {
      // Display the next stage when its nearest-beat admission window opens, not at its click.
      const opensAt = startMs + (firstBeat - 0.45) * CALIBRATION_PERIOD_MS;
      timers.current.push(
        setTimeout(
          () => {
            if (active.current === session) setPhase(nextPhase);
          },
          Math.max(0, opensAt - performance.now())
        )
      );
    }
    timers.current.push(
      setTimeout(
        () => {
          if (active.current !== session) return;
          setProgress(session.snapshot());
          cancel();
        },
        startMs + totalBeats * CALIBRATION_PERIOD_MS + 500 - performance.now()
      )
    );
  }, [cancel]);
  const capture = useCallback(
    (pitch: number, timestampMs: number): boolean => {
      const session = active.current;
      if (!session) return false;
      // Ignore preparation taps even if their timestamps round to the first beat.
      if (performance.now() < readyAt.current || timestampMs < readyAt.current) return true;
      if (session.capture(pitch, timestampMs)) {
        const next = session.snapshot();
        setProgress(next);
        if (next.complete && next.result) {
          const completedAudio = audio.current;
          cancel();
          optionsRef.current.onComplete(next.result, completedAudio);
        }
      }
      // Consume calibration input so taps cannot play the underlying game.
      return true;
    },
    [cancel]
  );
  return { start, cancel, capture, progress, running, countdown, phase };
}
