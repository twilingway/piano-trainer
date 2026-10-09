import { describe, expect, it } from "vitest";
import {
  canCreditCourseRun,
  blockingLessonNumber,
  courseSelections,
  firstIncompleteSelection,
  lessonCompleted,
  lessonUnlocked,
  nextSelection,
  phraseCompleted,
  phraseVersion,
  progressKey,
  resolveSelection,
  runContext,
  stageCompleted,
  stagePhrases,
  stageProgress,
  type CourseLesson,
  type CourseProgress,
  type CourseRunResult,
  type CourseSelection
} from "./model";

const first = { id: "first", version: "1", musicXml: "<score>first</score>" };
const second = { id: "second", version: "1", musicXml: "<score>second</score>" };
const lesson: CourseLesson = {
  id: "lesson-01",
  number: 1,
  title: "Lesson",
  goal: "Goal",
  stages: ["right", "left", "both"],
  phrases: [first, second]
};
const selection: CourseSelection = { lessonId: lesson.id, stage: "right", phraseId: "first" };
const result = (changes: Partial<CourseRunResult> = {}): CourseRunResult => ({
  context: runContext(lesson, selection) ?? "",
  songKey: "course-song",
  mode: "wait",
  from: 0,
  to: 10,
  hands: ["right"],
  hitCount: 1,
  interrupted: false,
  fullRange: true,
  ...changes
});

