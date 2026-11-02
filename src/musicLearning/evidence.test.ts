import { validateIntegratedEvidence } from "./evidenceIntegrated";
import { PracticeSession } from "../practice/session";
import { MusicCourseRun } from "../app/musicCourseRun";
import { makeMusicActivity } from "../app/musicCourseExercise";
import { createMusicStandaloneResult } from "../app/musicCourseResults";
import { emptyMusicState } from "../app/musicPersistence";
import { DictationSession } from "./dictationSession";
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  MusicInputJournal,
  cloneMusicEvidence,
  validateMusicEvidence,
  validateMusicInputJournal,
  MUSIC_INPUT_EVIDENCE_LIMIT
} from "./evidence";
import type { EmbeddedMusicEvidence, MusicInputEvidenceEntry } from "./evidence";
import { createIntegratedPlan, IntegratedLesson } from "./integrated";
import type { IntegratedSnapshot, IntegratedChildResult, IntegratedEvidence } from "./integrated";
import { createDictationListening } from "./dictationListening";
import { compareDictation, generateDictation } from "./dictation";
import { musicResultFixture } from "./progressFixture";
import { validateMusicResult, mergeMusicHistory } from "./progress";
import type { MutableMusic } from "./progress";
import { validateIntegratedProgress } from "./progressIntegrated";

const entry = (patch: Partial<MusicInputEvidenceEntry> = {}): MusicInputEvidenceEntry =>
  ({
    kind: "down",
    pitch: 60,
    source: "keyboard",
    rawAtMs: 100,
    correctedAtMs: 90,
    receivedAtMs: 110,
    songBeat: 0,
    eligible: true,
    ...patch
  }) as MusicInputEvidenceEntry;
