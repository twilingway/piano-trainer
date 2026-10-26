// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createDictationListening } from "../musicLearning/dictationListening";
import { emptyMusicState } from "./musicPersistence";
import { makeMusicActivity } from "./musicCourseExercise";
import { createMusicResultView, createMusicStandaloneResult } from "./musicCourseResults";

describe("harmony transition feedback", () => {
  it("keeps correct chord content separate from an out-of-range transition", () => {
    const saved = {
      ...emptyMusicState(),
      course: "harmony" as const,
      harmonyLesson: "voice-leading" as const
    };
    const activity = makeMusicActivity(saved);
    const identity = { runId: "transition-run", presentationId: "transition-presentation" };
    const evidence = {
      notes: [],
      help: [],
      dictation: null,
      listening: createDictationListening(identity.runId, identity.presentationId, "training"),
      answers: (activity.chords ?? []).map((chord, index) => ({
        kind: "played" as const,
        target: chord.target,
        playedPitches: index === 0 ? [60, 64, 67] : [77, 81, 84],
        spreadMs: 80,
        attempts: [],
        startBeat: index * 4,
        hand: "right" as const
      }))
    };
    const result = createMusicStandaloneResult({
      saved,
      activity,
      identity,
      evidence,
      startedAt: 1,
      completedAt: 2,
      newMaterial: false,
      groupAnswers: [],
      previewSeconds: 10,
      visualAlternative: false
    });
    if (result?.course !== "harmony") throw new Error("Missing harmony result");
    expect(result.metrics.correctAnswers).toBe(2);
    expect(createMusicResultView(result).metrics).toEqual(
      expect.arrayContaining([
        {
          labelKey: "Расположение в диапазоне руки",
          value: null,
          valueKey: "Расположение вне допустимого диапазона"
        },
        { labelKey: "Оптимальность перехода", value: null, valueKey: "Переход не оптимален" },
        { labelKey: "Движение голосов, полутоны", value: null },
        { labelKey: "Минимальное движение, полутоны", value: 3 }
      ])
    );
  });
});
