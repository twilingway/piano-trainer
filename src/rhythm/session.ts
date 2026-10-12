import { summarizeRhythm } from "./progress";
import { RHYTHM_DELIVERY_GRACE_MS, RHYTHM_RULES_VERSION, RHYTHM_WINDOW_MS } from "./types";
import type {
  RhythmAttack,
  RhythmAttackEvent,
  RhythmExercise,
  RhythmMiss,
  RhythmResult,
  RhythmSessionConfig,
  RhythmSnapshot
} from "./types";

const EPSILON_S = 1e-9;

/** Evaluation consumes one clock's timestamps. It owns neither timers nor input resources. */
export class RhythmSession {
  private readonly attacks: RhythmAttack[] = [];
  private readonly misses: RhythmMiss[] = [];
  private readonly resolved = new Set<string>();
  private readonly config: RhythmSessionConfig;
  private status: RhythmSnapshot["status"] = "running";
  private cachedSnapshot: RhythmSnapshot | null = null;
  readonly deliveryGraceS: number;
  readonly completionTimeS: number;

  constructor(
    private readonly exercise: RhythmExercise,
    config: RhythmSessionConfig
  ) {
    if (
      !config.runId ||
      !["keyboard", "pointer", "midi"].includes(config.source) ||
      !Number.isFinite(config.startedAt) ||
      !Number.isFinite(config.startedAtMs) ||
      Object.values(config.offsets).some(
        (value) => typeof value === "number" && !Number.isFinite(value)
      )
    )
      throw new RangeError("Invalid rhythm session configuration");
    this.config = { ...config, offsets: { ...config.offsets } };
    const effectiveOffsetMs = config.offsets.inputOffsetMs + config.offsets.manualInputOffsetMs;
    this.deliveryGraceS = (RHYTHM_DELIVERY_GRACE_MS + Math.max(0, effectiveOffsetMs)) / 1000;
    this.completionTimeS = exercise.durationS + this.deliveryGraceS;
  }

  attack(event: RhythmAttackEvent): RhythmAttack | null {
    if (!this.accepts(event)) return null;
    this.advance(event.receivedSongTimeS);
    if (this.status !== "running") return null;
    let matched: (typeof this.exercise.onsets)[number] | null = null;
    let distance = Infinity;
    for (const onset of this.exercise.onsets) {
      const candidateDistance = Math.abs(event.songTimeS - onset.timeS);
      if (
        !this.resolved.has(onset.id) &&
        candidateDistance <= RHYTHM_WINDOW_MS / 1000 + EPSILON_S &&
        candidateDistance < distance
      ) {
        matched = onset;
        distance = candidateDistance;
      }
    }
    if (matched) this.resolved.add(matched.id);
    const attack: RhythmAttack = {
      ...event,
      attemptId: `${this.config.runId}:${String(this.attacks.length)}`,
      kind: matched ? "hit" : "extra",
      onsetId: matched?.id ?? null,
      deviationMs: matched ? (event.songTimeS - matched.timeS) * 1000 : null,
      inRest:
        !matched &&
        this.exercise.rests.some(
          (rest) => event.songTimeS >= rest.startS && event.songTimeS < rest.endS
        )
    };
    this.attacks.push(attack);
    this.cachedSnapshot = null;
    return attack;
  }

  private accepts(event: RhythmAttackEvent): boolean {
    return (
      this.status === "running" &&
      event.runId === this.config.runId &&
      event.source === this.config.source &&
      (event.source !== "midi" || event.deviceId === this.config.deviceId) &&
      [
        event.rawAtMs,
        event.correctedAtMs,
        event.receivedAtMs,
        event.songTimeS,
        event.receivedSongTimeS
      ].every(Number.isFinite) &&
      event.rawAtMs >= this.config.startedAtMs &&
      event.receivedAtMs >= event.rawAtMs &&
      event.receivedAtMs - event.rawAtMs <= RHYTHM_DELIVERY_GRACE_MS &&
      event.songTimeS >= -RHYTHM_WINDOW_MS / 1000 - EPSILON_S &&
      event.songTimeS < this.exercise.durationS
    );
  }

  advance(songTimeS: number): void {
    if (this.status !== "running" || !Number.isFinite(songTimeS)) return;
    let changed = false;
    for (const onset of this.exercise.onsets) {
      if (
        !this.resolved.has(onset.id) &&
        songTimeS > onset.timeS + RHYTHM_WINDOW_MS / 1000 + this.deliveryGraceS + EPSILON_S
      ) {
        this.resolved.add(onset.id);
        this.misses.push({ onsetId: onset.id, timeS: onset.timeS, source: this.config.source });
        changed = true;
      }
    }
    if (songTimeS >= this.completionTimeS) {
      this.status = "completed";
      changed = true;
    }
    if (changed) this.cachedSnapshot = null;
  }

  cancel(): void {
    if (this.status !== "running") return;
    this.status = "cancelled";
    this.cachedSnapshot = null;
  }

  snapshot(): RhythmSnapshot {
    this.cachedSnapshot ??= {
      status: this.status,
      attacks: [...this.attacks],
      misses: [...this.misses],
      summary: summarizeRhythm(this.exercise.onsets.length, this.attacks, this.misses)
    };
    return this.cachedSnapshot;
  }

  result(completedAt: number): RhythmResult | null {
    if (
      this.status !== "completed" ||
      !Number.isFinite(completedAt) ||
      completedAt < this.config.startedAt
    )
      return null;
    return {
      id: this.config.runId,
      skillId: "rhythm-onsets",
      exerciseId: this.exercise.id,
      runId: this.config.runId,
      seed: this.exercise.seed,
      generatorVersion: this.exercise.generatorVersion,
      bpm: this.exercise.bpm,
      source: this.config.source,
      ...(this.config.deviceId === undefined ? {} : { deviceId: this.config.deviceId }),
      rulesVersion: RHYTHM_RULES_VERSION,
      windowMs: RHYTHM_WINDOW_MS,
      offsets: { ...this.config.offsets },
      startedAt: this.config.startedAt,
      completedAt,
      attacks: [...this.attacks],
      misses: [...this.misses],
      summary: summarizeRhythm(this.exercise.onsets.length, this.attacks, this.misses)
    };
  }
}
