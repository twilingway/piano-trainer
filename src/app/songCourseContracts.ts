import type { Trainer } from "../practice/Trainer";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { PracticeOptions } from "../practice/session";
import type { CourseMaterial, SongCourseResult, SongCourseSelection } from "../songCourse/model";

export type SongCoursePhase =
  | "ready"
  | "demo"
  | "playing"
  | "paused"
  | "awaiting-keys-up"
  | "awaiting-rehold"
  | "awaiting-release"
  | "result"
  | "error";
export interface SongCourseView {
  readonly material: CourseMaterial | null;
  readonly phase: SongCoursePhase;
  readonly progress: number;
  readonly waiting: boolean;
  readonly result: SongCourseResult | null;
  readonly error: string | null;
  readonly revision: number;
}
export interface SongCourseConnection {
  readonly trainer: Trainer | null;
  readonly blocked: boolean;
  readonly prepare: () => Promise<boolean>;
}
export interface SongCourseCallbacks {
  readonly onSelection: (selection: SongCourseSelection | null) => void;
  readonly onResult: (result: SongCourseResult) => void;
}
export interface SongCourseScene {
  readonly id: string;
  readonly song: CourseMaterial["song"];
  readonly musicXml: string;
}
export interface SongCourseRuntime {
  readonly active: boolean;
  readonly view: SongCourseView;
  readonly options: PracticeOptions | undefined;
  readonly scene: SongCourseScene | null;
  readonly policy: TrainerMusicPolicy;
}

export const NO_SONG_COURSE_CONNECTION: SongCourseConnection = {
  trainer: null,
  blocked: true,
  prepare: () => Promise.resolve(false)
};
export function emptySongCourseView(): SongCourseView {
  return {
    material: null,
    phase: "ready",
    progress: 0,
    waiting: false,
    result: null,
    error: null,
    revision: 0
  };
}
