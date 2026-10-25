// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMusicExercise } from "../musicLearning/material";
import { generateDictation } from "../musicLearning/dictation";
import { buildTriad } from "../musicLearning/harmony";
import type { KeyEvent } from "../input/midiInput";
import { PracticeSession } from "../practice/session";
import { emptyMusicState } from "./musicPersistence";
import { MusicCourseRun } from "./musicCourseRun";
import type { MusicActivity } from "./musicCourseExercise";
import { createMusicStandaloneResult, createMusicResultView } from "./musicCourseResults";
import { validateMusicResult } from "../musicLearning/progress";
import { makeMusicActivity, musicActivityFromIntegrated } from "./musicCourseExercise";
import { createIntegratedPlan } from "../musicLearning/integratedPlan";
import { createDictationListening } from "../musicLearning/dictationListening";
import type { MusicRunEvidence } from "./musicCourseRun";

const identity = { runId: "run", presentationId: "shown" };
const exercise = createMusicExercise({
  id: "phrase",
  seed: 1,
  bpm: 60,
  notes: [60, 62].map((pitch, index) => ({
    pitch,
    startBeat: index,
    durationBeats: 1,
    hand: "right"
  }))
});
function harness(
  activity: MusicActivity,
  course: "sight-reading" | "harmony" | "dictation" = "sight-reading"
) {
  const saved = { ...emptyMusicState(), course };
  const run = new MusicCourseRun(activity, saved, identity, undefined);
  const session = new PracticeSession(activity.exercise.song, {
    mode: course === "sight-reading" ? "wait" : "tempo",
    hands: new Set(["left", "right"]),
    speed: 1,
    accompaniment: false,
    noteResult: false,
    countInBeats: 0
  });
  session.startClock(1000);
  run.seed([], 1000);
  const input = (
    type: "up" | "down",
    pitch: number,
    at: number,
    admitted = true,
    playing = true
  ) => {
    session.tick(at);
    const event: KeyEvent = { type, pitch, velocity: 80, source: "keyboard", timestamp: at };
    return run.input(event, session, playing, { raw: at, corrected: at, received: at, admitted });
  };
  return { run, session, input, saved };
}
const reading: MusicActivity = {
  exercise,
  taskKind: "sight-reading",
  purpose: "training",
  auditory: false,
  noveltyRequired: false,
  choices: []
};

