import type { KeyEvent } from "../input/midiInput";
import type { NoteStatus, PracticeOptions, PracticeSession, PracticeStats } from "./session";
import type { TempoClockReceipt } from "./tempoClock";
import { NO_EVENTS, type TrainerCourse } from "./trainerCourse";

export interface TrainerIndependentRhythmPolicy {
  readonly inputCompensationMs: () => number;
  readonly onStart: (
    atMs: number,
    receipt: TempoClockReceipt,
    held: readonly KeyEvent[]
  ) => boolean;
  readonly onFrame: (
    session: PracticeSession,
    playing: boolean,
    atMs: number,
    receipt: TempoClockReceipt
  ) => void;
  readonly onInput: (
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    rawMs: number,
    correctedMs: number,
    receivedMs: number,
    receipt: TempoClockReceipt
  ) => void;
  readonly cancel: (atMs: number, resetAll?: boolean) => void;
  readonly seedHeld: (events: readonly KeyEvent[], atMs: number) => void;
  readonly cuePitches: () => readonly number[];
  readonly onCuePresented?: (pitches: readonly number[], atMs: number) => void;
  readonly statusOf?: (noteId: string) => NoteStatus | undefined;
  readonly stats?: () => PracticeStats;
}

export const INDEPENDENT_RHYTHM_PRACTICE_OPTIONS: PracticeOptions = {
  mode: "tempo",
  hands: new Set(["left", "right"]),
  speed: 1,
  accompaniment: false,
  noteResult: false,
  learningWindow: false,
  countInBeats: 4
};

/** Original pitches and ownership reach the course before any ordinary game judgement. */
export function observeIndependentRhythmInput(
  policy: TrainerIndependentRhythmPolicy,
  session: PracticeSession,
  event: KeyEvent,
  playing: boolean,
  received: number
): void {
  const raw = event.timestamp ?? received;
  const corrected = raw - policy.inputCompensationMs();
  policy.onInput(
    event,
    session,
    playing,
    raw,
    corrected,
    received,
    session.tempoClockReceipt(received)
  );
  policy.onFrame(session, playing, received, session.tempoClockReceipt(received));
}

export function independentRhythmGuidance(policy: TrainerIndependentRhythmPolicy) {
  return {
    lights: policy.cuePitches(),
    frame: { hintNotes: [], due: [], waitingFor: [], hints: false, neutralKeys: true }
  };
}

export function stepIndependentRhythm(
  policy: TrainerIndependentRhythmPolicy | null,
  session: PracticeSession | undefined,
  playing: boolean,
  atMs: number
): void {
  if (policy && session) policy.onFrame(session, playing, atMs, session.tempoClockReceipt(atMs));
}

export function independentRhythmCourse(policy: TrainerIndependentRhythmPolicy): TrainerCourse {
  return {
    kind: "independentRhythm",
    policy,
    ownsInput: true,
    smoothClock: true,
    gradesRun: false,
    playsAfterFinish: true,
    overdrive: false,
    inputCompensationMs: () => policy.inputCompensationMs(),
    seed: (held, atMs) => {
      policy.seedHeld(held, atMs);
    },
    start: (session, atMs, held) => policy.onStart(atMs, session.tempoClockReceipt(atMs), held),
    step: (session, playing, atMs) => {
      stepIndependentRhythm(policy, session, playing, atMs);
      return NO_EVENTS;
    },
    // Original pitches reach the course before the interceptor and the device filter.
    key: (event, context) => {
      const session = context.session,
        received = performance.now();
      if (event.type === "down") context.pressed.add(event.pitch);
      else context.pressed.delete(event.pitch);
      if (session && context.playing()) context.apply(session.tick(received));
      if (session)
        observeIndependentRhythmInput(policy, session, event, context.playing(), received);
      context.publish();
    },
    guidance: () => independentRhythmGuidance(policy),
    cuePresented: (lights, atMs) => {
      if (lights.length > 0) policy.onCuePresented?.(lights, atMs);
    },
    cancel: (atMs, resetAll) => {
      policy.cancel(atMs, resetAll);
    },
    ...(policy.statusOf ? { statusOf: policy.statusOf } : {}),
    stats: () => policy.stats?.()
  };
}
