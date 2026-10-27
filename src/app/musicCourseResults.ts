import { summarizeDictationListening } from "../musicLearning/dictationListening";
import type {
  IntegratedChildResult,
  IntegratedSavedState,
  IntegratedSnapshot
} from "../musicLearning/integrated";
import type { IntegratedPlan } from "../musicLearning/integratedPlan";
import {
  computeHarmonyMetrics,
  computeSightReadingMetrics,
  HARMONY_ONSET_WINDOW_MS
} from "../musicLearning/progress";
import { buildTriad, compareHarmonyTransition } from "../musicLearning/harmony";
import type {
  IntegratedMusicResult,
  MusicGroupAnswer,
  MusicInputSource,
  MusicResult,
  MusicResultCommon
} from "../musicLearning/progress";
import type { MusicCourseMetric, MusicCourseResultView } from "../ui/musicCourseTypes";
import type { MusicActivity } from "./musicCourseExercise";
import type { MusicRunEvidence, MusicRunIdentity } from "./musicCourseRun";
import type { MusicPersistentState } from "./musicPersistence";
import type { EmbeddedMusicEvidence } from "../musicLearning/evidence";

export interface MusicResultContext {
  readonly activity: MusicActivity;
  readonly saved: MusicPersistentState;
  readonly identity: MusicRunIdentity;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly newMaterial: boolean;
  readonly evidence: MusicRunEvidence;
  readonly groupAnswers: readonly MusicGroupAnswer[];
  readonly previewSeconds: number;
  readonly visualAlternative: boolean;
  readonly inputSource?: MusicInputSource;
}
function common(context: MusicResultContext): MusicResultCommon {
  const journal = context.evidence.inputJournal;
  return {
    ...(journal
      ? { provenance: "native" as const, inputJournal: journal }
      : { provenance: "legacy" as const }),
    id: context.identity.runId,
    runId: context.identity.runId,
    exerciseId: context.activity.exercise.id,
    seed: context.activity.exercise.seed,
    generatorVersion: 1,
    bpm: context.activity.exercise.bpm,
    purpose: context.visualAlternative ? "training" : context.activity.purpose,
    inputSource: context.inputSource ?? context.saved.inputSource,
    startedAt: context.startedAt,
    completedAt: context.completedAt,
    newMaterial: !!journal && context.newMaterial,
    fingerprint: context.activity.exercise.fingerprint,
    help: context.evidence.help
  };
}

/** Empty or visual-only dictation has a visible outcome, never a fabricated auditory history run. */
export function createMusicStandaloneResult(context: MusicResultContext): MusicResult | null {
  const { saved, activity, evidence } = context;
  const base = common(context);
  if (
    activity.auditory &&
    !context.visualAlternative &&
    !evidence.listening.receipts.some((receipt) => receipt.outcome === "full")
  )
    return null;
  switch (saved.course) {
    case "sight-reading":
      if (!evidence.notes.length) return null;
      return {
        ...base,
        course: "sight-reading",
        level: activity.sight?.level ?? saved.sightLevel,
        previewSeconds: context.previewSeconds,
        expectedNotes: activity.exercise.notes,
        playedNotes: evidence.notes,
        groupAnswers: context.groupAnswers,
        metrics: computeSightReadingMetrics(
          activity.exercise.notes,
          evidence.notes,
          context.groupAnswers,
          activity.purpose
        )
      };
    case "harmony":
      if (
        !evidence.answers.some(
          (answer) =>
            answer.kind === "named" || answer.playedPitches.length > 0 || answer.attempts.length > 0
        )
      )
        return null;
      {
        const answers = [...evidence.answers];
        const played = answers.filter((answer) => answer.kind === "played");
        for (const step of activity.chords?.slice(played.length) ?? [])
          answers.push({
            kind: "played",
            target: step.target,
            playedPitches: [],
            spreadMs: null,
            attempts: [],
            startBeat: step.startBeat,
            hand: activity.taskKind === "accompaniment" ? "left" : "right"
          });
        return {
          ...base,
          course: "harmony",
          lesson: saved.harmonyLesson,
          ...(activity.toneRecipe ? { toneRecipe: activity.toneRecipe } : {}),
          aural: activity.auditory && !context.visualAlternative,
          mode: saved.harmonyMode,
          expectedNotes: activity.exercise.notes,
          answers,
          metrics: computeHarmonyMetrics(answers)
        };
      }
    case "dictation":
      if (context.visualAlternative || evidence.dictation?.comparison.status !== "performed")
        return null;
      return {
        ...base,
        course: "dictation",
        expectedNotes: activity.exercise.notes,
        startMode: activity.dictation?.startMode ?? saved.dictationStartMode,
        level: activity.dictation?.level ?? 1,
        result: evidence.dictation
      };
    default:
      return null;
  }
}
function countErrors(values: readonly number[], tolerance = 0.125): number {
  return values.filter((value) => Math.abs(value) > tolerance).length;
}

