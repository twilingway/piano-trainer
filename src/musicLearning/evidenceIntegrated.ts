import { createIntegratedPlan, regenerateIntegratedActivity } from "./integratedPlan";
import type { IntegratedActivity, IntegratedPlanOptions } from "./integratedPlan";
import type { IntegratedSavedResult } from "./integrated";
import { validateMusicEvidence } from "./evidenceValidation";
import { computeHarmonyMetrics, computeSightReadingMetrics } from "./progress";
import type { MusicExercise } from "./types";

const sameMaterial = (
  a: MusicExercise,
  b: NonNullable<IntegratedSavedResult["evidence"]>["material"]
): boolean =>
  a.id === b.id &&
  a.seed === b.seed &&
  a.bpm === b.bpm &&
  a.fingerprint === b.fingerprint &&
  a.generatorVersion === b.generatorVersion;
function actualMaterial(activity: IntegratedActivity, result: IntegratedSavedResult): boolean {
  const material = result.evidence?.material;
  if (!material) return false;
  if (sameMaterial(activity.exercise, material)) return true;
  if (!activity.noveltyRequired) return false;
  try {
    return sameMaterial(regenerateIntegratedActivity(activity, material.seed).exercise, material);
  } catch {
    return false;
  }
}
/** Earlier repeats keep their own recipe even after a later attempt replaced that child's seed. */
export function validateIntegratedEvidence(
  results: readonly IntegratedSavedResult[],
  recipe: IntegratedPlanOptions
): boolean {
  if (!results.some((result) => result.evidence !== undefined)) return true;
  try {
    const plan = createIntegratedPlan(recipe);
    return results.every((result) => {
      if (result.evidence === undefined) return true;
      const activity = plan.phases
        .flatMap((phase) => phase.activities)
        .find((child) => child.id === result.activityId);
      if (
        !activity ||
        result.resultId !== result.runId ||
        !validateMusicEvidence(result.evidence, {
          runId: result.runId,
          presentationId: result.presentationId,
          inputSource: result.source
        }) ||
        !actualMaterial(activity, result)
      )
        return false;
      const body = result.evidence;
      const presented = sameMaterial(activity.exercise, body.material)
        ? activity
        : regenerateIntegratedActivity(activity, body.material.seed);
      if (
        body.listening.purpose !== result.purpose ||
        JSON.stringify(body.help) !== JSON.stringify(result.help)
      )
        return false;
      if (
        result.auditoryVerified &&
        !body.listening.receipts.some((receipt) => receipt.outcome === "full")
      )
        return false;
      const units =
        result.skill === "harmony"
          ? body.answers.filter((answer) => answer.kind === "played").length
          : body.notes.length;
      if (units !== result.performedUnits) return false;
      const reading = computeSightReadingMetrics(
        body.material.notes,
        body.notes,
        [],
        result.purpose
      );
      switch (result.skill) {
        case "keyboard":
          return result.errors.wrongKeys === reading.extraNotes;
        case "reading": {
          if (presented.kind !== "sight-reading") return false;
          const sight = presented.exercise;
          const group =
            result.purpose === "training"
              ? sight.groups[0]
              : sight.level === "notes"
                ? undefined
                : (sight.groups.find(
                    (candidate) => candidate.kind === "scalar" || candidate.kind === "triadic"
                  ) ?? (sight.level === "two-hands" ? undefined : sight.groups[0]));
          const choices = body.inputJournal.events.filter(
            (event) =>
              event.kind === "choice" &&
              event.eligible &&
              ["scalar", "triadic", "repeated", "mixed"].includes(event.value)
          );
          const groupErrors = group
            ? choices.filter((event) => event.kind === "choice" && event.value !== group.kind)
                .length
            : 0;
          return (
            result.errors.groups === groupErrors &&
            (group !== undefined || choices.length === 0) &&
            result.errors.pitches === reading.missingNotes + reading.extraNotes &&
            result.errors.timing === (reading.onsetErrors ?? 0) + (reading.durationErrors ?? 0)
          );
        }
        case "interval":
          return (
            result.errors.pitches === reading.missingNotes + reading.extraNotes &&
            result.errors.recognition ===
              body.answers.filter(
                (answer) => answer.kind === "named" && answer.expected !== answer.answer
              ).length +
                (body.answers.some((answer) => answer.kind === "named") ? 0 : 1)
          );
        case "harmony": {
          const harmony = computeHarmonyMetrics(body.answers);
          return (
            result.errors.pitches === harmony.pitchErrors &&
            result.errors.bass === harmony.bassErrors &&
            result.errors.synchrony === harmony.synchronyErrors
          );
        }
        case "coordination": {
          const errors = (hand: "left" | "right") => {
            const metrics = computeSightReadingMetrics(
              body.material.notes.filter((note) => note.hand === hand),
              body.notes.filter((note) => note.hand === hand),
              [],
              result.purpose
            );
            return metrics.missingNotes + metrics.extraNotes;
          };
          return (
            result.errors.left === errors("left") &&
            result.errors.right === errors("right") &&
            result.errors.timing === (reading.onsetErrors ?? 0) + (reading.durationErrors ?? 0)
          );
        }
        case "rhythm": {
          const comparison = body.dictation?.comparison;
          const errors = (values: readonly number[]) =>
            values.filter((value) => Math.abs(value) > 0.125).length;
          return (
            result.errors.onsets ===
              (comparison
                ? errors(comparison.alignedOnsets.errorsBeats)
                : (reading.onsetErrors ?? 0)) &&
            result.errors.durations ===
              (comparison
                ? errors(comparison.holdingDurations.errorsBeats)
                : (reading.durationErrors ?? 0)) &&
            result.errors.missing === (comparison?.missingNotes ?? reading.missingNotes) &&
            result.errors.extra === (comparison?.extraNotes ?? reading.extraNotes)
          );
        }
      }
    });
  } catch {
    return false;
  }
}
