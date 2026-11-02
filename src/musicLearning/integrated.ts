import { cloneMusicEvidence, validateMusicEvidence } from "./evidence";
import type { EmbeddedMusicEvidence } from "./evidence";
import { INTEGRATED_PHASE_IDS, regenerateIntegratedActivity } from "./integratedPlan";
import type {
  IntegratedActivity,
  IntegratedPhaseId,
  IntegratedPlan,
  IntegratedSkill
} from "./integratedPlan";
import type { MusicHelpEvent } from "./types";
export { createIntegratedPlan } from "./integratedPlan";
export type {
  IntegratedActivity,
  IntegratedPhaseId,
  IntegratedPlan,
  IntegratedSkill
} from "./integratedPlan";

export type IntegratedInputSource = "midi" | "keyboard" | "pointer";
export interface IntegratedIdentity {
  readonly generation: number;
  readonly presentationId: string;
  readonly runId: string;
  readonly activityId: string;
}
export type IntegratedEvidence =
  | { readonly skill: "keyboard"; readonly errors: { readonly wrongKeys: number } }
  | {
      readonly skill: "reading";
      readonly errors: {
        readonly pitches: number;
        readonly timing: number;
        readonly groups: number;
      };
    }
  | {
      readonly skill: "rhythm";
      readonly errors: {
        readonly onsets: number;
        readonly durations: number;
        readonly missing: number;
        readonly extra: number;
      };
    }
  | {
      readonly skill: "interval";
      readonly errors: { readonly recognition: number; readonly pitches: number };
    }
  | {
      readonly skill: "harmony";
      readonly errors: {
        readonly pitches: number;
        readonly bass: number;
        readonly synchrony: number;
      };
    }
  | {
      readonly skill: "coordination";
      readonly errors: { readonly left: number; readonly right: number; readonly timing: number };
    };

/** A reference to the child's saved run plus its own skill evidence, never a second history run. */
export type IntegratedChildResult = IntegratedIdentity &
  IntegratedEvidence & {
    readonly resultId: string;
    readonly evidence?: EmbeddedMusicEvidence;
    readonly purpose: "training" | "control";
    readonly source: IntegratedInputSource;
    readonly status: "completed" | "empty";
    readonly performedUnits: number;
    readonly help: readonly MusicHelpEvent[];
    readonly visualAlternative: boolean;
    readonly auditoryVerified: boolean;
  };
export type IntegratedSavedResult = IntegratedChildResult & { readonly phaseId: IntegratedPhaseId };
export interface IntegratedSavedState {
  readonly lessonId: string;
  readonly planId: string;
  readonly activitySeeds: Readonly<Record<string, number>>;
  readonly generation: number;
  readonly sequence: number;
  readonly selectedPhase: IntegratedPhaseId;
  readonly selectedActivityId: string;
  readonly resumeBoundary: "preparation" | "child-result" | "phase-result";
  readonly completedPhases: readonly IntegratedPhaseId[];
  readonly results: readonly IntegratedSavedResult[];
}
export interface IntegratedLessonOptions {
  readonly lessonId: string;
  readonly plan: IntegratedPlan;
  readonly generation?: number;
  readonly saved?: IntegratedSavedState;
}
export interface IntegratedSnapshot {
  readonly status:
    "preparation" | "running" | "child-complete" | "phase-complete" | "lesson-complete";
  readonly phaseId: IntegratedPhaseId;
  readonly activity: IntegratedActivity;
  readonly identity: IntegratedIdentity;
  readonly ready: boolean;
  readonly purpose: "training" | "control";
  readonly visualAlternative: boolean;
  readonly completedPhases: readonly IntegratedPhaseId[];
  readonly results: readonly IntegratedSavedResult[];
  readonly independentControl: boolean;
  readonly auditoryVerified: boolean;
}
const cloneResult = (result: IntegratedSavedResult): IntegratedSavedResult =>
  ({
    ...result,
    errors: { ...result.errors },
    help: result.help.map((help) => ({ ...help })),
    ...(result.evidence ? { evidence: cloneMusicEvidence(result.evidence) } : {})
  }) as IntegratedSavedResult;
const sameIdentity = (a: IntegratedIdentity, b: IntegratedIdentity): boolean =>
  a.generation === b.generation &&
  a.presentationId === b.presentationId &&
  a.runId === b.runId &&
  a.activityId === b.activityId;
const hasErrors = (evidence: IntegratedEvidence): boolean =>
  Object.values(evidence.errors).some((value) => value > 0);
