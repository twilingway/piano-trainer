import type { KeyEvent } from "../input/midiInput";
import type { NoteStatus, PracticeEvent, PracticeSession, PracticeStats } from "./session";
import type { CourseGuidance, KeyTimes, TrainerCourse } from "./trainerCourse";

export interface MusicInputTimes extends KeyTimes {
  /** Physical ownership is observed even when grading is intercepted or belongs to another device. */
  readonly admitted: boolean;
}

/** The music controller owns readiness and evidence; this route only lends the existing session. */
export interface TrainerMusicPolicy {
  readonly inputCompensationMs: () => number;
  readonly onStart: (session: PracticeSession, atMs: number, held: readonly KeyEvent[]) => boolean;
  readonly onFrame: (
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ) => readonly PracticeEvent[];
  readonly onInput: (
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    times: MusicInputTimes
  ) => readonly PracticeEvent[];
  readonly seedHeld: (events: readonly KeyEvent[], atMs: number) => void;
  readonly cancel: (atMs: number, resetAll?: boolean) => void;
  readonly guidance: (session: PracticeSession, playing: boolean) => CourseGuidance;
  readonly statusOf?: (noteId: string) => NoteStatus | undefined;
  readonly stats?: () => PracticeStats | undefined;
}

export function musicCourse(policy: TrainerMusicPolicy): TrainerCourse {
  return {
    kind: "music",
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
    start: (session, atMs, held) => policy.onStart(session, atMs, held),
    step: (session, playing, atMs) => policy.onFrame(session, playing, atMs),
    key: (event, context) => {
      if (event.type === "down") context.pressed.add(event.pitch);
      else context.pressed.delete(event.pitch);
      const times = context.times(event);
      const intercepted = context.intercept(event);
      const admitted = context.admits(event) && !intercepted;
      const session = context.session;
      if (session && times) {
        if (context.playing()) context.apply(session.tick(times.received));
        context.apply(policy.onInput(event, session, context.playing(), { ...times, admitted }));
      }
      context.publish();
    },
    guidance: (session, playing) => policy.guidance(session, playing),
    cuePresented: () => undefined,
    cancel: (atMs, resetAll) => {
      policy.cancel(atMs, resetAll);
    },
    ...(policy.statusOf ? { statusOf: policy.statusOf } : {}),
    ...(policy.stats ? { stats: policy.stats } : {})
  };
}
