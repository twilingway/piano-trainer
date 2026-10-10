import type { KeyEvent } from "../input/midiInput";
import type { PracticeEvent, PracticeOptions, PracticeSession } from "./session";
import { keyLightPitches } from "./keyLights";

export interface TrainerReadingPolicy {
  readonly onFrame: (session: PracticeSession, playing: boolean, atMs: number) => void;
  readonly allowInput: (
    event: KeyEvent,
    session: PracticeSession,
    rawTimestampMs: number
  ) => boolean;
  readonly onJudgement: (
    event: KeyEvent,
    events: readonly PracticeEvent[],
    rawTimestampMs: number,
    correctedTimestampMs: number
  ) => void;
  readonly cuePitch: () => number | undefined;
  readonly onCuePresented?: (pitch: number, atMs: number) => void;
}

export const READING_PRACTICE_OPTIONS: PracticeOptions = {
  mode: "wait",
  hands: new Set(["right"]),
  speed: 1,
  accompaniment: false,
  noteResult: false
};

/** A reading profile exposes only a cue explicitly confirmed as shown. */
export function trainerGuidance(
  session: PracticeSession,
  reading: TrainerReadingPolicy | null,
  playing: boolean,
  performanceMode: boolean
) {
  const pitch = playing ? reading?.cuePitch() : undefined;
  const notes = reading
    ? session.nextDue().filter((note) => note.pitch === pitch)
    : session.keyHints();
  return {
    lights: reading
      ? pitch === undefined
        ? []
        : [pitch]
      : keyLightPitches(session, playing && !performanceMode),
    frame: {
      hintNotes: notes,
      due: reading ? notes : playing || session.time < 0 ? session.nextDue() : [],
      waitingFor: reading ? notes : session.waiting ? session.nextDue() : [],
      hints: reading ? pitch !== undefined : !performanceMode,
      neutralKeys: reading !== null
    }
  };
}

/** Retains pre-presentation and paused presses until an actual release arrives. */
export class ReadingAttackGate {
  private held = new Set<string>();
  accept(event: KeyEvent): boolean {
    const key = JSON.stringify([
      event.source ?? "pointer",
      event.deviceId ?? "",
      event.channel ?? 0,
      event.pitch
    ]);
    if (event.type === "up") {
      this.held.delete(key);
      return false;
    }
    const fresh = !this.held.has(key);
    this.held.add(key);
    return fresh;
  }
  clear(): void {
    this.held.clear();
  }
}