function body(snapshot: IntegratedSnapshot): EmbeddedMusicEvidence {
  const { exercise } = snapshot.activity;
  const journal = new MusicInputJournal(snapshot.identity);
  journal.present(
    snapshot.activity.auditory ? 1 : 10,
    snapshot.activity.auditory ? "audio" : "staff"
  );
  const answers: EmbeddedMusicEvidence["answers"] =
    snapshot.activity.kind === "harmony"
      ? exercise.notes
          .filter(
            (note, index, notes) => index === 0 || note.startBeat !== notes[index - 1]?.startBeat
          )
          .map((first) => {
            const pitches = exercise.notes
              .filter((note) => note.startBeat === first.startBeat && note.hand === first.hand)
              .map((note) => note.pitch);
            return {
              kind: "played",
              target: { mode: "exact", pitches },
              playedPitches: pitches,
              spreadMs: 0,
              startBeat: first.startBeat,
              hand: first.hand,
              attempts: []
            };
          })
      : snapshot.activity.kind === "interval"
        ? [
            {
              kind: "named",
              expected: String(snapshot.activity.intervalNumber),
              answer: String(snapshot.activity.intervalNumber)
            }
          ]
        : [];
  for (const answer of answers)
    if (answer.kind === "named")
      journal.record({
        kind: "choice",
        value: answer.answer,
        source: "pointer",
        rawAtMs: 50,
        correctedAtMs: 50,
        receivedAtMs: 50,
        songBeat: null,
        eligible: true
      });
  const events = exercise.notes
    .flatMap((note) => [
      {
        kind: "down" as const,
        pitch: note.pitch,
        hand: note.hand,
        rawAtMs: 100 + note.startBeat * 100,
        correctedAtMs: 100 + note.startBeat * 100,
        receivedAtMs: 101 + note.startBeat * 100,
        songBeat: note.startBeat
      },
      {
        kind: "up" as const,
        pitch: note.pitch,
        hand: note.hand,
        rawAtMs: 100 + (note.startBeat + note.durationBeats) * 100,
        correctedAtMs: 100 + (note.startBeat + note.durationBeats) * 100,
        receivedAtMs: 101 + (note.startBeat + note.durationBeats) * 100,
        songBeat: note.startBeat + note.durationBeats
      }
    ])
    .sort((a, b) => a.receivedAtMs - b.receivedAtMs);
  for (const event of events)
    expect(journal.record({ ...event, source: "keyboard", eligible: true })).toBe(true);
  const listening = {
    ...createDictationListening(
      snapshot.identity.runId,
      snapshot.identity.presentationId,
      snapshot.purpose
    ),
    receipts: snapshot.activity.auditory
      ? [
          {
            playbackId: `${snapshot.identity.runId}:audio`,
            requestedAtMs: 0,
            startedAtMs: 1,
            endedAtMs: 10,
            outcome: "full" as const
          }
        ]
      : []
  };
  const notes = snapshot.activity.kind === "harmony" ? [] : exercise.notes;
  const dictation =
    snapshot.activity.kind === "rhythm"
      ? {
          attemptId: snapshot.identity.runId,
          presentationId: snapshot.identity.presentationId,
          exerciseId: exercise.id,
          purpose: snapshot.purpose,
          notes: exercise.notes.map((note) => ({
            pitch: note.pitch,
            startBeat: note.startBeat,
            durationBeats: note.durationBeats,
            origin: { source: "keyboard" as const },
            downAtMs: 100 + note.startBeat * 100,
            upAtMs: 100 + (note.startBeat + note.durationBeats) * 100
          })),
          listening,
          help: [],
          comparison: compareDictation(snapshot.activity.exercise, exercise.notes)
        }
      : null;
  return {
    schemaVersion: 1,
    startedAt: 1000,
    completedAt: 2000,
    material: {
      id: exercise.id,
      seed: exercise.seed,
      generatorVersion: 1,
      bpm: exercise.bpm,
      fingerprint: exercise.fingerprint,
      notes: exercise.notes
    },
    inputJournal: journal.snapshot(),
    notes,
    answers,
    dictation,
    listening,
    help: []
  };
}
const errors: Record<IntegratedEvidence["skill"], IntegratedEvidence> = {
  keyboard: { skill: "keyboard", errors: { wrongKeys: 0 } },
  reading: { skill: "reading", errors: { pitches: 0, timing: 0, groups: 0 } },
  rhythm: { skill: "rhythm", errors: { onsets: 0, durations: 0, missing: 0, extra: 0 } },
  interval: { skill: "interval", errors: { recognition: 0, pitches: 0 } },
  harmony: { skill: "harmony", errors: { pitches: 0, bass: 0, synchrony: 0 } },
  coordination: { skill: "coordination", errors: { left: 0, right: 0, timing: 0 } }
};
function complete(lesson: IntegratedLesson): EmbeddedMusicEvidence {
  const snapshot = lesson.snapshot();
  lesson.setReady(snapshot.identity, {
    reservedFingerprint: snapshot.activity.exercise.fingerprint
  });
  lesson.start(snapshot.identity);
  const evidence = body(snapshot);
  expect(validateMusicEvidence(evidence)).toBe(true);
  const result: IntegratedChildResult = {
    ...snapshot.identity,
    ...errors[snapshot.activity.skill],
    resultId: snapshot.identity.runId,
    purpose: snapshot.purpose,
    source: "keyboard",
    status: "completed",
    performedUnits: snapshot.activity.expectedUnits,
    help: [],
    visualAlternative: false,
    auditoryVerified: snapshot.activity.auditory,
    evidence
  };
  expect(lesson.complete(result)).toBe(true);
  return evidence;
}

