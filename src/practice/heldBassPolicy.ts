import type { KeyEvent } from "../input/midiInput";
import type { Song } from "../song/song";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "./session";
import type { HeldBassClockReceipt } from "./heldBassClock";
import type { ScopedVerifiedOnset, VerifiedOnsetScope } from "./verifiedWaitingOnset";
import type { TrainerCourse } from "./trainerCourse";
import { processScopedKey } from "./trainerScopedInput";
import { pairGuidance } from "./twoHandPolicy";

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

/** A bass with the first melody note on the downbeat, then one melody note every half second. */
export function isHeldBassScope(
  scope: VerifiedOnsetScope,
  song: Song,
  options: PracticeOptions
): boolean {
  return (
    options.hands.size === 2 &&
    options.hands.has("left") &&
    options.hands.has("right") &&
    [2, 4].includes(scope.steps.length) &&
    song.duration === scope.steps.length * 0.5 &&
    scope.steps.every((ids, index) => {
      const notes = song.notes.filter((note) => note.start === index * 0.5);
      return (
        ids.length === (index === 0 ? 2 : 1) &&
        notes.length === ids.length &&
        notes.every((note) => ids.includes(note.id)) &&
        (index === 0
          ? notes.filter((note) => note.hand === "left").length === 1
          : notes.every((note) => note.hand === "right"))
      );
    })
  );
}

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

export function heldBassCourse(policy: TrainerHeldBassPolicy): TrainerCourse {
  return {
    kind: "heldBass",
    policy,
    ownsInput: true,
    smoothClock: true,
    gradesRun: false,
    playsAfterFinish: true,
    overdrive: true,
    attach: (session) => {
      if (isHeldBassScope(policy.onsets, session.song, session.options))
        session.registerVerifiedOnsets(policy.onsets);
    },
    seed: (held, atMs) => policy.seedHeld?.(held, atMs),
    step: (session, playing, atMs) => stepTrainerHeldBass(policy, session, playing, atMs),
    key: (event, context) => {
      processScopedKey(event, context, {
        intercepts: false,
        onInput: (session, playing, { raw, corrected, received }) => {
          policy.onInput(
            event,
            session,
            playing,
            raw,
            corrected,
            received,
            session.clockReceipt(received)
          );
        },
        step: (session, playing, atMs) => stepTrainerHeldBass(policy, session, playing, atMs)
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
