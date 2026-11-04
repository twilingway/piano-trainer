import type {
  CourseExpectedNote,
  RawCourseInput,
  SongCourseAttemptConfig,
  SongCourseGradeEvidence,
  SongCourseSource
} from "./model";

export const TEST_SOURCE_HASH = "a".repeat(64);

export function expectedNote(
  index = 0,
  pitch = 60,
  start = index,
  duration = 1
): CourseExpectedNote {
  return {
    sourceNoteId: `test@r1:n${String(index)}`,
    runtimeNoteId: `runtime${String(index)}`,
    pitch,
    start,
    duration,
    startBeat: start,
    phraseId: `phrase${String(Math.floor(index / 4))}`,
    measureIndex: Math.floor(index / 4)
  };
}
export function courseConfig(
  expected: readonly CourseExpectedNote[] = [expectedNote()],
  overrides: Partial<SongCourseAttemptConfig> = {}
): SongCourseAttemptConfig {
  return {
    runId: "run1",
    learnerPartIds: ["learner"],
    songId: "test",
    sourceRevision: "r1",
    sourceHash: TEST_SOURCE_HASH,
    nodeId: "performance",
    mode: "tempo",
    speed: 1,
    expected,
    ...overrides
  };
}
export function rawInput(
  type: "down" | "up",
  performanceMs: number,
  ordinal: number,
  pitch = 60,
  overrides: Partial<RawCourseInput> = {}
): RawCourseInput {
  return {
    type,
    source: "midi",
    pitch,
    performanceMs,
    stableOrdinal: ordinal,
    songTime: performanceMs / 1000,
    ...overrides
  };
}
export function gradeEvidence(
  inputs: readonly RawCourseInput[],
  overrides: Partial<SongCourseGradeEvidence> = {}
): SongCourseGradeEvidence {
  return {
    inputs,
    musicalEndPerformanceMs: 1000,
    closedAtPerformanceMs: 1200,
    createdAt: 1700000000000,
    ...overrides
  };
}
export function sourceFixture(): SongCourseSource {
  return {
    id: "test",
    revision: "r1",
    sourceHash: TEST_SOURCE_HASH,
    title: "Test",
    musicXml: "",
    learnerPartIds: ["learner"],
    accompanimentPartIds: ["backing"],
    partHands: [
      { partId: "learner", staff: "1", hand: "right" },
      { partId: "backing", staff: "1", hand: "left" }
    ],
    phrases: [{ id: "phrase0", fromMeasure: 0, toMeasure: 2, sourceNoteIds: ["n0"] }],
    nodes: [
      {
        id: "performance",
        songId: "test",
        kind: "performance",
        title: "Test",
        instruction: "Test",
        phraseIds: ["phrase0"],
        sourceNoteIds: ["n0"]
      }
    ]
  };
}