describe("native input journal facts", () => {
  it("keeps event identities, actual times and rejected duplicates without content deduplication", () => {
    const journal = new MusicInputJournal({ runId: "run", presentationId: "shown" });
    journal.present(10, "staff");
    expect(journal.record(entry())).toBe(true);
    expect(journal.record(entry({ eligible: false }))).toBe(true);
    const saved = journal.snapshot();
    expect(saved.events.map((event) => event.id)).toEqual(["run:input:1", "run:input:2"]);
    expect(saved.events[0]).toMatchObject({
      rawAtMs: 100,
      correctedAtMs: 90,
      receivedAtMs: 110,
      runId: "run",
      presentationId: "shown"
    });
    expect(validateMusicInputJournal(saved)).toBe(true);
    expect(
      validateMusicInputJournal({ ...saved, events: [saved.events[0], saved.events[0]] })
    ).toBe(false);
    expect(
      validateMusicInputJournal({
        ...saved,
        events: saved.events.map((event) => ({ ...event, presentationId: "foreign" }))
      })
    ).toBe(false);
  });
  it("accepts reordered raw timestamps and late ineligible physical receipts, with real MIDI origin", () => {
    const journal = new MusicInputJournal({ runId: "run", presentationId: "shown" });
    journal.present(10, "audio");
    expect(
      journal.record(
        entry({
          rawAtMs: 200,
          correctedAtMs: 180,
          receivedAtMs: 210,
          source: "midi",
          deviceId: "piano",
          channel: 2
        })
      )
    ).toBe(true);
    expect(
      journal.record(
        entry({
          kind: "up",
          rawAtMs: 150,
          correctedAtMs: 130,
          receivedAtMs: 220,
          eligible: false,
          source: "midi",
          deviceId: "piano",
          channel: 2
        })
      )
    ).toBe(true);
    expect(journal.record(entry({ receivedAtMs: 500, eligible: false }))).toBe(true);
    expect(validateMusicInputJournal(journal.snapshot(), { inputSource: "midi" })).toBe(true);
    const late = new MusicInputJournal({ runId: "late", presentationId: "late" });
    late.present(10, "ready");
    expect(late.record(entry({ receivedAtMs: 351 }))).toBe(false);
    expect(late.valid).toBe(false);
    const missing = new MusicInputJournal({ runId: "bad", presentationId: "bad" });
    expect(missing.record(entry({ source: "midi" }))).toBe(false);
  });
  it("bounds memory at512 and invalidates an incomplete journal rather than silently dropping history", () => {
    const journal = new MusicInputJournal({ runId: "run", presentationId: "shown" });
    journal.present(10, "ready");
    for (let index = 0; index < MUSIC_INPUT_EVIDENCE_LIMIT; index++)
      expect(journal.record(entry({ eligible: false, receivedAtMs: 200 + index }))).toBe(true);
    expect(journal.record(entry({ eligible: false, receivedAtMs: 1000 }))).toBe(false);
    expect(journal.snapshot()).toMatchObject({ valid: false, droppedEvents: 1 });
    expect(journal.snapshot().events).toHaveLength(512);
    expect(validateMusicInputJournal(journal.snapshot())).toBe(false);
  });
  it("requires actual presentation for native evidence, rejects nonfinite timelines and preserves detached snapshots", () => {
    const journal = new MusicInputJournal({ runId: "run", presentationId: "shown" });
    expect(validateMusicInputJournal(journal.snapshot())).toBe(false);
    journal.present(10, "staff");
    journal.record(entry());
    const mutable = journal.snapshot() as MutableMusic<ReturnType<MusicInputJournal["snapshot"]>>;
    const first = mutable.events[0];
    if (!first || first.kind === "choice") throw new Error("Missing physical input fixture");
    first.pitch = 99;
    expect(journal.snapshot().events[0]).toMatchObject({ pitch: 60 });
    expect(
      validateMusicInputJournal({
        ...journal.snapshot(),
        events: [{ ...journal.snapshot().events[0], rawAtMs: NaN }]
      })
    ).toBe(false);
    expect(
      validateMusicInputJournal({
        ...journal.snapshot(),
        events: [{ ...journal.snapshot().events[0], rawAtMs: 111, receivedAtMs: 110 }]
      })
    ).toBe(false);
  });
});