export function createMusicIntegratedChild(
  context: MusicResultContext,
  snapshot: IntegratedSnapshot
): IntegratedChildResult {
  const { evidence, activity } = context;
  const reading = computeSightReadingMetrics(
    activity.exercise.notes,
    evidence.notes,
    context.groupAnswers,
    activity.purpose
  );
  const harmony = computeHarmonyMetrics(evidence.answers);
  const dictation = evidence.dictation?.comparison;
  const performedUnits =
    snapshot.activity.kind === "harmony"
      ? evidence.answers.filter((answer) => answer.kind === "played").length
      : evidence.notes.length;
  const journal = evidence.inputJournal;
  const embedded: EmbeddedMusicEvidence | null = journal
    ? {
        schemaVersion: 1,
        startedAt: context.startedAt,
        completedAt: context.completedAt,
        material: {
          id: activity.exercise.id,
          seed: activity.exercise.seed,
          generatorVersion: 1,
          bpm: activity.exercise.bpm,
          fingerprint: activity.exercise.fingerprint,
          notes: activity.exercise.notes,
          ...(activity.toneRecipe ? { toneRecipe: activity.toneRecipe } : {})
        },
        inputJournal: journal,
        notes: evidence.notes,
        answers: evidence.answers,
        dictation: evidence.dictation,
        listening: evidence.listening,
        help: evidence.help
      }
    : null;
  const base = {
    ...snapshot.identity,
    ...(embedded ? { evidence: embedded } : {}),
    resultId: context.identity.runId,
    purpose: snapshot.purpose,
    source: context.inputSource ?? context.saved.inputSource,
    status: performedUnits > 0 ? ("completed" as const) : ("empty" as const),
    performedUnits,
    help: evidence.help,
    visualAlternative: snapshot.visualAlternative,
    auditoryVerified:
      snapshot.activity.auditory &&
      !context.visualAlternative &&
      evidence.listening.receipts.some((receipt) => receipt.outcome === "full")
  };
  switch (snapshot.activity.skill) {
    case "keyboard":
      return { ...base, skill: "keyboard", errors: { wrongKeys: reading.extraNotes } };
    case "reading":
      return {
        ...base,
        skill: "reading",
        errors: {
          pitches: reading.missingNotes + reading.extraNotes,
          timing: (reading.onsetErrors ?? 0) + (reading.durationErrors ?? 0),
          groups: reading.groupErrors ?? 0
        }
      };
    case "rhythm":
      return {
        ...base,
        skill: "rhythm",
        errors: {
          onsets: dictation
            ? countErrors(dictation.alignedOnsets.errorsBeats)
            : (reading.onsetErrors ?? 0),
          durations: dictation
            ? countErrors(dictation.holdingDurations.errorsBeats)
            : (reading.durationErrors ?? 0),
          missing: dictation?.missingNotes ?? reading.missingNotes,
          extra: dictation?.extraNotes ?? reading.extraNotes
        }
      };
    case "interval":
      return {
        ...base,
        skill: "interval",
        errors: {
          recognition:
            evidence.answers.filter(
              (answer) => answer.kind === "named" && answer.expected !== answer.answer
            ).length + (evidence.answers.some((answer) => answer.kind === "named") ? 0 : 1),
          pitches: reading.missingNotes + reading.extraNotes
        }
      };
    case "harmony":
      return {
        ...base,
        skill: "harmony",
        errors: {
          pitches: harmony.pitchErrors,
          bass: harmony.bassErrors,
          synchrony: harmony.synchronyErrors
        }
      };
    case "coordination": {
      const handErrors = (hand: "left" | "right") => {
        const metrics = computeSightReadingMetrics(
          activity.exercise.notes.filter((note) => note.hand === hand),
          evidence.notes.filter((note) => note.hand === hand),
          [],
          activity.purpose
        );
        return metrics.missingNotes + metrics.extraNotes;
      };
      return {
        ...base,
        skill: "coordination",
        errors: {
          left: handErrors("left"),
          right: handErrors("right"),
          timing: (reading.onsetErrors ?? 0) + (reading.durationErrors ?? 0)
        }
      };
    }
  }
}

