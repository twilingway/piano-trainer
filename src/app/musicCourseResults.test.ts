// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createDictationListening } from "../musicLearning/dictationListening";
import { emptyMusicState } from "./musicPersistence";
import { makeMusicActivity } from "./musicCourseExercise";
import { createMusicResultView, createMusicStandaloneResult } from "./musicCourseResults";
import { validateMusicResult } from "../musicLearning/progress";
import { MusicInputJournal, validateMusicEvidence } from "../musicLearning/evidence";
import { musicResultFixture } from "../musicLearning/progressFixture";

describe("harmony transition feedback", () => {
  it("roundtrips optional tone recipes and rejects recipes inconsistent with actual notes or answers", () => {
    const saved = { ...emptyMusicState(), course: "harmony" as const };
    const activity = makeMusicActivity(saved);
    if (!activity.expectedChoice) throw new Error("Missing tone answer");
    const identity = { runId: "tone-run", presentationId: "tone-presentation" };
    const journal = new MusicInputJournal(identity);
    journal.present(100, "staff");
    journal.record({
      kind: "choice",
      value: activity.expectedChoice,
      source: "pointer",
      rawAtMs: 200,
      correctedAtMs: 200,
      receivedAtMs: 200,
      songBeat: null,
      eligible: true
    });
    const evidence = {
      notes: [],
      help: [],
      dictation: null,
      inputJournal: journal.snapshot(),
      listening: createDictationListening(identity.runId, identity.presentationId, "training"),
      answers: [
        {
          kind: "named" as const,
          expected: activity.expectedChoice,
          answer: activity.expectedChoice
        }
      ]
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
      visualAlternative: false,
      inputSource: "pointer"
    });
    if (result?.course !== "harmony" || !result.toneRecipe) throw new Error("Missing tone result");
    expect(validateMusicResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    for (const patch of [
      { version: 2 },
      { root: 59 },
      { pitchSet: "future" },
      { notationFifths: -3 }
    ])
      expect(
        validateMusicResult({ ...result, toneRecipe: { ...result.toneRecipe, ...patch } })
      ).toBeNull();
    expect(validateMusicResult({ ...result, lesson: "triads" })).toBeNull();
    expect(
      validateMusicResult({ ...result, answers: [{ kind: "named", expected: "3", answer: "3" }] })
    ).toBeNull();
    const material = {
      id: activity.exercise.id,
      seed: activity.exercise.seed,
      generatorVersion: 1 as const,
      bpm: activity.exercise.bpm,
      fingerprint: activity.exercise.fingerprint,
      notes: activity.exercise.notes,
      toneRecipe: activity.toneRecipe
    };
    const body = { ...evidence, material, schemaVersion: 1, startedAt: 1, completedAt: 2 };
    expect(validateMusicEvidence(body)).toBe(true);
    const namedBody = (expected: string, answer: string) => {
      const replyJournal = new MusicInputJournal(identity);
      replyJournal.present(100, "staff");
      replyJournal.record({
        kind: "choice",
        value: answer,
        source: "pointer",
        rawAtMs: 200,
        correctedAtMs: 200,
        receivedAtMs: 200,
        songBeat: null,
        eligible: true
      });
      return {
        ...body,
        inputJournal: replyJournal.snapshot(),
        answers: [{ kind: "named", expected, answer }]
      };
    };
    expect(
      validateMusicEvidence(
        namedBody(activity.expectedChoice, activity.expectedChoice === "1" ? "2" : "1")
      )
    ).toBe(true);
    expect(validateMusicEvidence(namedBody("3", "3"))).toBe(false);
    expect(
      validateMusicEvidence({
        ...body,
        material: { ...material, toneRecipe: { ...activity.toneRecipe, root: 59 } }
      })
    ).toBe(false);
    const legacy = musicResultFixture("harmony");
    expect(validateMusicResult(legacy)).toEqual(legacy);
    expect(validateMusicResult(legacy)).not.toHaveProperty("toneRecipe");
  });
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