describe("embedded P8 bodies and native result boundary", () => {
  it("keeps material, original event/body IDs and calendar bounds across save/reload and external mutation", () => {
    const plan = createIntegratedPlan({ seed: 42 });
    const lesson = new IntegratedLesson({ plan, lessonId: "embedded" });
    const original = complete(lesson) as MutableMusic<EmbeddedMusicEvidence>;
    const before = lesson.save();
    expect(before.results[0]?.evidence).toEqual(original);
    const first = original.notes[0];
    if (!first) throw new Error("Missing note fixture");
    first.pitch = 99;
    expect(lesson.save().results[0]?.evidence?.notes[0]?.pitch).toBe(60);
    const restored = new IntegratedLesson({ plan, lessonId: "embedded", saved: before });
    expect(restored.save().results[0]?.evidence).toEqual(before.results[0]?.evidence);
    expect(restored.snapshot().identity.generation).toBe(2);
    expect(
      validateIntegratedProgress({
        plan: { seed: 42, version: 1, theme: "c-major", bpm: plan.bpm },
        state: before
      })
    ).toBe(true);
    const savedBody = before.results[0]?.evidence;
    if (!savedBody) throw new Error("Missing saved body fixture");
    expect(cloneMusicEvidence(savedBody)).not.toBe(savedBody);
  });
  it("requires every actual child body for a native aggregate without a second parent input journal", () => {
    const plan = createIntegratedPlan({ seed: 42 });
    const lesson = new IntegratedLesson({ plan, lessonId: "full-native" });
    for (let index = 0; index < 16; index++) {
      complete(lesson);
      if (index < 15) lesson.next(lesson.snapshot().identity);
    }
    const sample = musicResultFixture("integrated", "full-native");
    if (sample.course !== "integrated") throw new Error("Wrong fixture course");
    const result = {
      ...sample,
      id: sample.runId,
      provenance: "native" as const,
      state: lesson.save()
    };
    expect(validateMusicResult(result)).not.toBeNull();
    const missing = {
      ...result,
      state: {
        ...result.state,
        results: result.state.results.map((child, index) => {
          if (index !== 0) return child;
          const { evidence: _body, ...rest } = child;
          return rest;
        })
      }
    };
    expect(validateMusicResult(missing)).toBeNull();
    expect(
      validateMusicResult({
        ...result,
        inputJournal: result.state.results[0]?.evidence?.inputJournal
      })
    ).toBeNull();
    const changed = {
      ...result,
      state: {
        ...result.state,
        results: result.state.results.map((child, index) =>
          index === 0 && child.evidence
            ? {
                ...child,
                evidence: {
                  ...child.evidence,
                  material: { ...child.evidence.material, fingerprint: "foreign" }
                }
              }
            : child
        )
      }
    };
    expect(validateMusicResult(changed)).toBeNull();
    expect(mergeMusicHistory([], [musicResultFixture("sight-reading"), changed])).toHaveLength(1);
  });
  it("rejects forged native summaries but keeps honest legacy data without manufacturing input evidence", () => {
    const legacy = musicResultFixture("sight-reading");
    expect(validateMusicResult(legacy)).not.toBeNull();
    expect(validateMusicResult({ ...legacy, id: legacy.runId, provenance: "native" })).toBeNull();
    const lesson = new IntegratedLesson({
      plan: createIntegratedPlan({ seed: 42 }),
      lessonId: "body"
    });
    const evidence = body(lesson.snapshot());
    expect(validateMusicEvidence({ ...evidence, completedAt: 999 })).toBe(false);
    expect(
      validateMusicEvidence({
        ...evidence,
        notes: evidence.notes.map((note) => ({ ...note, pitch: 61 }))
      })
    ).toBe(false);
    expect(
      validateMusicEvidence({
        ...evidence,
        inputJournal: { ...evidence.inputJournal, runId: "foreign" }
      })
    ).toBe(false);
  });
});

