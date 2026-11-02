// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import { createMusicExercise } from "../musicLearning/material";
import { createIntegratedPlan } from "../musicLearning/integratedPlan";
import {
  validateMusicInputJournal,
  musicNotesHaveJournal,
  musicAnswersHaveJournal
} from "../musicLearning/evidenceValidation";
import { PracticeSession } from "../practice/session";
import { MusicCourseRun } from "./musicCourseRun";
import { emptyMusicState } from "./musicPersistence";
import { makeMusicActivity, musicActivityFromIntegrated } from "./musicCourseExercise";
import type { MusicActivity } from "./musicCourseExercise";

const identity = { runId: "native-run", presentationId: "native-presentation" };
const native = { source: "midi" as const, deviceId: "piano", channel: 3 };
const exercise = createMusicExercise({
  id: "native-source",
  seed: 1,
  bpm: 60,
  notes: [60, 62].map((pitch, index) => ({
    pitch,
    startBeat: index,
    durationBeats: 1,
    hand: "right"
  }))
});
const reading: MusicActivity = {
  exercise,
  taskKind: "sight-reading",
  purpose: "training",
  auditory: false,
  noveltyRequired: false,
  choices: []
};
function harness(activity = reading, offset = 25) {
  const saved = {
    ...emptyMusicState(),
    course: "sight-reading" as const,
    inputSource: "midi" as const
  };
  const run = new MusicCourseRun(activity, saved, identity, "piano");
  const session = new PracticeSession(activity.exercise.song, {
    mode: activity.chords || activity.auditory ? "tempo" : "wait",
    hands: new Set(["left", "right"]),
    speed: 1,
    accompaniment: false,
    countInBeats: 0,
    noteResult: false
  });
  session.startClock(1000);
  run.seed([], 1000, offset);
  const event = (
    type: "down" | "up",
    pitch: number,
    raw: number,
    changes: Partial<KeyEvent> = {},
    admitted = true,
    playing = true,
    received = raw + 10
  ) => {
    if (playing) session.tick(received);
    return run.input(
      { type, pitch, velocity: 80, timestamp: raw, ...native, ...changes },
      session,
      playing,
      { raw, corrected: raw - offset, received, admitted }
    );
  };
  return { run, session, saved, event, offset };
}
describe("MusicCourseRun native input evidence", () => {
  it("retains actual MIDI source/device/channel, stable IDs, corrected receipts and note down/up", () => {
    const h = harness();
    h.run.presented(1000, "staff");
    h.run.start(h.session, 1000, h.offset);
    h.event("down", 60, 1100);
    h.event("down", 60, 1110);
    h.event("up", 60, 1200);
    h.event("down", 62, 2100);
    h.event("up", 62, 2200);
    const evidence = h.run.finish();
    const journal = evidence?.inputJournal;
    if (!evidence || !journal) throw new Error("Missing native input journal");
    expect(journal).toMatchObject({
      schemaVersion: 1,
      ...identity,
      presentedAtMs: 1000,
      presentationKind: "staff",
      valid: true,
      droppedEvents: 0
    });
    expect(journal.events.map((event) => event.id)).toEqual(
      [1, 2, 3, 4, 5].map((index) => `native-run:input:${String(index)}`)
    );
    expect(journal.events[0]).toMatchObject({
      ...native,
      kind: "down",
      pitch: 60,
      rawAtMs: 1100,
      correctedAtMs: 1075,
      receivedAtMs: 1110,
      eligible: true,
      hand: "right"
    });
    expect(journal.events[1]?.eligible).toBe(false);
    expect(journal.events[2]?.eligible).toBe(true);
    expect(validateMusicInputJournal(journal, { ...identity, inputSource: "midi" })).toBe(true);
    expect(musicNotesHaveJournal(evidence.notes, journal)).toBe(true);
  });
  it("keeps real seed timestamps without turning preheld/duplicate keys into accepted notes", () => {
    const h = harness();
    h.run.seed(
      [{ ...native, type: "down", pitch: 60, velocity: 80, timestamp: 900 }],
      1000,
      h.offset
    );
    h.run.presented(1000, "staff");
    expect(h.run.start(h.session, 1000, h.offset)).toBe(false);
    h.event("down", 60, 1100);
    h.event("up", 60, 1200);
    expect(h.run.start(h.session, 1300, h.offset)).toBe(true);
    h.event("down", 60, 1400);
    h.event("up", 60, 1500);
    const evidence = h.run.finish(),
      journal = evidence?.inputJournal;
    expect(journal?.events[0]).toMatchObject({
      kind: "down",
      rawAtMs: 900,
      correctedAtMs: 875,
      receivedAtMs: 1000,
      eligible: false,
      songBeat: null
    });
    expect(journal?.events.slice(0, 3).every((event) => !event.eligible)).toBe(true);
    expect(evidence?.notes).toHaveLength(1);
  });
  it("records paused attacks as ineligible and supports a real own release on the frozen session clock", () => {
    const h = harness();
    h.run.start(h.session, 1000, h.offset);
    h.event("down", 60, 1100);
    h.session.pauseClock(1300);
    h.run.pause(true, 1275);
    h.event("down", 62, 1400, {}, true, false);
    h.event("up", 62, 1500, {}, true, false);
    h.event("up", 60, 1600, {}, true, false);
    const evidence = h.run.finish(),
      journal = evidence?.inputJournal;
    if (!evidence || !journal) throw new Error("Missing paused physical evidence");
    expect(journal.events.slice(1, 3).map((event) => event.eligible)).toEqual([false, false]);
    expect(journal.events[3]?.eligible).toBe(true);
    expect(evidence.notes).toHaveLength(1);
    expect(musicNotesHaveJournal(evidence.notes, journal)).toBe(true);
  });
  it("ignores another device's background events without poisoning or overflowing the selected journal", () => {
    const h = harness();
    h.run.start(h.session, 1000, h.offset);
    for (let index = 0; index < 600; index++)
      h.event("down", 61, 1100 + index, { deviceId: "foreign" });
    h.event("down", 60, 1800);
    h.event("up", 60, 1900);
    const evidence = h.run.finish();
    expect(evidence?.inputJournal?.events).toHaveLength(2);
    expect(evidence?.inputJournal?.valid).toBe(true);
  });
  it("keeps malformed native events out of the journal", () => {
    const h = harness();
    h.run.start(h.session, 1000, h.offset);
    h.event("down", 60, 1100, { pitch: NaN });
    h.event("down", 60, 1200, { channel: 0 });
    h.event("down", 60, 1300, { timestamp: NaN });
    h.event("down", 60, 1400, { velocity: Infinity });
    h.event("down", 60, 1500);
    h.event("up", 60, 1600);
    expect(h.run.finish()?.inputJournal?.events).toHaveLength(2);
  });
  it("does not let malformed or future seed entries poison physical gates or native history", () => {
    const h = harness();
    h.run.seed(
      [
        { ...native, type: "down", pitch: 60, velocity: 80, timestamp: 900, channel: 0 },
        { ...native, type: "down", pitch: 61, velocity: 80, timestamp: 1500 },
        { ...native, type: "down", pitch: 62, velocity: 80, timestamp: NaN }
      ],
      1000,
      h.offset
    );
    expect(h.run.start(h.session, 1000, h.offset)).toBe(true);
    h.event("down", 60, 1200);
    h.event("up", 60, 1300);
    expect(h.run.finish()?.inputJournal?.events).toHaveLength(2);
  });
  it("records harmony duplicate downs as ineligible while preserving accepted chord provenance", () => {
    const saved = {
      ...emptyMusicState(),
      course: "harmony" as const,
      harmonyLesson: "triads" as const
    };
    const h = harness(makeMusicActivity(saved), 0);
    h.run.start(h.session, 1000, 0);
    h.event("down", 60, 1100);
    h.event("down", 60, 1110);
    h.event("down", 64, 1120);
    h.event("down", 67, 1130);
    h.run.frame(h.session, true, 1560, 0);
    h.event("up", 60, 1570);
    h.event("up", 64, 1580);
    h.event("up", 67, 1590);
    const evidence = h.run.finish();
    if (!evidence?.inputJournal) throw new Error("Missing chord proof");
    expect(evidence.inputJournal.events[1]?.eligible).toBe(false);
    expect(evidence.inputJournal.events.slice(0, 4).filter((event) => event.eligible)).toHaveLength(
      3
    );
    expect(musicAnswersHaveJournal(evidence.answers, evidence.inputJournal)).toBe(true);
  });
  it("retains pointer recognition alongside actual MIDI interval notes without changing physical source", () => {
    const source = createIntegratedPlan({ seed: 1 })
      .phases.flatMap((phase) => phase.activities)
      .find((activity) => activity.kind === "interval");
    if (!source) throw new Error("Missing interval source");
    const h = harness(musicActivityFromIntegrated(source));
    for (const [kind, atMs] of [
      ["request", 1000],
      ["first-sound", 1010],
      ["complete", 1100]
    ] as const)
      h.run.receiveListening({
        kind,
        atMs,
        playbackId: "ref",
        presentationId: identity.presentationId
      });
    h.run.presented(1010, "audio");
    h.session.seek(0, 1200, { leadIn: false });
    h.session.resumeClock(1200);
    expect(h.run.start(h.session, 1200, h.offset)).toBe(true);
    expect(h.run.choose(String(source.intervalNumber), "pointer", 1250)).toBe(true);
    for (const [index, note] of source.exercise.notes.entries()) {
      h.event("down", note.pitch, 1300 + index * 1000);
      h.event("up", note.pitch, 1400 + index * 1000);
    }
    const evidence = h.run.finish(),
      journal = evidence?.inputJournal;
    if (!evidence || !journal) throw new Error("Missing mixed interval proof");
    expect(journal).toMatchObject({ presentationKind: "audio", presentedAtMs: 1010 });
    expect(journal.events[0]).toMatchObject({
      kind: "choice",
      source: "pointer",
      value: String(source.intervalNumber),
      rawAtMs: 1250,
      eligible: true
    });
    expect(
      journal.events
        .slice(1)
        .every(
          (event) => event.source === "midi" && event.deviceId === "piano" && event.channel === 3
        )
    ).toBe(true);
    expect(validateMusicInputJournal(journal, { ...identity, inputSource: "midi" })).toBe(true);
    expect(musicNotesHaveJournal(evidence.notes, journal)).toBe(true);
    expect(musicAnswersHaveJournal(evidence.answers, journal)).toBe(true);
  });
  it("uses the last externally supplied frame for legacy choices and keeps the first real presentation marker", () => {
    const activity: MusicActivity = { ...reading, taskKind: "name-chord", expectedChoice: "major" };
    const h = harness(activity);
    h.run.presented(1000, "staff");
    h.run.start(h.session, 1000, h.offset);
    h.run.presented(1100, "audio");
    h.run.frame(h.session, true, 1450, h.offset);
    expect(h.run.choose("major")).toBe(true);
    expect(h.run.finish()?.inputJournal).toMatchObject({
      presentationKind: "staff",
      presentedAtMs: 1000,
      events: [
        {
          kind: "choice",
          source: "keyboard",
          rawAtMs: 1450,
          correctedAtMs: 1450,
          receivedAtMs: 1450,
          eligible: true
        }
      ]
    });
  });
  it("records P5 preparation choices separately from chord/theory answers", () => {
    const h = harness();
    h.run.presented(1000, "staff");
    h.run.setReady(true, 1000);
    expect(h.run.recordChoice("position:60", "pointer", 1100)).toBe(true);
    expect(h.run.recordChoice("scalar", "keyboard", 1200)).toBe(true);
    h.run.start(h.session, 1300, h.offset);
    h.event("down", 60, 1400);
    h.event("up", 60, 1500);
    const evidence = h.run.finish();
    expect(evidence?.answers).toEqual([]);
    expect(
      evidence?.inputJournal?.events
        .slice(0, 2)
        .map((event) => (event.kind === "choice" ? event.value : null))
    ).toEqual(["position:60", "scalar"]);
  });
  it("invalidates and cancels grading on a 513th selected event without emitting completed evidence", () => {
    const h = harness();
    h.run.start(h.session, 1000, h.offset);
    for (let index = 0; index < 513; index++) h.event("down", 60, 1100 + index);
    expect(h.run.snapshot()).toMatchObject({ valid: false, canFinish: false });
    expect(h.run.finish()).toBeNull();
  });
});
