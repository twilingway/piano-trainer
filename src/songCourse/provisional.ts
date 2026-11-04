import { alignCourseInputs, physicalInputKey } from "./alignment";
import { gradeCourseHold, physicalPerformanceMs } from "./hold";
import { gradeCourseNote } from "./rubric";
import type {
  CoursePause,
  CoursePresentation,
  RawCourseInput,
  SongCourseAttemptConfig,
  CourseMistakeKind
} from "./model";
export interface CourseNoteFeedback {
  readonly sourceNoteId: string;
  readonly state: "neutral" | "correct" | "gentle-wrong";
  readonly reason?: CourseMistakeKind;
}
export interface ProvisionalCourseEvidence {
  readonly inputs: readonly RawCourseInput[];
  readonly presentations: readonly CoursePresentation[];
  readonly pauses: readonly CoursePause[];
  readonly musicalEndMs: number;
}
/** No credit is awarded here. A held note remains neutral until a real release settles its length. */
export function provisionalCourseFeedback(
  config: SongCourseAttemptConfig,
  evidence: ProvisionalCourseEvidence,
  input: RawCourseInput
): readonly CourseNoteFeedback[] {
  if (input.synthetic || input.controlRehold) return [];
  const alignment = alignCourseInputs(
    config.expected,
    evidence.inputs,
    config.mode,
    config.speed,
    evidence.presentations,
    evidence.musicalEndMs
  );
  const edge = alignment.inputs.find(
    (candidate) => candidate.stableOrdinal === input.stableOrdinal
  );
  if (!edge || (input.type === "down" && input.admitted === false)) return [];
  const closedAtMs = physicalPerformanceMs(input);
  if (input.type === "up") {
    return config.expected.flatMap((note) => {
      const down = alignment.primary.get(note.sourceNoteId);
      if (!down || physicalInputKey(down) !== physicalInputKey(input)) return [];
      const hold = gradeCourseHold(
        note,
        down,
        alignment.inputs,
        evidence.pauses,
        config.speed,
        config.mode,
        closedAtMs
      );
      if (!hold.released) return [];
      const grade = gradeCourseNote(config, note, alignment, evidence.pauses, closedAtMs);
      const reason = grade.mistakes[0];
      return [
        {
          sourceNoteId: note.sourceNoteId,
          state: reason ? ("gentle-wrong" as const) : ("correct" as const),
          ...(reason ? { reason } : {})
        }
      ];
    });
  }
  const matched = config.expected.find(
    (note) => alignment.primary.get(note.sourceNoteId)?.stableOrdinal === input.stableOrdinal
  );
  if (matched) {
    const grade = gradeCourseNote(config, matched, alignment, evidence.pauses, closedAtMs);
    return [
      {
        sourceNoteId: matched.sourceNoteId,
        state: grade.onsetCorrect === false ? "gentle-wrong" : "neutral",
        ...(grade.onsetCorrect === false ? { reason: "onset" as const } : {})
      }
    ];
  }
  if (!alignment.extra.some((extra) => extra.stableOrdinal === input.stableOrdinal)) return [];
  const physicalMs = input.rawPerformanceMs ?? input.performanceMs;
  const shown = [...evidence.presentations]
    .filter((item) => item.performanceMs <= physicalMs)
    .at(-1);
  const target =
    config.mode === "wait"
      ? config.expected.find((note) => note.sourceNoteId === shown?.sourceNoteId)
      : config.expected.reduce((previous, note) =>
          Math.abs(note.start - input.songTime) < Math.abs(previous.start - input.songTime)
            ? note
            : previous
        );
  return target
    ? [{ sourceNoteId: target.sourceNoteId, state: "gentle-wrong", reason: "pitch" }]
    : [];
}
