import type { KeyEvent } from "../input/midiInput";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "./session";
import type { TrainerCourse } from "./trainerCourse";
import { processScopedKey } from "./trainerScopedInput";

/** Pair assessment owns freshness and event ordering, independently of ordinary wait input. */
export interface TrainerPairPolicy {
  readonly onFrame: (
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ) => readonly string[] | undefined;
  readonly onInput: (
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    rawTimestampMs: number,
    correctedTimestampMs: number,
    receivedTimestampMs: number
  ) => void;
  readonly cancel: (atMs: number, resetAll?: boolean) => void;
  readonly seedHeld?: (events: readonly KeyEvent[], atMs: number) => void;
  readonly cuePitches: () => readonly number[];
  readonly onCuePresented?: (pitches: readonly number[], atMs: number) => void;
  readonly onCommit?: (noteIds: readonly string[], accepted: boolean, atMs: number) => void;
}

export const TWO_HAND_PRACTICE_OPTIONS: PracticeOptions = {
  mode: "wait",
  hands: new Set(["left", "right"]),
  speed: 1,
  accompaniment: false,
  noteResult: false
};

/** A validated pure result is the sole entry point to the session's atomic pair commit. */
export function stepTrainerPair(
  policy: TrainerPairPolicy | null,
  session: PracticeSession,
  playing: boolean,
  now: number
): readonly PracticeEvent[] {
  const ids = policy?.onFrame(session, playing, now);
  if (!ids) return [];
  const events = playing ? session.commitWaitingGroup(ids, now) : undefined;
  policy?.onCommit?.(ids, events !== undefined, now);
  return events ?? [];
}

export function pairGuidance(
  session: PracticeSession,
  policy: Pick<TrainerPairPolicy, "cuePitches">,
  playing: boolean
) {
  const pitches = playing ? policy.cuePitches() : [];
  const notes = session.nextDue().filter((note) => pitches.includes(note.pitch));
  return {
    lights: pitches,
    frame: {
      hintNotes: notes,
      due: notes,
      waitingFor: notes,
      hints: notes.length > 0,
      neutralKeys: true
    }
  };
}

export function pairCourse(policy: TrainerPairPolicy): TrainerCourse {
  return {
    kind: "pair",
    policy,
    ownsInput: true,
    smoothClock: false,
    gradesRun: true,
    playsAfterFinish: false,
    overdrive: true,
    seed: (held, atMs) => policy.seedHeld?.(held, atMs),
    step: (session, playing, atMs) => stepTrainerPair(policy, session, playing, atMs),
    key: (event, context) => {
      processScopedKey(event, context, {
        intercepts: true,
        onInput: (session, playing, { raw, corrected, received }) => {
          policy.onInput(event, session, playing, raw, corrected, received);
        },
        step: (session, playing, atMs) => stepTrainerPair(policy, session, playing, atMs)
      });
    },
    guidance: (session, playing) => pairGuidance(session, policy, playing),
    cuePresented: (lights, atMs) => {
      if (lights.length > 0) policy.onCuePresented?.(lights, atMs);
    },
    cancel: (atMs, resetAll) => {
      policy.cancel(atMs, resetAll);
    }
  };
}
