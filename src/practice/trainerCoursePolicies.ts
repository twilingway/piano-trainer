import type { PracticeSession } from "./session";
import type { TrainerInputHolds } from "./trainerInputHolds";
import type { TrainerReadingPolicy } from "./readingPolicy";
import type { TrainerRhythmPolicy } from "./rhythmPolicy";
import { cancelPairInput, type TrainerPairPolicy } from "./twoHandPolicy";
import type { TrainerHeldBassPolicy } from "./heldBassPolicy";
import type { TrainerIndependentRhythmPolicy } from "./independentRhythmPolicy";

/** Exclusive course policies share physical ownership across load and phase boundaries. */
export class TrainerCoursePolicies {
  reading: TrainerReadingPolicy | null = null;
  rhythm: TrainerRhythmPolicy | null = null;
  pair: TrainerPairPolicy | null = null;
  heldBass: TrainerHeldBassPolicy | null = null;
  independentRhythm: TrainerIndependentRhythmPolicy | null = null;

  constructor(
    private readonly inputHolds: TrainerInputHolds,
    private readonly pressed: Set<number>,
    private readonly onLights: () => ((pitches: readonly number[]) => void) | undefined,
    private readonly session: () => PracticeSession | undefined
  ) {}

  get hasDedicatedInput(): boolean {
    return !!(this.rhythm ?? this.pair ?? this.heldBass ?? this.independentRhythm);
  }

  clear(): void {
    this.reading = null;
    this.rhythm = null;
    this.pair = null;
    this.heldBass = null;
    this.independentRhythm = null;
  }

  configureReading(policy: TrainerReadingPolicy | null): void {
    if (policy) this.configureIndependentRhythm(null);
    if (policy) this.configureHeldBass(null);
    this.reading = policy;
  }
  configureRhythm(policy: TrainerRhythmPolicy | null): void {
    if (policy) this.configureIndependentRhythm(null);
    if (policy) this.configureHeldBass(null);
    this.rhythm = policy;
  }
  configurePair(policy: TrainerPairPolicy | null): void {
    if (policy) this.configureIndependentRhythm(null);
    if (this.pair === policy) return;
    this.cancelInput();
    if (policy) this.heldBass = null;
    this.pair = policy;
    policy?.seedHeld?.(this.inputHolds.snapshot(), performance.now());
  }
  configureHeldBass(policy: TrainerHeldBassPolicy | null): void {
    if (policy) this.configureIndependentRhythm(null);
    if (this.heldBass === policy) return;
    this.cancelInput();
    this.heldBass = policy;
    if (policy) {
      this.reading = null;
      this.rhythm = null;
      this.pair = null;
      this.session()?.registerVerifiedOnsets(policy.onsets);
      policy.seedHeld?.(this.inputHolds.snapshot(), performance.now());
    }
  }
  configureIndependentRhythm(policy: TrainerIndependentRhythmPolicy | null): void {
    if (this.independentRhythm === policy) return;
    this.cancelInput();
    this.independentRhythm = policy;
    if (policy) {
      this.reading = null;
      this.rhythm = null;
      this.pair = null;
      this.heldBass = null;
      policy.seedHeld(this.inputHolds.snapshot(), performance.now());
    }
  }
  /** Loss of physical input cancels before any cleanup-generated releases arrive. */
  cancelInput(resetAll = false): void {
    cancelPairInput(this.pair, this.inputHolds, this.pressed, this.onLights(), resetAll);
    const scoped = this.independentRhythm ?? this.heldBass;
    if (scoped) {
      scoped.cancel(performance.now(), resetAll);
      this.pressed.clear();
      this.onLights()?.([]);
    }
  }
}
