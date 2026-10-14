import type { KeyEvent } from "../input/midiInput";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "./session";
import type { HeldBassClockReceipt } from "./heldBassClock";
import type { ScopedVerifiedOnset, VerifiedOnsetScope } from "./verifiedWaitingOnset";

export interface TrainerHeldBassPolicy {
  readonly onsets: VerifiedOnsetScope;
  readonly onFrame: (
    session: PracticeSession,
    playing: boolean,
    atMs: number,
    receipt: HeldBassClockReceipt
  ) => ScopedVerifiedOnset | undefined;
  readonly onInput: (
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    rawMs: number,
    correctedMs: number,
    receivedMs: number,
    receipt: HeldBassClockReceipt
  ) => void;
  readonly onCommit?: (
    request: ScopedVerifiedOnset,
    accepted: boolean,
    receipt: HeldBassClockReceipt
  ) => void;
  readonly cancel: (atMs: number, resetAll?: boolean) => void;
  readonly seedHeld?: (events: readonly KeyEvent[], atMs: number) => void;
  readonly cuePitches: () => readonly number[];
  readonly onCuePresented?: (pitches: readonly number[], atMs: number) => void;
}

export const HELD_BASS_PRACTICE_OPTIONS: PracticeOptions = {
  mode: "wait",
  hands: new Set(["left", "right"]),
  speed: 1,
  accompaniment: false,
  noteResult: false
};

/** Only the PracticeSession can acknowledge and advance a verified onset. */
export function stepTrainerHeldBass(
  policy: TrainerHeldBassPolicy | null,
  session: PracticeSession,
  playing: boolean,
  now: number
): readonly PracticeEvent[] {
  const request = policy?.onFrame(session, playing, now, session.clockReceipt(now));
  if (!request) return [];
  const events = playing ? session.commitVerifiedOnset(request, now) : undefined;
  policy?.onCommit?.(request, events !== undefined, session.clockReceipt(now));
  return events ?? [];
}
