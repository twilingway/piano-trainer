import type { NoteStatus, PracticeStats } from "./session";
import type { TimingPolicy } from "./timingPolicy";

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