describe("native standalone event linkage", () => {
  it("accepts an actual P5 physical journal and rejects altered actual-note facts", () => {
    const sample = musicResultFixture("sight-reading", "native-reading");
    if (sample.course !== "sight-reading") throw new Error("Wrong fixture course");
    const journal = new MusicInputJournal({ runId: sample.runId, presentationId: "actual-score" });
    journal.present(10, "staff");
    for (const note of sample.playedNotes) {
      journal.record({
        kind: "down",
        pitch: note.pitch,
        hand: note.hand,
        source: "midi",
        deviceId: "piano",
        channel: 3,
        rawAtMs: 100 + note.startBeat * 100,
        correctedAtMs: 100 + note.startBeat * 100,
        receivedAtMs: 101 + note.startBeat * 100,
        songBeat: note.startBeat,
        eligible: true
      });
      journal.record({
        kind: "up",
        pitch: note.pitch,
        hand: note.hand,
        source: "midi",
        deviceId: "piano",
        channel: 3,
        rawAtMs: 100 + (note.startBeat + note.durationBeats) * 100,
        correctedAtMs: 100 + (note.startBeat + note.durationBeats) * 100,
        receivedAtMs: 101 + (note.startBeat + note.durationBeats) * 100,
        songBeat: note.startBeat + note.durationBeats,
        eligible: true
      });
    }
    const result = {
      ...sample,
      id: sample.runId,
      provenance: "native" as const,
      inputSource: "midi" as const,
      inputJournal: journal.snapshot()
    };
    expect(validateMusicResult(result)).not.toBeNull();
    expect(validateMusicResult({ ...result, inputSource: "keyboard" })).toBeNull();
    expect(
      validateMusicResult({
        ...result,
        playedNotes: result.playedNotes.map((note, index) =>
          index === 0 ? { ...note, durationBeats: note.durationBeats + 0.01 } : note
        )
      })
    ).toBeNull();
  });
  it("keeps actual pointer choices with rejected keyboard physical events in a P6 journal", () => {
    const sample = musicResultFixture("harmony", "native-choice");
    if (sample.course !== "harmony") throw new Error("Wrong fixture course");
    const journal = new MusicInputJournal({ runId: sample.runId, presentationId: "choice" });
    journal.present(10, "staff");
    journal.record(entry({ eligible: false }));
    journal.record({
      kind: "choice",
      value: "major",
      source: "pointer",
      rawAtMs: 120,
      correctedAtMs: 120,
      receivedAtMs: 120,
      songBeat: null,
      eligible: true
    });
    const result = {
      ...sample,
      id: sample.runId,
      provenance: "native" as const,
      inputSource: "pointer" as const,
      mode: "name-chord" as const,
      answers: [{ kind: "named" as const, expected: "major", answer: "major" }],
      inputJournal: journal.snapshot()
    };
    expect(validateMusicResult(result)).not.toBeNull();
    expect(validateMusicResult({ ...result, inputSource: "midi" })).toBeNull();
    expect(validateMusicResult({ ...result, inputSource: "keyboard" })).toBeNull();
    expect(
      validateMusicResult({
        ...result,
        answers: [{ kind: "named", expected: "major", answer: "minor" }]
      })
    ).toBeNull();
  });
  it("retains a real late-start P7 reply with zero hold, raw MIDI origin and continuous beat coordinates", () => {
    const exercise = generateDictation({
      seed: 4,
      length: 2,
      bpm: 120,
      startMode: "known",
      studiedPitches: [60],
      studiedDurations: [1]
    });
    const runId = "late-dictation",
      presentationId = "late-reference";
    const session = new DictationSession({
      exercise,
      attemptId: runId,
      presentationId,
      purpose: "training",
      input: { source: "midi", deviceId: "piano", channel: 1 }
    });
    session.setReady(true);
    session.receiveListening({ kind: "request", presentationId, playbackId: "sound", atMs: 1 });
    session.receiveListening({ kind: "first-sound", presentationId, playbackId: "sound", atMs: 2 });
    session.receiveListening({ kind: "complete", presentationId, playbackId: "sound", atMs: 3 });
    session.openReply();
    const journal = new MusicInputJournal({ runId, presentationId });
    journal.present(2, "audio");
    for (let index = 0; index < 2; index++) {
      const songBeat = 500 + index,
        down = 1000 + index * 1000,
        up = down + (index === 0 ? 0 : 500);
      for (const [kind, beat, atMs] of [
        ["down", songBeat, down],
        ["up", songBeat + (index === 0 ? 0 : 1), up]
      ] as const) {
        expect(
          session.receiveInput({
            kind,
            pitch: 60,
            source: "midi",
            deviceId: "piano",
            channel: 1,
            presentationId,
            songBeat: beat,
            correctedAtMs: atMs
          })
        ).toBe(true);
        expect(
          journal.record({
            kind,
            pitch: 60,
            source: "midi",
            deviceId: "piano",
            channel: 1,
            rawAtMs: atMs,
            correctedAtMs: atMs,
            receivedAtMs: atMs + 1,
            songBeat: beat,
            eligible: true,
            hand: "right"
          })
        ).toBe(true);
      }
    }
    const actual = session.finish();
    if (!actual) throw new Error("Missing dictionary fixture");
    const sample = musicResultFixture("dictation", runId);
    if (sample.course !== "dictation") throw new Error("Wrong fixture course");
    const result = {
      ...sample,
      id: runId,
      exerciseId: exercise.id,
      seed: exercise.seed,
      bpm: exercise.bpm,
      fingerprint: exercise.fingerprint,
      provenance: "native" as const,
      inputSource: "midi" as const,
      inputJournal: journal.snapshot(),
      expectedNotes: exercise.notes,
      result: actual
    };
    expect(validateMusicResult(result)).toMatchObject({
      result: { comparison: { holdingDurations: { errorsBeats: [-1, 0] } } }
    });
  });
  it("keeps earlier P8 native bodies after a later novel seed replacement and rejects tampered material recipes", () => {
    const plan = createIntegratedPlan({ seed: 42 });
    const lesson = new IntegratedLesson({ plan, lessonId: "replace-body" });
    for (let index = 0; index < 6; index++) {
      complete(lesson);
      if (index < 5) lesson.next(lesson.snapshot().identity);
    }
    expect(lesson.repeat("read-melody")).toBe(true);
    expect(lesson.replaceNovelActivity(lesson.snapshot().identity, 789)).toBe(true);
    complete(lesson);
    const saved = {
      plan: { seed: 42, version: 1 as const, theme: "c-major" as const, bpm: plan.bpm },
      state: lesson.save()
    };
    expect(validateIntegratedProgress(saved)).toBe(true);
    const changed = {
      ...saved,
      state: {
        ...saved.state,
        results: saved.state.results.map((child, index) =>
          index === 5 && child.evidence
            ? {
                ...child,
                evidence: { ...child.evidence, material: { ...child.evidence.material, seed: 789 } }
              }
            : child
        )
      }
    };
    expect(validateIntegratedProgress(changed)).toBe(false);
  });
});