const SKILL_PHASE: Record<IntegratedSkill, IntegratedPhaseId> = {
  keyboard: "find-keys",
  reading: "read-melody",
  rhythm: "heard-rhythm",
  interval: "heard-intervals",
  harmony: "build-chords",
  coordination: "play-piece"
};

/** No inputs, sound, timers or child metrics are owned here. Leaving an identity invalidates it. */
export class IntegratedLesson {
  private readonly plan: IntegratedPlan;
  private readonly lessonId: string;
  private generation: number;
  private readonly replacements = new Map<string, IntegratedActivity>();
  private activitySeeds: Record<string, number> = {};
  private sequence: number;
  private phaseIndex = 0;
  private activityIndex = 0;
  private ready = false;
  private trainingAlternative = false;
  private visualAlternative = false;
  private status: IntegratedSnapshot["status"] = "preparation";
  private completed: IntegratedPhaseId[] = [];
  private results: IntegratedSavedResult[] = [];

  constructor(options: IntegratedLessonOptions) {
    this.plan = options.plan;
    this.lessonId = options.lessonId;
    const saved = options.saved;
    if (
      !options.lessonId ||
      (saved && (saved.lessonId !== options.lessonId || saved.planId !== options.plan.id))
    )
      throw new RangeError("Integrated saved state belongs to another plan or lesson");
    this.generation = saved ? saved.generation + 1 : (options.generation ?? 1);
    if (!Number.isSafeInteger(this.generation) || this.generation < 1)
      throw new RangeError("Invalid integrated generation");
    this.sequence = (saved?.sequence ?? 0) + 1;
    if (saved) {
      this.activitySeeds = { ...saved.activitySeeds };
      for (const [activityId, seed] of Object.entries(this.activitySeeds)) {
        const original = this.plan.phases
          .flatMap((phase) => phase.activities)
          .find((activity) => activity.id === activityId);
        if (!original) throw new RangeError("Unknown persisted integrated activity");
        this.replacements.set(activityId, regenerateIntegratedActivity(original, seed));
      }
      this.results = saved.results.map(cloneResult);
      this.completed = [...saved.completedPhases];
      this.phaseIndex = Math.max(
        0,
        this.plan.phases.findIndex((phase) => phase.id === saved.selectedPhase)
      );
      // Only completed result boundaries resume. Live input always starts with fresh readiness.
      const phase = this.phase();
      this.activityIndex = Math.max(
        0,
        phase.activities.findIndex((activity) => activity.id === saved.selectedActivityId)
      );
      if (saved.resumeBoundary === "phase-result" && this.completed.includes(phase.id)) {
        this.status =
          this.completed.length === this.plan.phases.length ? "lesson-complete" : "phase-complete";
      } else if (saved.resumeBoundary === "child-result" && this.latest(this.activity().id)) {
        this.status = "child-complete";
      }
    }
  }
  private phase() {
    const phase = this.plan.phases[this.phaseIndex];
    if (!phase) throw new RangeError("Missing integrated phase");
    return phase;
  }
  private activity(): IntegratedActivity {
    const activity = this.phase().activities[this.activityIndex];
    if (!activity) throw new RangeError("Missing integrated activity");
    return this.replacements.get(activity.id) ?? activity;
  }
  private identity(): IntegratedIdentity {
    const id = `${this.lessonId}:${String(this.generation)}:${String(this.sequence)}:${this.activity().id}`;
    return {
      generation: this.generation,
      presentationId: `${id}:presentation`,
      runId: `${id}:run`,
      activityId: this.activity().id
    };
  }
  private latest(activityId: string): IntegratedSavedResult | undefined {
    return this.results.findLast((result) => result.activityId === activityId);
  }
  snapshot(): IntegratedSnapshot {
    const final = this.plan.phases.at(-1)?.activities ?? [];
    const auditory = this.plan.phases
      .flatMap((phase) => phase.activities)
      .filter((activity) => activity.auditory);
    const auditoryVerified = auditory.every((activity) => {
      const result = this.latest(activity.id);
      return result?.auditoryVerified === true && !result.visualAlternative;
    });
    return {
      status: this.status,
      phaseId: this.phase().id,
      activity: this.activity(),
      identity: this.identity(),
      ready: this.ready,
      purpose: this.trainingAlternative ? "training" : this.activity().purpose,
      visualAlternative: this.visualAlternative,
      completedPhases: [...this.completed],
      results: this.results.map(cloneResult),
      auditoryVerified,
      independentControl:
        this.completed.includes("final-control") &&
        auditoryVerified &&
        final.every((activity) => {
          const result = this.latest(activity.id);
          return (
            !!result &&
            result.purpose === "control" &&
            !result.help.length &&
            !result.visualAlternative
          );
        })
    };
  }
  save(): IntegratedSavedState {
    return {
      lessonId: this.lessonId,
      planId: this.plan.id,
      activitySeeds: { ...this.activitySeeds },
      generation: this.generation,
      sequence: this.sequence,
      selectedPhase: this.phase().id,
      selectedActivityId: this.activity().id,
      resumeBoundary:
        this.status === "child-complete"
          ? "child-result"
          : ["phase-complete", "lesson-complete"].includes(this.status)
            ? "phase-result"
            : "preparation",
      completedPhases: [...this.completed],
      results: this.results.map(cloneResult)
    };
  }
  /** Novel material must be reserved atomically by the shared journal before being revealed. */
  setReady(
    identity: IntegratedIdentity,
    options: { readonly reservedFingerprint?: string; readonly ready?: boolean } = {}
  ): boolean {
    if (!sameIdentity(identity, this.identity()) || this.status !== "preparation") return false;
    if (options.ready === false) {
      this.ready = false;
      return true;
    }
    if (
      this.activity().noveltyRequired &&
      options.reservedFingerprint !== this.activity().exercise.fingerprint
    )
      return false;
    this.ready = true;
    return true;
  }
  /** Search is bounded by the shell; replacement is possible only before presentation readiness. */
  replaceNovelActivity(identity: IntegratedIdentity, nextSeed: number): boolean {
    if (
      !sameIdentity(identity, this.identity()) ||
      this.status !== "preparation" ||
      this.ready ||
      !this.activity().noveltyRequired ||
      !Number.isSafeInteger(nextSeed)
    )
      return false;
    const original = this.phase().activities[this.activityIndex];
    if (!original) return false;
    const replacement = regenerateIntegratedActivity(original, nextSeed);
    this.replacements.set(original.id, replacement);
    this.activitySeeds[original.id] = replacement.exercise.seed;
    this.generation++;
    this.prepare();
    return true;
  }
  /** The shell starts a fresh child/PracticeSession only when this manual command succeeds. */
  start(identity: IntegratedIdentity): boolean {
    if (!sameIdentity(identity, this.identity()) || !this.ready || this.status !== "preparation")
      return false;
    this.status = "running";
    return true;
  }
  /** Accepted once. The shell stores resultId's child run; this parent stores references only. */
  complete(result: IntegratedChildResult): boolean {
    const activity = this.activity();
    if (
      this.status !== "running" ||
      !sameIdentity(result, this.identity()) ||
      result.skill !== activity.skill ||
      result.status !== "completed" ||
      result.performedUnits < activity.expectedUnits ||
      !Number.isInteger(result.performedUnits) ||
      !result.resultId ||
      this.results.some(
        (saved) => saved.runId === result.runId || saved.resultId === result.resultId
      ) ||
      Object.values(result.errors).some((value) => !Number.isInteger(value) || value < 0)
    )
      return false;
    if (!["midi", "keyboard", "pointer"].includes(result.source)) return false;
    if (result.evidence) {
      const body = result.evidence;
      if (
        result.resultId !== result.runId ||
        !validateMusicEvidence(body, {
          runId: result.runId,
          presentationId: result.presentationId,
          inputSource: result.source
        }) ||
        body.material.id !== activity.exercise.id ||
        body.material.seed !== activity.exercise.seed ||
        body.material.fingerprint !== activity.exercise.fingerprint ||
        body.material.bpm !== activity.exercise.bpm ||
        result.performedUnits !==
          (result.skill === "harmony"
            ? body.answers.filter((answer) => answer.kind === "played").length
            : body.notes.length) ||
        body.listening.purpose !== result.purpose ||
        JSON.stringify(body.help) !== JSON.stringify(result.help) ||
        (result.auditoryVerified &&
          !body.listening.receipts.some((receipt) => receipt.outcome === "full"))
      )
        return false;
    }
    // Visual work is a permitted educational route, but never independent auditory evidence.
    if (result.auditoryVerified && (!activity.auditory || result.visualAlternative)) return false;
    if (activity.auditory && !result.visualAlternative && !result.auditoryVerified) return false;
    if (
      result.purpose !== (this.trainingAlternative ? "training" : activity.purpose) ||
      result.visualAlternative !== this.visualAlternative
    )
      return false;
    if (result.purpose === "control" && result.help.length) return false;
    this.results.push(cloneResult({ ...result, phaseId: this.phase().id }));
    const last = this.activityIndex === this.phase().activities.length - 1;
    if (last) {
      if (!this.completed.includes(this.phase().id)) this.completed.push(this.phase().id);
      this.status =
        this.completed.length === this.plan.phases.length ? "lesson-complete" : "phase-complete";
    } else this.status = "child-complete";
    this.ready = false;
    return true;
  }
  /** Advancing never starts input or audio: every activity must be presented and started again. */
  next(identity: IntegratedIdentity): boolean {
    if (
      !sameIdentity(identity, this.identity()) ||
      !["child-complete", "phase-complete"].includes(this.status)
    )
      return false;
    if (this.status === "child-complete") this.activityIndex++;
    else {
      const next = this.plan.phases.findIndex((phase) => !this.completed.includes(phase.id));
      if (next < 0) return false;
      this.phaseIndex = next;
      this.activityIndex = 0;
    }
    this.prepare();
    return true;
  }
  /** Manual repeats may interrupt a run. Prior child identities become stale immediately. */
  repeat(phaseId: IntegratedPhaseId): boolean {
    const index = this.plan.phases.findIndex((phase) => phase.id === phaseId);
    if (
      index < 0 ||
      this.plan.phases.slice(0, index).some((phase) => !this.completed.includes(phase.id))
    )
      return false;
    this.phaseIndex = index;
    this.activityIndex = 0;
    this.prepare();
    return true;
  }
  /** Control help is an explicit change to training, not a hidden independent-control result. */
  useVisualAlternative(identity: IntegratedIdentity): boolean {
    if (!sameIdentity(identity, this.identity()) || !this.activity().auditory) return false;
    this.prepare();
    this.trainingAlternative = true;
    this.visualAlternative = true;
    return true;
  }
  useTrainingAlternative(identity: IntegratedIdentity): boolean {
    if (!sameIdentity(identity, this.identity())) return false;
    this.prepare();
    this.trainingAlternative = true;
    return true;
  }
  private prepare(): void {
    this.trainingAlternative = false;
    this.visualAlternative = false;
    this.sequence++;
    this.ready = false;
    this.status = "preparation";
  }
}

