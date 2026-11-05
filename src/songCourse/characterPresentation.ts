import type { CourseMaterial } from "./model";
import type { CourseNoteFeedback } from "./provisional";

export type CourseCharacterNote = "do" | "re" | "mi";
export type CourseTeacherPose = "idle" | CourseCharacterNote;
export type CourseCharacterExpression = CourseNoteFeedback["state"];
export interface CourseCharacterPresentationInput {
  readonly material: CourseMaterial | null;
  readonly phase: string;
  readonly visible: boolean;
  readonly playing: boolean;
  readonly songTime: number;
  readonly targetSourceNoteId: string | null;
  readonly heldSourceNoteId: string | null;
  readonly expression: CourseCharacterExpression;
}
export interface CourseCharacterPresentation {
  readonly targetSourceNoteId: string | null;
  readonly companion: CourseCharacterNote | null;
  readonly expression: CourseCharacterExpression;
  readonly teacherPose: CourseTeacherPose;
}

const NOTES: Readonly<Record<number, CourseCharacterNote>> = { 60: "do", 62: "re", 64: "mi" };
const FINGERS: Readonly<Record<number, number>> = { 60: 1, 62: 2, 64: 3 };

/** Only exact verified learner-note contacts are illustrated; this never grades a performance. */
export function courseTeacherPose(
  material: CourseMaterial,
  sourceNoteId: string | null
): CourseTeacherPose {
  if (!sourceNoteId) return "idle";
  const expected = material.expected.find((note) => note.sourceNoteId === sourceNoteId);
  const note = expected && material.song.notes.find((value) => value.id === expected.runtimeNoteId);
  if (
    !expected ||
    note?.pitch !== expected.pitch ||
    !material.source.learnerPartIds.includes(note.part ?? "") ||
    note.hand !== "right" ||
    note.finger !== FINGERS[note.pitch]
  )
    return "idle";
  return NOTES[note.pitch] ?? "idle";
}

/** Song time is supplied by PracticeSession. No elapsed-time estimate or independent clock. */
export function courseCharacterPresentation(
  input: CourseCharacterPresentationInput
): CourseCharacterPresentation {
  const { material } = input;
  const guided =
    material !== null &&
    material.node.kind !== "independent-phrase" &&
    material.node.kind !== "performance";
  const target = material?.expected.find((note) => note.sourceNoteId === input.targetSourceNoteId);
  const active =
    input.visible &&
    guided &&
    input.playing &&
    (input.phase === "playing" || input.phase === "demo" || input.phase === "awaiting-release");
  let teacherSourceId: string | null = null;
  if (active) {
    if (input.phase === "demo") {
      for (const note of material.expected) {
        if (input.songTime >= note.start && input.songTime < note.start + note.duration) {
          if (teacherSourceId !== null)
            return {
              targetSourceNoteId: target?.sourceNoteId ?? null,
              companion: target ? (NOTES[target.pitch] ?? null) : null,
              expression: "neutral",
              teacherPose: "idle"
            };
          teacherSourceId = note.sourceNoteId;
        }
      }
    } else teacherSourceId = input.heldSourceNoteId;
  }
  return {
    targetSourceNoteId: target?.sourceNoteId ?? null,
    companion: input.visible && guided && target ? (NOTES[target.pitch] ?? null) : null,
    expression: input.visible && guided ? input.expression : "neutral",
    teacherPose: active ? courseTeacherPose(material, teacherSourceId) : "idle"
  };
}