describe("native source cohorts", () => {
  it("checks only admitted physical events against the selected source, retaining mixed choices and rejected receipts", () => {
    const journal = new MusicInputJournal({ runId: "source", presentationId: "shown" });
    journal.present(10, "ready");
    journal.record(entry({ source: "midi", deviceId: "piano", channel: 1, eligible: true }));
    journal.record(
      entry({
        source: "keyboard",
        eligible: false,
        rawAtMs: 110,
        correctedAtMs: 110,
        receivedAtMs: 120
      })
    );
    journal.record({
      kind: "choice",
      value: "third",
      source: "pointer",
      rawAtMs: 130,
      correctedAtMs: 130,
      receivedAtMs: 130,
      songBeat: null,
      eligible: true
    });
    expect(validateMusicInputJournal(journal.snapshot(), { inputSource: "midi" })).toBe(true);
    expect(validateMusicInputJournal(journal.snapshot(), { inputSource: "keyboard" })).toBe(false);
    const reversed = journal
      .snapshot()
      .events.map((event) =>
        event.kind !== "choice" && event.eligible ? { ...event, kind: "up" as const } : event
      );
    expect(
      validateMusicInputJournal(
        { ...journal.snapshot(), events: reversed },
        { inputSource: "keyboard" }
      )
    ).toBe(false);
  });
  it("rejects relabeling native played harmony from keyboard to MIDI", () => {
    const sample = musicResultFixture("harmony", "physical-source");
    if (sample.course !== "harmony") throw new Error("Wrong fixture course");
    const journal = new MusicInputJournal({ runId: sample.runId, presentationId: "chord" });
    journal.present(10, "staff");
    for (const [index, pitch] of [60, 64, 67].entries())
      journal.record(
        entry({
          pitch,
          rawAtMs: 100 + index,
          correctedAtMs: 100 + index,
          receivedAtMs: 100 + index
        })
      );
    const result = {
      ...sample,
      id: sample.runId,
      provenance: "native" as const,
      inputJournal: journal.snapshot()
    };
    expect(validateMusicResult(result)).not.toBeNull();
    expect(validateMusicResult({ ...result, inputSource: "midi" })).toBeNull();
  });
  it("retains an embedded MIDI interval with pointer classification but rejects a forged child source", () => {
    const lesson = new IntegratedLesson({
      plan: createIntegratedPlan({ seed: 42 }),
      lessonId: "interval-source"
    });
    for (let index = 0; index < 7; index++) {
      complete(lesson);
      lesson.next(lesson.snapshot().identity);
    }
    const snapshot = lesson.snapshot();
    expect(snapshot.activity.kind).toBe("interval");
    const original = body(snapshot);
    const evidence = {
      ...original,
      inputJournal: {
        ...original.inputJournal,
        events: original.inputJournal.events.map((event) =>
          event.kind === "choice"
            ? event
            : { ...event, source: "midi" as const, deviceId: "piano", channel: 1 }
        )
      }
    };
    expect(validateMusicEvidence(evidence, { inputSource: "midi" })).toBe(true);
    expect(validateMusicEvidence(evidence, { inputSource: "keyboard" })).toBe(false);
    lesson.setReady(snapshot.identity);
    lesson.start(snapshot.identity);
    const ref: IntegratedChildResult = {
      ...snapshot.identity,
      ...errors.interval,
      resultId: snapshot.identity.runId,
      purpose: snapshot.purpose,
      source: "midi",
      status: "completed",
      performedUnits: 2,
      help: [],
      visualAlternative: false,
      auditoryVerified: true,
      evidence
    };
    expect(lesson.complete({ ...ref, source: "keyboard" })).toBe(false);
    expect(lesson.complete(ref)).toBe(true);
    expect(
      validateIntegratedProgress({
        plan: { seed: 42, version: 1, theme: "c-major", bpm: 72 },
        state: lesson.save()
      })
    ).toBe(true);
  });
});