describe("one-clock music course input wiring", () => {
  it("keeps wrong attacks and advances WAIT only from fresh admitted physical keys", () => {
    const h = harness(reading);
    expect(h.run.start(h.session, 1000, 0)).toBe(true);
    h.input("down", 65, 1100);
    h.input("up", 65, 1150);
    h.input("down", 60, 1200);
    h.input("down", 60, 1210);
    h.input("up", 60, 1300);
    h.input("down", 62, 2200);
    h.input("up", 62, 2300);
    const evidence = h.run.finish();
    expect(evidence?.notes).toHaveLength(3);
    expect(evidence?.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pitch: 65, startBeat: 0 }),
        expect.objectContaining({ pitch: 60, startBeat: 0 }),
        expect.objectContaining({ pitch: 62, startBeat: 1 })
      ])
    );
    const result =
      evidence &&
      createMusicStandaloneResult({
        activity: reading,
        saved: h.saved,
        identity,
        startedAt: 1,
        completedAt: 2,
        newMaterial: true,
        evidence,
        groupAnswers: [],
        previewSeconds: 10,
        visualAlternative: false
      });
    expect(result?.course).toBe("sight-reading");
    expect(result && validateMusicResult(result)).not.toBeNull();
    if (result?.course === "sight-reading")
      expect(result.metrics).toMatchObject({ missingNotes: 0, extraNotes: 1, onsetErrors: null });
  });

  it("does not grade preparation/paused/intercepted chord attacks", () => {
    const chordActivity: MusicActivity = {
      ...reading,
      exercise: createMusicExercise({
        id: "triad",
        seed: 1,
        bpm: 60,
        notes: buildTriad(60, "major").pitches.map((pitch) => ({
          pitch,
          startBeat: 0,
          durationBeats: 4,
          hand: "right"
        }))
      }),
      taskKind: "build-chord",
      chords: [{ startBeat: 0, target: { mode: "exact", pitches: [60, 64, 67] }, carry: [] }]
    };
    const h = harness(chordActivity, "harmony");
    h.input("down", 60, 1010, true, false);
    expect(h.run.start(h.session, 1020, 0)).toBe(false);
    h.input("up", 60, 1030, true, false);
    expect(h.run.start(h.session, 1040, 0)).toBe(true);
    h.run.pause(true, 1050);
    for (const [index, pitch] of [60, 64, 67].entries())
      h.input("down", pitch, 1100 + index * 10, false, false);
    h.run.frame(h.session, false, 1800, 0);
    expect(h.run.snapshot().finished).toBe(false);
    expect(h.run.snapshot().chordIndex).toBe(0);
  });

  it("does not save the fourth note of a provisional chord as a correct triad", () => {
    const chordActivity: MusicActivity = {
      ...reading,
      taskKind: "build-chord",
      exercise: createMusicExercise({
        id: "triad",
        seed: 1,
        bpm: 60,
        notes: [60, 64, 67].map((pitch) => ({
          pitch,
          startBeat: 0,
          durationBeats: 4,
          hand: "right"
        }))
      }),
      chords: [{ startBeat: 0, target: { mode: "exact", pitches: [60, 64, 67] }, carry: [] }]
    };
    const h = harness(chordActivity, "harmony");
    h.run.start(h.session, 1000, 0);
    [60, 64, 67, 65].forEach((pitch, index) => h.input("down", pitch, 1100 + index * 10));
    h.run.frame(h.session, true, 1700, 0);
    expect(h.run.snapshot()).toMatchObject({ finished: false, chordError: "extra-note" });
    [60, 64, 67, 65].forEach((pitch, index) => h.input("up", pitch, 1800 + index * 10));
    expect(h.run.snapshot().canFinish).toBe(true);
    const evidence = h.run.finish();
    expect(evidence?.answers[0]).toMatchObject({ kind: "played", playedPitches: [60, 64, 67, 65] });
  });

  it("gates dictation on full audio and rejects intercepted keys without fabricating notes", () => {
    const dictation = generateDictation({
      seed: 1,
      length: 2,
      bpm: 60,
      startMode: "known",
      studiedPitches: [60],
      studiedDurations: [1]
    });
    const h = harness(
      { ...reading, exercise: dictation, dictation, taskKind: "dictation", auditory: true },
      "dictation"
    );
    expect(h.run.start(h.session, 1000, 0)).toBe(false);
    for (const [kind, atMs] of [
      ["request", 1000],
      ["first-sound", 1010],
      ["complete", 2000]
    ] as const)
      h.run.receiveListening({
        kind,
        atMs,
        playbackId: "heard",
        presentationId: identity.presentationId
      });
    h.session.pauseClock(2000);
    h.session.resumeClock(2000);
    expect(h.run.start(h.session, 2000, 0)).toBe(true);
    h.input("down", 60, 2100, false);
    h.input("up", 60, 2200, false);
    expect(h.run.snapshot().noteCount).toBe(0);
    h.input("down", 60, 2300);
    h.input("up", 60, 2400);
    const evidence = h.run.finish();
    expect(evidence?.dictation?.comparison).toMatchObject({ status: "performed", missingNotes: 1 });
    expect(evidence?.dictation?.notes).toHaveLength(1);
    expect(evidence?.listening.receipts[0]?.outcome).toBe("full");
  });

  it("does not let a foreign preheld MIDI owner block the selected computer keyboard", () => {
    const activity = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "triads"
    });
    const h = harness(activity, "harmony");
    h.run.seed(
      [
        {
          type: "down",
          pitch: 48,
          velocity: 90,
          source: "midi",
          deviceId: "foreign",
          channel: 1,
          timestamp: 900
        }
      ],
      1000
    );
    expect(h.run.start(h.session, 1000, 0)).toBe(true);
    [60, 64, 67].forEach((pitch, index) => h.input("down", pitch, 1100 + index * 10));
    h.run.frame(h.session, true, 1600, 0);
    expect(h.run.snapshot()).toMatchObject({ finished: true, chordIndex: 1 });
  });

  it("requires recognizing the heard interval as well as playing its notes", () => {
    const source = createIntegratedPlan({ seed: 7 }).phases.find(
      (phase) => phase.id === "heard-intervals"
    )?.activities[0];
    if (source?.kind !== "interval") throw new Error("Missing integrated interval");
    const h = harness(musicActivityFromIntegrated(source), "harmony");
    for (const [kind, atMs] of [
      ["request", 1000],
      ["first-sound", 1010],
      ["complete", 2000]
    ] as const)
      h.run.receiveListening({
        kind,
        atMs,
        playbackId: "heard",
        presentationId: identity.presentationId
      });
    h.session.seek(0, 2000, { leadIn: false });
    expect(h.run.start(h.session, 2000, 0)).toBe(true);
    source.exercise.notes.forEach((note, index) => {
      h.input("down", note.pitch, 2100 + index * 1000);
      h.input("up", note.pitch, 2200 + index * 1000);
    });
    expect(h.run.snapshot()).toMatchObject({ noteCount: 2, choiceMade: false, canFinish: false });
    expect(h.run.finish()).toBeNull();
    h.run.choose(String(source.intervalNumber));
    expect(h.run.snapshot().canFinish).toBe(true);
    expect(h.run.finish()?.notes).toHaveLength(2);
  });

  it("closes missed accompaniment steps on the melody clock before late answers arrive", () => {
    const saved = {
      ...emptyMusicState(),
      course: "harmony" as const,
      harmonyLesson: "accompaniment" as const
    };
    const activity = makeMusicActivity(saved);
    const h = harness(activity, "harmony");
    h.run.start(h.session, 1000, 0);
    for (let at = 1000; at <= 30000; at += 100) {
      h.session.tick(at);
      h.run.frame(h.session, true, at, 0);
    }
    expect(h.session.finished).toBe(true);
    expect(h.run.snapshot()).toMatchObject({ finished: true, chordIndex: 4 });
    let at = 31000;
    for (const step of activity.chords ?? []) {
      for (const pitch of step.target.pitches) h.input("down", pitch, at++);
      at += 500;
      h.run.frame(h.session, true, at, 0);
      for (const pitch of step.target.pitches) h.input("up", pitch, ++at);
    }
    const evidence = h.run.finish();
    expect(evidence?.answers).toHaveLength(4);
    expect(
      evidence?.answers.every(
        (answer) => answer.kind === "played" && answer.playedPitches.length === 0
      )
    ).toBe(true);
    expect(
      evidence &&
        createMusicStandaloneResult({
          activity,
          saved,
          identity,
          startedAt: 1,
          completedAt: 2,
          newMaterial: false,
          evidence,
          groupAnswers: [],
          previewSeconds: 10,
          visualAlternative: false
        })
    ).toBeNull();
  });

  it("does not reuse the first chord for future bars or hide three missing accompaniment chords", () => {
    const saved = {
      ...emptyMusicState(),
      course: "harmony" as const,
      harmonyLesson: "accompaniment" as const
    };
    const activity = makeMusicActivity(saved);
    const h = harness(activity, "harmony");
    h.run.start(h.session, 1000, 0);
    const first = activity.chords?.[0];
    if (!first) throw new Error("Missing accompaniment chord");
    first.target.pitches.forEach((pitch, index) => h.input("down", pitch, 1100 + index * 10));
    h.session.tick(1600);
    h.run.frame(h.session, true, 1600, 0);
    first.target.pitches.forEach((pitch, index) => h.input("up", pitch, 1610 + index * 10));
    h.run.frame(h.session, true, 1650, 0);
    expect(h.run.snapshot()).toMatchObject({ finished: false, chordIndex: 1 });
    const evidence = h.run.finish();
    if (!evidence) throw new Error("Missing partial accompaniment evidence");
    const result = createMusicStandaloneResult({
      activity,
      saved,
      identity,
      startedAt: 1,
      completedAt: 2,
      newMaterial: false,
      evidence,
      groupAnswers: [],
      previewSeconds: 10,
      visualAlternative: false
    });
    expect(result?.course).toBe("harmony");
    if (result?.course === "harmony")
      expect(result.metrics).toMatchObject({ totalAnswers: 4, correctAnswers: 1, pitchErrors: 3 });
    expect(result && validateMusicResult(result)).not.toBeNull();
  });

  it("separates a correct chord class from a less smooth voicing", () => {
    const saved = {
      ...emptyMusicState(),
      course: "harmony" as const,
      harmonyLesson: "voice-leading" as const
    };
    const activity = makeMusicActivity(saved);
    const first = activity.chords?.[0],
      second = activity.chords?.[1];
    if (!first || !second) throw new Error("Missing voice-leading transition");
    const evidence: MusicRunEvidence = {
      notes: [],
      help: [],
      dictation: null,
      listening: createDictationListening(identity.runId, identity.presentationId, "training"),
      answers: [
        {
          kind: "played",
          target: first.target,
          playedPitches: [60, 64, 67],
          spreadMs: 80,
          attempts: [],
          startBeat: 0,
          hand: "right"
        },
        {
          kind: "played",
          target: second.target,
          playedPitches: [65, 69, 72],
          spreadMs: 80,
          attempts: [],
          startBeat: 4,
          hand: "right"
        }
      ]
    };
    const context = {
      activity,
      saved,
      identity,
      startedAt: 1,
      completedAt: 2,
      newMaterial: false,
      evidence,
      groupAnswers: [],
      previewSeconds: 10,
      visualAlternative: false
    };
    const result = createMusicStandaloneResult(context);
    if (result?.course !== "harmony") throw new Error("Missing harmony result");
    expect(result.metrics).toMatchObject({ correctAnswers: 2, pitchErrors: 0 });
    expect(validateMusicResult(result)).not.toBeNull();
    expect(createMusicResultView(result, context).metrics).toEqual(
      expect.arrayContaining([
        { labelKey: "Движение голосов, полутоны", value: 15 },
        { labelKey: "Минимальное движение, полутоны", value: 3 }
      ])
    );
  });
});