describe("course progression", () => {
  it("shows partial progress for only the phrases assigned to a hand", () => {
    const assigned: CourseLesson = {
      ...lesson,
      tasks: [
        { phraseId: first.id, stage: "right" },
        { phraseId: second.id, stage: "left" },
        { phraseId: first.id, stage: "both" },
        { phraseId: second.id, stage: "both" }
      ]
    };
    const progress: CourseProgress = {
      [progressKey(assigned, "both", first)]: true,
      [progressKey(assigned, "right", second)]: true
    };
    expect(stageProgress(assigned, "both", progress)).toEqual({ done: 1, total: 2 });
    expect(stageProgress(assigned, "right", progress)).toEqual({ done: 0, total: 1 });
    expect(stageProgress({ ...assigned, stages: ["both"] }, "left", progress)).toEqual({
      done: 0,
      total: 0
    });
  });

  it("unlocks the next ready lesson with only its predecessor's explicit final credit", () => {
    const firstLesson: CourseLesson = {
      ...lesson,
      finalTask: { stage: "both", phraseId: second.id }
    };
    const next = { ...lesson, id: "lesson-02", number: 2 };
    const lessons = [firstLesson, next];
    expect(lessonUnlocked(firstLesson, lessons, {})).toBe(true);
    expect(blockingLessonNumber(next, lessons, {})).toBe(1);
    const partial: CourseProgress = {
      [progressKey(firstLesson, "right", second)]: true,
      [progressKey(firstLesson, "both", first)]: true
    };
    expect(lessonUnlocked(next, lessons, partial)).toBe(false);
    const progress: CourseProgress = {
      ...partial,
      [progressKey(firstLesson, "both", second)]: true
    };
    expect(lessonCompleted(firstLesson, progress)).toBe(false);
    expect(lessonUnlocked(next, lessons, progress)).toBe(true);
    expect(lessonUnlocked({ ...next, phrases: [] }, lessons, progress)).toBe(false);
    expect(blockingLessonNumber(next, lessons, progress)).toBeNull();
  });

  it("checks the whole numeric chain without guessing absent final metadata or lessons", () => {
    const firstLesson: CourseLesson = {
      ...lesson,
      finalTask: { stage: "both", phraseId: second.id }
    };
    const next: CourseLesson = { ...firstLesson, id: "lesson-02", number: 2 };
    const third = { ...next, id: "lesson-03", number: 3 };
    const progress: CourseProgress = { [progressKey(next, "both", second)]: true };
    expect(blockingLessonNumber(third, [firstLesson, next, third], progress)).toBe(1);
    progress[progressKey(firstLesson, "both", second)] = true;
    expect(lessonUnlocked(third, [firstLesson, next, third], progress)).toBe(true);
    expect(blockingLessonNumber(third, [firstLesson, third], progress)).toBe(2);
    expect(blockingLessonNumber(next, [lesson, next], progress)).toBe(1);
    expect(lessonUnlocked(lesson, [lesson, next], progress)).toBe(true);
    expect(blockingLessonNumber(next, [firstLesson, firstLesson, next], progress)).toBe(1);
    expect(
      blockingLessonNumber(
        next,
        [{ ...firstLesson, finalTask: { stage: "right", phraseId: second.id } }, next],
        progress
      )
    ).toBe(1);
    expect(
      blockingLessonNumber(
        next,
        [{ ...firstLesson, tasks: [{ stage: "right", phraseId: second.id }] }, next],
        progress
      )
    ).toBe(1);
  });

  it("relocks after a revised final, but preserves access after a changed nonfinal phrase", () => {
    const firstLesson: CourseLesson = {
      ...lesson,
      finalTask: { stage: "both", phraseId: second.id }
    };
    const next = { ...lesson, id: "lesson-02", number: 2 };
    const progress: CourseProgress = {
      [progressKey(firstLesson, "both", second)]: true,
      [progressKey(next, "right", first)]: true
    };
    for (const revised of [
      { ...second, version: "2" },
      { ...second, musicXml: "corrected" }
    ]) {
      const changed = { ...firstLesson, phrases: [first, revised] };
      expect(lessonUnlocked(next, [changed, next], progress)).toBe(false);
    }
    const changed = { ...firstLesson, phrases: [{ ...first, musicXml: "corrected" }, second] };
    expect(lessonUnlocked(next, [changed, next], progress)).toBe(true);
    expect(phraseCompleted(next, "right", first, progress)).toBe(true);
  });

  it("follows fourteen explicit tasks and counts only each stage's assigned phrases", () => {
    const warmup = { ...first, id: "warmup", title: "Warmup" };
    const whole = { ...second, id: "whole", title: "Whole" };
    const melody = Array.from({ length: 4 }, (_, index) => ({
      ...first,
      id: `melody-${String(index)}`
    }));
    const ordered: CourseLesson = {
      ...lesson,
      phrases: [warmup, ...melody, whole],
      tasks: [
        { phraseId: warmup.id, stage: "both" },
        ...lesson.stages.flatMap((stage) =>
          melody.map((phrase) => ({ phraseId: phrase.id, stage }))
        ),
        { phraseId: whole.id, stage: "both" }
      ]
    };
    const tasks = courseSelections(ordered);
    expect(tasks).toHaveLength(14);
    expect(stagePhrases(ordered, "right")).toEqual(melody);
    expect(stagePhrases(ordered, "left")).toEqual(melody);
    expect(stagePhrases(ordered, "both")).toEqual([warmup, ...melody, whole]);
    const progress: CourseProgress = {};
    for (const [index, task] of tasks.entries()) {
      expect(firstIncompleteSelection(ordered, progress)).toEqual(task);
      expect(nextSelection(ordered, task)).toEqual(tasks[index + 1] ?? null);
      const phrase = resolveSelection([ordered], task)?.phrase;
      expect(phrase).toBeDefined();
      if (!phrase) throw new Error("Missing assigned phrase");
      progress[progressKey(ordered, task.stage, phrase)] = true;
      if (index === 4) {
        expect(stageCompleted(ordered, "right", progress)).toBe(true);
        expect(stageCompleted(ordered, "left", progress)).toBe(false);
        expect(stageCompleted(ordered, "both", progress)).toBe(false);
      }
      if (index === 8) expect(stageCompleted(ordered, "left", progress)).toBe(true);
      expect(lessonCompleted(ordered, progress)).toBe(index === 13);
    }
    expect(firstIncompleteSelection(ordered, progress)).toEqual(tasks[0]);
    expect(
      phraseCompleted(ordered, "right", warmup, {
        [progressKey(ordered, "right", warmup)]: true
      })
    ).toBe(false);
    const forbidden = { lessonId: ordered.id, phraseId: warmup.id, stage: "right" as const };
    expect(resolveSelection([ordered], forbidden)).toBeNull();
    expect(nextSelection(ordered, forbidden)).toBeNull();
    expect(runContext(ordered, forbidden)).toBeNull();
    expect(
      canCreditCourseRun(
        ordered,
        forbidden,
        result({
          context: progressKey(ordered, "right", warmup)
        }),
        "course-song"
      )
    ).toBe(false);
  });

  it("uses task-relative phrase order independently of score list order and keeps valid credit", () => {
    const ordered: CourseLesson = {
      ...lesson,
      stages: ["right"],
      tasks: [
        { stage: "right", phraseId: second.id },
        { stage: "right", phraseId: first.id }
      ]
    };
    expect(stagePhrases(ordered, "right")).toEqual([second, first]);
    expect(stagePhrases(ordered, "left")).toEqual([]);
    const progress: CourseProgress = { [progressKey(lesson, "right", first)]: true };
    expect(phraseCompleted(ordered, "right", { ...first, title: "Renamed phrase" }, progress)).toBe(
      true
    );
    expect(firstIncompleteSelection(ordered, progress)).toEqual({
      ...selection,
      phraseId: second.id
    });
  });

  it("orders every phrase before advancing a hand stage without locking later stages", () => {
    const progress: CourseProgress = {};
    expect(firstIncompleteSelection(lesson, progress)).toEqual(selection);
    progress[progressKey(lesson, "right", first)] = true;
    expect(firstIncompleteSelection(lesson, progress)).toEqual({
      ...selection,
      phraseId: "second"
    });
    progress[progressKey(lesson, "right", second)] = true;
    expect(stageCompleted(lesson, "right", progress)).toBe(true);
    expect(lessonCompleted(lesson, progress)).toBe(false);
    expect(firstIncompleteSelection(lesson, progress)).toEqual({ ...selection, stage: "left" });
    expect(nextSelection(lesson, { ...selection, phraseId: "second" })).toEqual({
      ...selection,
      stage: "left"
    });
    expect(resolveSelection([lesson], { ...selection, stage: "both" })).not.toBeNull();
    expect(nextSelection(lesson, { ...selection, stage: "both", phraseId: "second" })).toBeNull();
  });

  it("supports two-stage lessons and starts a completed lesson again for repetition", () => {
    const twoStages: CourseLesson = { ...lesson, stages: ["right", "both"] };
    const progress: CourseProgress = Object.fromEntries(
      twoStages.stages.flatMap((stage) =>
        twoStages.phrases.map((phrase) => [progressKey(twoStages, stage, phrase), true])
      )
    );
    expect(lessonCompleted(twoStages, progress)).toBe(true);
    expect(stageCompleted(twoStages, "left", progress)).toBe(false);
    expect(firstIncompleteSelection(twoStages, progress)).toEqual(selection);
    expect(nextSelection(twoStages, { ...selection, phraseId: "second" })).toEqual({
      ...selection,
      stage: "both"
    });
  });

  it("leaves unprepared lessons incomplete and rejects missing selections", () => {
    const soon: CourseLesson = { ...lesson, phrases: [] };
    expect(firstIncompleteSelection(soon, {})).toBeNull();
    expect(lessonCompleted(soon, {})).toBe(false);
    expect(stageCompleted(soon, "right", {})).toBe(false);
    expect(resolveSelection([soon], selection)).toBeNull();
    expect(resolveSelection([lesson], { ...selection, lessonId: "missing" })).toBeNull();
    expect(resolveSelection([lesson], { ...selection, phraseId: "missing" })).toBeNull();
    expect(nextSelection(lesson, { ...selection, lessonId: "missing" })).toBeNull();
  });

  it("keeps credit through renamed titles but invalidates both XML and author version changes", () => {
    const progress: CourseProgress = { [progressKey(lesson, "right", first)]: true };
    expect(phraseCompleted({ ...lesson, title: "Renamed" }, "right", first, progress)).toBe(true);
    const corrected = { ...first, musicXml: "<score>corrected</score>" };
    expect(phraseVersion(corrected)).not.toBe(phraseVersion(first));
    expect(phraseCompleted(lesson, "right", corrected, progress)).toBe(false);
    expect(phraseCompleted(lesson, "right", { ...first, version: "2" }, progress)).toBe(false);
    expect(phraseCompleted(lesson, "left", first, progress)).toBe(false);
  });

  it("uses unambiguous progress keys even when identifiers contain separators", () => {
    const key = progressKey({ ...lesson, id: "a:b" }, "right", { ...first, id: "c:d" });
    expect(JSON.parse(key)).toEqual(["a:b", "right", "c:d", phraseVersion(first)]);
  });
});