describe("raw audio boundaries and corrected captured notes", () => {
  it("persists a real PracticeSession/Run reply with +100ms input offset and rejects raw replay overlap", () => {
    const saved = { ...emptyMusicState(), course: "dictation" as const };
    const activity = makeMusicActivity(saved),
      identity = { runId: "clock-domains", presentationId: "audio-domain" };
    const run = new MusicCourseRun(activity, saved, identity, undefined);
    const session = new PracticeSession(activity.exercise.song, {
      mode: "tempo",
      hands: new Set(["left", "right"]),
      speed: 1,
      accompaniment: false,
      noteResult: false,
      countInBeats: 0
    });
    session.startClock(1000);
    session.pauseClock(1000);
    run.seed([], 1000, 100);
    run.setReady(true, 900);
    run.receiveListening({
      kind: "request",
      presentationId: identity.presentationId,
      playbackId: "reference",
      atMs: 1100
    });
    run.receiveListening({
      kind: "first-sound",
      presentationId: identity.presentationId,
      playbackId: "reference",
      atMs: 1110
    });
    run.presented(1110, "audio");
    run.receiveListening({
      kind: "complete",
      presentationId: identity.presentationId,
      playbackId: "reference",
      atMs: 2000
    });
    session.resumeClock(2020);
    expect(run.start(session, 2020, 100)).toBe(true);
    const pitch = activity.exercise.notes[0]?.pitch;
    if (pitch === undefined) throw new Error("Missing source note");
    for (const [type, raw] of [
      ["down", 2050],
      ["up", 2250]
    ] as const) {
      session.tick(raw);
      run.input({ type, pitch, velocity: 80, source: "keyboard", timestamp: raw }, session, true, {
        raw,
        corrected: raw - 100,
        received: raw,
        admitted: true
      });
    }
    const actual = run.finish();
    if (!actual) throw new Error("Missing actual run evidence");
    const result = createMusicStandaloneResult({
      activity,
      saved,
      identity,
      startedAt: 10000,
      completedAt: 11000,
      newMaterial: false,
      evidence: actual,
      groupAnswers: [],
      previewSeconds: 10,
      visualAlternative: false
    });
    if (result?.course !== "dictation") throw new Error("Missing actual dictionary result");
    expect(result.result.notes[0]).toMatchObject({ downAtMs: 1950, upAtMs: 2150, startBeat: 0 });
    expect(validateMusicResult(result)).not.toBeNull();
    const listening = {
      ...result.result.listening,
      receipts: [
        ...result.result.listening.receipts,
        {
          playbackId: "replay",
          requestedAtMs: 2040,
          startedAtMs: 2041,
          endedAtMs: 2100,
          outcome: "full" as const
        }
      ]
    };
    expect(validateMusicResult({ ...result, result: { ...result.result, listening } })).toBeNull();
    const { inputJournal: _raw, ...legacy } = result;
    expect(validateMusicResult({ ...legacy, provenance: "legacy" })).not.toBeNull();
  });
  it("uses the same raw-domain proof for an embedded P8 rhythmic reply", () => {
    const plan = createIntegratedPlan({ seed: 42 });
    const lesson = new IntegratedLesson({ plan, lessonId: "embedded-offset" });
    for (let index = 0; index < 6; index++) {
      complete(lesson);
      lesson.next(lesson.snapshot().identity);
    }
    const snapshot = lesson.snapshot();
    expect(snapshot.phaseId).toBe("heard-rhythm");
    const original = body(snapshot);
    if (!original.dictation) throw new Error("Missing dictionary body fixture");
    const listening = {
      ...original.listening,
      receipts: [
        {
          playbackId: "offset-reference",
          requestedAtMs: 1100,
          startedAtMs: 1110,
          endedAtMs: 2000,
          outcome: "full" as const
        }
      ]
    };
    const inputJournal = {
      ...original.inputJournal,
      presentedAtMs: 1110,
      events: original.inputJournal.events.map((event) => ({
        ...event,
        rawAtMs: event.rawAtMs + 1950,
        receivedAtMs: event.receivedAtMs + 1950,
        correctedAtMs: event.correctedAtMs + 1850
      }))
    };
    const evidence = {
      ...original,
      listening,
      inputJournal,
      dictation: {
        ...original.dictation,
        listening,
        notes: original.dictation.notes.map((note) => ({
          ...note,
          downAtMs: note.downAtMs + 1850,
          upAtMs: note.upAtMs === null ? null : note.upAtMs + 1850
        }))
      }
    };
    expect(validateMusicEvidence(evidence)).toBe(true);
    lesson.setReady(snapshot.identity);
    lesson.start(snapshot.identity);
    const ref: IntegratedChildResult = {
      ...snapshot.identity,
      ...errors.rhythm,
      resultId: snapshot.identity.runId,
      purpose: snapshot.purpose,
      source: "keyboard",
      status: "completed",
      performedUnits: 4,
      help: [],
      visualAlternative: false,
      auditoryVerified: true,
      evidence
    };
    expect(lesson.complete(ref)).toBe(true);
    expect(
      validateIntegratedProgress({
        plan: { seed: 42, version: 1, theme: "c-major", bpm: 72 },
        state: lesson.save()
      })
    ).toBe(true);
    const overlapped = {
      ...listening,
      receipts: [
        ...listening.receipts,
        {
          playbackId: "offset-replay",
          requestedAtMs: 2040,
          startedAtMs: 2041,
          endedAtMs: 2100,
          outcome: "full" as const
        }
      ]
    };
    expect(
      validateMusicEvidence({
        ...evidence,
        listening: overlapped,
        dictation: { ...evidence.dictation, listening: overlapped }
      })
    ).toBe(false);
  });
});

