import type { MusicExercise } from "../musicLearning/types";
import type { IntegratedProgress, MusicResult } from "../musicLearning/progress";
import type { KeyEvent, MidiDevice } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { PracticeOptions } from "../practice/session";
import type { MusicCourseView, MusicCourseCommand } from "../ui/musicCourseTypes";
import type { TimingPreferences } from "./timingPreferences";
import type { MusicPersistentState } from "./musicPersistence";
import type { LessonFingerCue } from "../reading/fingerCues";

export interface MusicCourseSelection {
  readonly active: boolean;
  readonly saved: MusicPersistentState;
  readonly revision: number;
}
export interface MusicCourseCallbacks {
  readonly readSelection?: () => MusicPersistentState;
  readonly save: (result: MusicResult) => void;
  readonly saveIntegrated: (progress: IntegratedProgress) => void;
  readonly rememberSeed: (seed: number) => void;
  readonly known: () => Promise<ReadonlySet<string>>;
  readonly claim: (fingerprint: string) => Promise<boolean>;
  readonly persistenceReady: () => Promise<void>;
  readonly retry: () => void;
  readonly exit: () => void;
}
export interface MusicCourseConnection {
  readonly trainer: Trainer | null;
  readonly blocked: boolean;
  readonly deviceId: string | undefined;
  readonly timing: TimingPreferences;
}
export interface MusicCourseSnapshot {
  readonly scene: MusicExercise | null;
  readonly view: MusicCourseView;
  readonly options: PracticeOptions;
  readonly staffXml: string | undefined;
  readonly staffVisible: boolean;
  readonly keysVisible: boolean;
  readonly fingeringVisible?: boolean;
  readonly fingerCues?: readonly LessonFingerCue[];
}
/** Stable external-store boundary; musical time remains owned by the lent Trainer session. */
export interface MusicCourseControllerContract {
  readonly selection: MusicCourseSelection;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => MusicCourseSnapshot;
  readonly activate: () => void;
  readonly dispose: () => void;
  readonly refreshConnection: (connection: MusicCourseConnection) => void;
  readonly present: (id: string, atMs: number) => void;
  readonly staffError: (id: string) => void;
  readonly policy: (id: string) => TrainerMusicPolicy;
  readonly command: (command: MusicCourseCommand) => void;
  readonly choose: (value: string, source: "keyboard" | "pointer") => void;
  readonly cancel: () => void;
}

/** Kept structural so hooks do not depend on a window, MIDI manager or rendering implementation. */
export interface MusicCourseDeviceContext {
  readonly devices: readonly MidiDevice[];
  readonly selectedDeviceId: string;
  readonly held?: readonly KeyEvent[];
}
