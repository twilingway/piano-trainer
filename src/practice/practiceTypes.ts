import type { Hand } from "../fingering/fingering";
import type { GameScore } from "./gameScore";
import type { Difficulty, Judgement } from "./gameRules";
import type { PlayableRange } from "./playableRange";
import type { HoldStatistics } from "./sessionHolds";
import type { NoteResultSnapshot } from "./noteResult";

export type PracticeMode = "wait" | "tempo";

export interface PracticeOptions {
  /** Physical piano result; disabled for instant word-typing attacks. */
  readonly noteResult?: boolean;
  readonly mode: PracticeMode;
  /** The hands the player plays; the program plays the rest. Empty = listen only. */
  readonly hands: ReadonlySet<Hand>;
  /** 1 = written tempo. */
  readonly speed: number;
  readonly difficulty?: Difficulty;
  readonly learningWindow?: boolean;
  readonly from?: number;
  readonly to?: number;
  readonly missGraceMs?: number;
  /** The keys the player's instrument has; their hands' notes outside it go to the program. */
  readonly playable?: PlayableRange | undefined;
  /** The song's parts the player plays, within `hands`; none = every part of those hands. */
  readonly parts?: ReadonlySet<string> | undefined;
  /** false: while the player plays, the program plays nothing. Listening always sounds. */
  readonly accompaniment?: boolean;
}

/** "skipped": before the point the run was started from; it never counts. */
export type NoteStatus = "pending" | "hit" | "missed" | "skipped";

export type PracticeEvent =
  | { readonly type: "autoNoteOn"; readonly pitch: number; readonly velocity?: number }
  | { readonly type: "autoNoteOff"; readonly pitch: number }
  | {
      readonly type: "hit";
      readonly noteId: string;
      readonly offset: number;
      readonly judgement?: Judgement;
      readonly assisted?: boolean;
    }
  | { readonly type: "miss"; readonly noteId: string }
  | { readonly type: "wrong"; readonly pitch: number }
  | { readonly type: "beat"; readonly downbeat: boolean }
  | { readonly type: "finished" };

export interface PracticeStats {
  readonly hits: number;
  readonly misses: number;
  readonly wrong: number;
  /** Mean signed timing error of hits in real seconds, tempo mode only; negative = early. */
  readonly meanOffset: number;
  /** Pitches with the most misses and wrong presses, worst first. */
  readonly troubleSpots: readonly { readonly pitch: number; readonly errors: number }[];
  readonly game?: ReturnType<GameScore["snapshot"]>;
  readonly hold?: HoldStatistics;
  readonly noteResult?: NoteResultSnapshot;
}
