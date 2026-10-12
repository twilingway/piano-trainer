import type { KeyEvent } from "../input/midiInput";
import type { PracticeOptions, PracticeSession, PracticeEvent } from "./session";
import type { ReadingAttackGate } from "./readingPolicy";
import type { TimingConfig } from "./timingConfig";

export interface RhythmAttackEvidence {
  readonly event: KeyEvent;
  readonly rawAtMs: number;
  readonly correctedAtMs: number;
  readonly receivedAtMs: number;
  readonly songTimeS: number;
  readonly receivedSongTimeS: number;
}

export interface TrainerRhythmPolicy {
  readonly inputCompensationMs: () => number;
  readonly accepts: (event: KeyEvent) => boolean;
  readonly onAttack: (evidence: RhythmAttackEvidence) => void;
  readonly onFrame: (session: PracticeSession, playing: boolean, atMs: number) => void;
}

export const RHYTHM_PRACTICE_OPTIONS: PracticeOptions = {
  mode: "tempo",
  hands: new Set(["right"]),
  speed: 1,
  accompaniment: false,
  noteResult: false,
  difficulty: "normal",
  learningWindow: false,
  countInBeats: 4
};

/** Observe all fresh physical attacks before pitch remapping or game judgement. */
export function processRhythmKey(
  event: KeyEvent,
  session: PracticeSession | undefined,
  policy: TrainerRhythmPolicy,
  gate: ReadingAttackGate,
  timing: TimingConfig,
  playing: boolean
): PracticeEvent[] {
  const fresh = gate.accept(event);
  if (!session) return [];
  const received = performance.now();
  const raw = event.timestamp ?? received;
  const corrected =
    raw -
    (timing.inputOffsets[event.deviceId ?? event.source ?? "pointer"] ?? 0) -
    timing.manualInputOffsetMs;
  if (event.type === "up") {
    session.releaseKeyAt(60, corrected);
    return [];
  }
  if (!fresh || !playing || !Number.isFinite(raw) || received - raw > 250 || !policy.accepts(event))
    return [];
  const events = session.tick(received);
  const songTime = session.songTimeAt(corrected);
  const receiptTime = session.songTimeAt(received);
  if (songTime !== undefined && receiptTime !== undefined) {
    policy.onAttack({
      event,
      rawAtMs: raw,
      correctedAtMs: corrected,
      receivedAtMs: received,
      songTimeS: songTime,
      receivedSongTimeS: receiptTime
    });
    events.push(...session.pressKeyAt(60, corrected, received, event.deviceId ?? event.source));
  }
  return events;
}
