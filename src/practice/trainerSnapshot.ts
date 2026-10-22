import type { NoteStatus, PracticeStats } from "./session";
import type { TimingPolicy } from "./timingPolicy";
import { timingPolicy } from "./timingPolicy";
import type { PracticeSession } from "./session";
import type { ComboBoard } from "./combo";
import type { TrainerCourse } from "./trainerCourse";
import type { KeyEvent } from "../input/midiInput";

export interface TrainerSnapshot {
  readonly playing: boolean;
  readonly waiting: boolean;
  readonly finished: boolean;
  readonly time: number;
  readonly timingPolicy: TimingPolicy;
  /** Beat of the last note that has started; what the staff cursor follows. */
  readonly beat: number;
  readonly stats: PracticeStats;
  readonly diagnostic?: InputDiagnostic;
  readonly noteStatuses?: Readonly<Record<string, NoteStatus | undefined>>;
}

export interface InputDiagnostic {
  readonly source: string;
  readonly deviceId: string;
  readonly pitch: number;
  readonly velocity: number;
  readonly raw: number;
  readonly corrected: number;
  readonly offset: number;
  readonly expired: boolean;
}

export function trainerSnapshot(
  session: PracticeSession,
  playing: boolean,
  beat: number,
  textNoteIds: readonly string[],
  diagnostic: InputDiagnostic | undefined,
  course?: Pick<TrainerCourse, "stats"> | null
): { snapshot: TrainerSnapshot; board: ComboBoard | undefined } {
  const stats = course?.stats?.() ?? session.stats();
  const game = course?.stats ? undefined : stats.game;
  return {
    board: game
      ? { combo: game.combo, best: game.maxCombo, accuracy: (game.accuracy ?? 100) / 100 }
      : undefined,
    snapshot: {
      playing,
      waiting: session.waiting,
      finished: session.finished,
      time: session.time,
      beat,
      timingPolicy: timingPolicy(session.options),
      stats,
      ...(textNoteIds.length > 0
        ? { noteStatuses: Object.fromEntries(textNoteIds.map((id) => [id, session.statusOf(id)])) }
        : {}),
      ...(diagnostic ? { diagnostic } : {})
    }
  };
}

export function inputDiagnostic(
  event: KeyEvent,
  raw: number,
  corrected: number,
  received: number,
  eventTime: number | undefined
): InputDiagnostic {
  return {
    source: event.source ?? "pointer",
    deviceId: event.deviceId ?? "pointer",
    pitch: event.pitch,
    velocity: event.velocity,
    raw,
    corrected,
    offset: raw - corrected,
    expired: eventTime === undefined || received - raw > 250
  };
}