describe("course run credit", () => {
  it("credits natural complete human practice in either mode without an accuracy threshold", () => {
    expect(canCreditCourseRun(lesson, selection, result(), "course-song")).toBe(true);
    expect(canCreditCourseRun(lesson, selection, result({ mode: "tempo" }), "course-song")).toBe(
      true
    );
    const both = { ...selection, stage: "both" as const };
    expect(
      canCreditCourseRun(
        lesson,
        both,
        result({ context: runContext(lesson, both) ?? "", hands: ["right", "left"] }),
        "course-song"
      )
    ).toBe(true);
  });

  it.each([
    ["interrupted or sought", { interrupted: true }],
    ["started midway", { from: 1 }],
    ["partial range", { fullRange: false }],
    ["no human hits", { hitCount: 0 }],
    ["listening", { hands: [] }],
    ["different hand", { hands: ["left"] }],
    ["different song", { songKey: "other" }],
    ["no immutable context", { context: undefined }],
    ["different context", { context: "other" }],
    ["invalid ending", { to: NaN }],
    ["empty duration", { to: 0 }]
  ] as const)("rejects %s", (_name, changes) => {
    expect(canCreditCourseRun(lesson, selection, result(changes), "course-song")).toBe(false);
  });

  it("rejects stale results after the selected phrase's content or version changes", () => {
    const corrected = { ...lesson, phrases: [{ ...first, musicXml: "corrected" }] };
    expect(canCreditCourseRun(corrected, selection, result(), "course-song")).toBe(false);
    expect(
      canCreditCourseRun(lesson, { ...selection, phraseId: "second" }, result(), "course-song")
    ).toBe(false);
    expect(canCreditCourseRun(lesson, selection, result(), "")).toBe(false);
  });
});