export interface IntegratedObservation {
  readonly runId: string;
  readonly source: IntegratedInputSource;
  readonly skill: IntegratedSkill;
  readonly completed: boolean;
  readonly nonempty: boolean;
  readonly hadErrors: boolean;
  readonly usedHelp: boolean;
}
export interface IntegratedRecommendation {
  readonly policyVersion: 1;
  readonly kind: "repeat" | "route";
  readonly phaseId: IntegratedPhaseId | null;
}
/** Policy v1 compares run difficulty within each skill and selected input source only. */
export function recommendIntegratedPhase(
  observations: readonly IntegratedObservation[],
  source: IntegratedInputSource,
  completedPhases: readonly IntegratedPhaseId[],
  previousRecommendations: readonly IntegratedPhaseId[] = []
): IntegratedRecommendation {
  const route = (): IntegratedRecommendation => ({
    policyVersion: 1,
    kind: "route",
    phaseId: INTEGRATED_PHASE_IDS.find((phase) => !completedPhases.includes(phase)) ?? null
  });
  let selected: IntegratedPhaseId | null = null;
  let maximum = 0;
  for (const [skill, phaseId] of Object.entries(SKILL_PHASE) as [
    IntegratedSkill,
    IntegratedPhaseId
  ][]) {
    const seen = new Set<string>();
    const window = observations
      .toReversed()
      .filter((observation) => {
        if (
          observation.source !== source ||
          observation.skill !== skill ||
          !observation.completed ||
          !observation.nonempty ||
          seen.has(observation.runId)
        )
          return false;
        seen.add(observation.runId);
        return true;
      })
      .slice(0, 12);
    if (window.length < 3) continue;
    const ratio =
      window.filter((observation) => observation.hadErrors || observation.usedHelp).length /
      window.length;
    if (ratio > maximum) {
      maximum = ratio;
      selected = phaseId;
    }
  }
  if (
    !selected ||
    previousRecommendations.slice(-2).filter((phase) => phase === selected).length === 2
  )
    return route();
  return { policyVersion: 1, kind: "repeat", phaseId: selected };
}
export function integratedObservations(
  results: readonly IntegratedSavedResult[]
): readonly IntegratedObservation[] {
  return results.map((result) => ({
    runId: result.runId,
    source: result.source,
    skill: result.skill,
    completed: result.status === "completed",
    nonempty: result.performedUnits > 0,
    hadErrors: hasErrors(result),
    usedHelp: result.help.length > 0 || result.visualAlternative
  }));
}