export function createMusicIntegratedResult(
  context: MusicResultContext,
  lesson: {
    readonly plan: IntegratedPlan;
    readonly state: IntegratedSavedState;
    readonly independentControl: boolean;
    readonly auditoryVerified: boolean;
  }
): IntegratedMusicResult {
  const controlled = lesson.independentControl && lesson.auditoryVerified;
  const { inputJournal: _childJournal, ...parent } = common(context);
  const native = lesson.state.results.every((child) => child.evidence !== undefined);
  return {
    ...parent,
    provenance: native ? "native" : "legacy",
    newMaterial: native && parent.newMaterial,
    id: lesson.state.lessonId,
    runId: lesson.state.lessonId,
    startedAt: Math.min(
      context.startedAt,
      ...lesson.state.results.flatMap((child) => (child.evidence ? [child.evidence.startedAt] : []))
    ),
    exerciseId: lesson.plan.id,
    seed: lesson.plan.seed,
    fingerprint: lesson.plan.id,
    course: "integrated",
    purpose: controlled ? "control" : "training",
    help: controlled ? [] : context.evidence.help,
    plan: { seed: lesson.plan.seed, version: 1, theme: lesson.plan.theme, bpm: lesson.plan.bpm },
    state: lesson.state
  };
}
const metric = (labelKey: string, value: MusicCourseMetric["value"]): MusicCourseMetric => ({
  labelKey,
  value
});
const percent = (value: number | null): string | null =>
  value === null ? null : `${String(Math.round(value * 100))}%`;

