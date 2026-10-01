import type { PracticeEvent } from "./session";

/** How a strike went, as the player is told at the hit line. */
export type StrikeGrade = "perfect" | "early" | "late" | "miss";

/** Seconds off the note's start that still count as on time. */
export const PERFECT_WINDOW_S = 0.06;

/** A strike graded this frame, on the key it was played on. */
export interface GradedStrike {
  readonly grade: StrikeGrade;
  readonly pitch: number;
}

/** The board over the lane: the run of notes taken without a slip, and the share taken. */
export interface ComboBoard {
  readonly combo: number;
  readonly best: number;
  /** Notes taken among notes owed and stray keys, 0 to 1; 1 before anything is played. */
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

  /** The grade of a hit, a miss or a stray key; undefined for every other event. */
  record(event: PracticeEvent): StrikeGrade | undefined {
    switch (event.type) {
      case "hit": {
        this.hits++;
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        if (Math.abs(event.offset) <= PERFECT_WINDOW_S) return "perfect";
        return event.offset < 0 ? "early" : "late";
      }
      case "miss":
      case "wrong":
        this.slips++;
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
      accuracy: total === 0 ? 1 : this.hits / total
    };
  }

  reset(): void {
    this.combo = 0;
    this.best = 0;
    this.hits = 0;
    this.slips = 0;
  }
}