describe("embedded reading group evidence", () => {
  it("derives training/control group errors from the actual material and eligible native choices", () => {
    const plan = createIntegratedPlan({ seed: 42 });
    for (const phaseId of ["read-melody", "final-control"] as const) {
      const activity = plan.phases.find((phase) => phase.id === phaseId)?.activities[0];
      if (activity?.kind !== "sight-reading") throw new Error("Missing reading material fixture");
      const expected =
        phaseId === "read-melody"
          ? activity.exercise.groups[0]
          : activity.exercise.groups.find(
              (group) => group.kind === "scalar" || group.kind === "triadic"
            );
      if (!expected) throw new Error("Missing deterministic group fixture");
      const wrong = expected.kind === "scalar" ? "triadic" : "scalar";
      const snapshot: IntegratedSnapshot = {
        status: "running",
        phaseId,
        activity,
        identity: {
          generation: 1,
          presentationId: `group:${phaseId}:shown`,
          runId: `group:${phaseId}:run`,
          activityId: activity.id
        },
        ready: true,
        purpose: activity.purpose,
        visualAlternative: false,
        completedPhases: [],
        results: [],
        independentControl: false,
        auditoryVerified: false
      };
      const original = body(snapshot),
        last = original.inputJournal.events.at(-1)?.receivedAtMs ?? 10;
      const choices = [
        { value: wrong, eligible: false },
        { value: wrong, eligible: true },
        { value: expected.kind, eligible: true }
      ].map((choice, index) => ({
        ...choice,
        kind: "choice" as const,
        source: "pointer" as const,
        id: `${snapshot.identity.runId}:input:${String(original.inputJournal.events.length + index + 1)}`,
        runId: snapshot.identity.runId,
        presentationId: snapshot.identity.presentationId,
        rawAtMs: last + index + 1,
        correctedAtMs: last + index + 1,
        receivedAtMs: last + index + 1,
        songBeat: null
      }));
      const evidence = {
        ...original,
        inputJournal: {
          ...original.inputJournal,
          events: [...original.inputJournal.events, ...choices]
        }
      };
      const result = {
        ...snapshot.identity,
        phaseId,
        skill: "reading" as const,
        errors: { pitches: 0, timing: 0, groups: 1 },
        resultId: snapshot.identity.runId,
        purpose: snapshot.purpose,
        source: "keyboard" as const,
        status: "completed" as const,
        performedUnits: activity.exercise.notes.length,
        help: [],
        visualAlternative: false,
        auditoryVerified: false,
        evidence
      };
      expect(validateIntegratedEvidence([result], { seed: 42 })).toBe(true);
      expect(
        validateIntegratedEvidence([{ ...result, errors: { ...result.errors, groups: 99 } }], {
          seed: 42
        })
      ).toBe(false);
      expect(
        validateIntegratedEvidence([{ ...result, errors: { ...result.errors, groups: 0 } }], {
          seed: 42
        })
      ).toBe(false);
    }
  });
});
