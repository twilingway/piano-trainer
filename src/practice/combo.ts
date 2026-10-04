import type { PracticeEvent } from "./session";
import { ACCURACY_POINTS, judgeOffset } from "./gameRules";

/** How a strike went, as the player is told at the hit line. */
export type StrikeGrade = "perfect" | "great" | "good" | "ok" | "early" | "late" | "miss";

/** Seconds off the note's start that still count as on time. */
export const PERFECT_WINDOW_S = 0.03;

/** A strike graded this frame, on the key it was played on. */
export interface GradedStrike {
  readonly grade: StrikeGrade;
  readonly pitch: number;
  readonly offsetMs?: number;
  readonly assisted?: boolean;
}

/** The board over the lane: the run of notes taken without a slip, and the share taken. */
export interface ComboBoard {
  readonly combo: number;
  readonly best: number;
  /** Weighted attack accuracy among resolved expected notes, 0 to 1. */
  readonly accuracy: number;
}

/**
 * The run of good notes and the accuracy of a play-through, fed with the
 * session's events. A missed note or a stray key breaks the run.
 */
export class ComboCounter {
  private combo = 0;
  private best = 0;
  private hits = 0;
  private slips = 0;
  private accuracyPoints = 0;

  /** The grade of a hit, a miss or a stray key; undefined for every other event. */
  record(event: PracticeEvent): StrikeGrade | undefined {
    switch (event.type) {
      case "hit": {
        const judgement = event.judgement ?? judgeOffset(event.offset * 1000);
        if (judgement === "MISS") {
          this.slips++;
          this.combo = 0;
          return "miss";
        }
        this.hits++;
        this.accuracyPoints += ACCURACY_POINTS[judgement];
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        return judgement.toLowerCase() as StrikeGrade;
      }
      case "miss":
        this.slips++;
        this.combo = 0;
        return "miss";
      case "wrong":
        this.combo = 0;
        return "miss";
      default:
        return undefined;
    }
  }

  board(): ComboBoard {
    const total = this.hits + this.slips;
    return {
      combo: this.combo,
      best: this.best,
      accuracy: total === 0 ? 1 : this.accuracyPoints / (total * 100)
    };
  }

  reset(): void {
    this.combo = 0;
    this.best = 0;
    this.hits = 0;
    this.slips = 0;
    this.accuracyPoints = 0;
  }
}
