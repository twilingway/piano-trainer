import { INDEPENDENT_RHYTHM_SKILL_ID } from "./types";
import { validateIndependentRhythmResult } from "./validation";
import type {
  IndependentRhythmExercise,
  IndependentRhythmPhaseResult,
  IndependentRhythmResult
} from "./types";

export function createIndependentRhythmResult(
  exercise: IndependentRhythmExercise,
  pulse: IndependentRhythmPhaseResult,
  series: IndependentRhythmPhaseResult,
  metadata: {
    readonly startedAt: number;
    readonly completedAt: number;
    readonly createdAt?: number;
  }
): IndependentRhythmResult | null {
  return validateIndependentRhythmResult({
    id: `${pulse.config.runId}:result`,
    runId: pulse.config.runId,
    skillId: INDEPENDENT_RHYTHM_SKILL_ID,
    task: "independent-rhythms",
    exerciseId: exercise.id,
    seed: exercise.seed,
    generatorVersion: exercise.generatorVersion,
    rulesVersion: exercise.rulesVersion,
    startedAt: metadata.startedAt,
    completedAt: metadata.completedAt,
    createdAt: metadata.createdAt ?? metadata.completedAt,
    inputSource: pulse.config.source,
    pulse,
    series
  });
}
