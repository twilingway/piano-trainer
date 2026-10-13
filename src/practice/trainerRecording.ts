import { TakeRecorder, type Take } from "../recording/take";
import type { PracticeSession } from "./session";
import type { TimingConfig } from "./timingConfig";

/** Recording metadata belongs to the trainer's one session and frozen timing policy. */
export function createTrainerRecorder(
  session: PracticeSession,
  songKey: string,
  timing: TimingConfig
): TakeRecorder {
  return new TakeRecorder({
    songKey,
    mode: session.options.mode,
    speed: session.options.speed,
    hands: [...session.options.hands],
    ...(session.options.playable ? { playable: session.options.playable } : {}),
    ...(session.options.parts ? { parts: [...session.options.parts] } : {}),
    from: session.startedFrom,
    timing: {
      rulesVersion: 2,
      difficulty: session.options.difficulty ?? "normal",
      learningWindow: session.options.mode === "tempo" && session.options.learningWindow === true,
      ...timing
    }
  });
}

export function finishTrainerTake(
  recorder: TakeRecorder,
  session: PracticeSession,
  realTime: number
): Take {
  return recorder.finish(
    session.time,
    realTime,
    `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`,
    new Date().toISOString()
  );
}
