import type { KeyEvent } from "../input/midiInput";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "./session";
import type { TrainerInputHolds } from "./trainerInputHolds";

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

export function cancelPairInput(
  policy: TrainerPairPolicy | null,
  holds: TrainerInputHolds,
  pressed: Set<number>,
  lights: ((pitches: readonly number[]) => void) | undefined,
  resetAll: boolean
): void {
  if (resetAll) holds.clear();
  if (!policy) return;
  policy.cancel(performance.now(), resetAll);
  pressed.clear();
  lights?.([]);
}

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
  policy: TrainerPairPolicy,
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