export function createMusicResultView(
  result: MusicResult | null,
  context?: MusicResultContext
): MusicCourseResultView {
  if (!result)
    return {
      summaryKey: context?.visualAlternative
        ? "Зрительная тренировка завершена. Слуховой навык не оценивался."
        : "Пока нет завершённого ответа.",
      metrics: context ? [metric("Нот в ответе", context.evidence.notes.length)] : [],
      ...(context
        ? {
            notes: {
              expectedNotes: context.activity.exercise.notes,
              playedNotes: context.evidence.notes
            }
          }
        : {}),
      helped: (context?.evidence.help.length ?? 0) > 0,
      newMaterial: context?.newMaterial ?? false
    };
  let metrics: readonly MusicCourseMetric[];
  switch (result.course) {
    case "sight-reading":
      metrics = [
        metric("Нот в партитуре", result.metrics.expectedNotes),
        metric("Нот в ответе", result.metrics.playedNotes),
        metric("Ошибки высоты", result.metrics.pitchErrors),
        metric("Пропущенные ноты", result.metrics.missingNotes),
        metric("Лишние ноты", result.metrics.extraNotes),
        metric("Ошибки ритма", result.metrics.onsetErrors),
        metric("Ошибки удержания", result.metrics.durationErrors),
        metric("Ошибки распознавания групп", result.metrics.groupErrors)
      ];
      break;
    case "harmony":
      metrics = [
        metric("Ответов на задания", result.metrics.totalAnswers),
        metric("Верных ответов", result.metrics.correctAnswers),
        metric("Ошибки высоты", result.metrics.pitchErrors),
        metric("Ошибки баса", result.metrics.bassErrors),
        metric("Ошибки одновременности", result.metrics.synchronyErrors),
        metric("Ошибки определения", result.metrics.theoryErrors),
        ...(result.lesson === "accompaniment"
          ? [
              metric(
                "Аккорды вне пульса",
                result.answers.filter(
                  (answer) =>
                    answer.kind === "played" &&
                    answer.onsetOffsetMs !== undefined &&
                    answer.onsetOffsetMs !== null &&
                    Math.abs(answer.onsetOffsetMs) > HARMONY_ONSET_WINDOW_MS
                ).length
              )
            ]
          : [])
      ];
      if (result.lesson === "voice-leading") {
        const played = result.answers.filter((answer) => answer.kind === "played");
        const previous = played[0]?.playedPitches.toSorted((a, b) => a - b),
          next = played[1];
        const first = previous?.[0],
          second = previous?.[1],
          third = previous?.[2];
        const root = played[0]?.target.pitches[0];
        if (
          previous?.length === 3 &&
          first !== undefined &&
          second !== undefined &&
          third !== undefined &&
          root !== undefined &&
          next
        ) {
          const transition = compareHarmonyTransition(
            [first, second, third],
            buildTriad(root + 5, "major"),
            next.playedPitches,
            { low: root - 12, high: root + 16 }
          );
          metrics = [
            ...metrics,
            {
              labelKey: "Расположение в диапазоне руки",
              value: null,
              valueKey: transition.admissible
                ? "Допустимое расположение аккорда"
                : "Расположение вне допустимого диапазона"
            },
            {
              labelKey: "Оптимальность перехода",
              value: null,
              valueKey: transition.optimal ? "Минимальное движение голосов" : "Переход не оптимален"
            },
            metric("Движение голосов, полутоны", transition.motion),
            metric("Минимальное движение, полутоны", transition.minimumMotion),
            metric("Общие звуки аккордов", transition.commonPitches.length)
          ];
        }
      }
      break;
    case "dictation": {
      const comparison = result.result.comparison;
      const listening = summarizeDictationListening(result.result.listening);
      metrics = [
        metric(
          result.startMode === "relative" ? "Относительные высоты" : "Точные высоты",
          percent(comparison.positionalPitchAccuracy)
        ),
        ...(result.startMode === "relative"
          ? [metric("Сдвиг первой ноты, полутоны", comparison.transposition)]
          : []),
        metric("Порядок нот", percent(comparison.orderAccuracy)),
        metric("Пропущенные ноты", comparison.missingNotes),
        metric("Лишние ноты", comparison.extraNotes),
        metric(
          "Среднее отклонение ритма, доли",
          comparison.onsetIntervals.meanAbsoluteErrorBeats === null
            ? null
            : Number(comparison.onsetIntervals.meanAbsoluteErrorBeats.toFixed(3))
        ),
        metric("Ошибки удержания", countErrors(comparison.holdingDurations.errorsBeats)),
        metric("Полных прослушиваний", listening.full),
        metric("Частичных прослушиваний", listening.partial)
      ];
      break;
    }
    case "integrated":
      metrics = [
        metric("Завершено этапов", result.state.completedPhases.length),
        metric(
          "Выполнено заданий",
          new Set(result.state.results.map((child) => child.activityId)).size
        )
      ];
      break;
  }
  return {
    summaryKey: "Результат музыкального задания",
    metrics,
    ...(result.course === "sight-reading"
      ? { notes: { expectedNotes: result.expectedNotes, playedNotes: result.playedNotes } }
      : result.course === "dictation"
        ? {
            notes: {
              expectedNotes: result.expectedNotes,
              playedNotes: result.result.notes.map((note) => ({
                pitch: note.pitch,
                startBeat: note.startBeat,
                durationBeats: note.durationBeats,
                hand: "right" as const
              }))
            }
          }
        : {}),
    helped:
      result.help.length > 0 ||
      (result.course === "integrated" &&
        result.state.results.some((child) => child.help.length > 0 || child.visualAlternative)),
    newMaterial: result.newMaterial
  };
}
