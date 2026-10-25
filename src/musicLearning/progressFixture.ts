import { generateSightReading } from "./sightReading";
import { createHarmonyTriadExercise, createHarmonyAccompaniment } from "./harmony";
import { generateDictation } from "./dictation";
import { DictationSession } from "./dictationSession";
import { createIntegratedPlan, IntegratedLesson } from "./integrated";
import type { IntegratedChildResult, IntegratedEvidence } from "./integrated";
import { computeSightReadingMetrics, computeHarmonyMetrics } from "./progress";
import type { MusicResult, MusicResultCommon } from "./progress";
import type { MusicCourse } from "./types";

/** Fixtures use public generators and child session results, never asserted score percentages. */
export function musicResultFixture(
  course: MusicCourse,
  runId: string = course,
  completedAt = 2000
): MusicResult {
  const common = (exercise: {
    id: string;
    seed: number;
    bpm: number;
    fingerprint: string;
  }): MusicResultCommon => ({
    id: `result:${runId}`,
    runId,
    exerciseId: exercise.id,
    seed: exercise.seed,
    generatorVersion: 1,
    bpm: exercise.bpm,
    purpose: "training",
    inputSource: "keyboard",
    startedAt: 1000,
    completedAt,
    newMaterial: false,
    fingerprint: exercise.fingerprint,
    help: []
  });
  if (course === "sight-reading") {
    const exercise = generateSightReading({ seed: 42, level: "steps", purpose: "training" });
    return {
      ...common(exercise),
      course,
      level: "steps",
      previewSeconds: 10,
      expectedNotes: exercise.notes,
      playedNotes: exercise.notes,
      groupAnswers: [],
      metrics: computeSightReadingMetrics(exercise.notes, exercise.notes, [], "training")
    };
  }
  if (course === "harmony") {
    const { exercise, chord } = createHarmonyTriadExercise({
      id: "harmony-fixture",
      seed: 42,
      bpm: 80,
      root: 60,
      quality: "major"
    });
    const answers = [
      {
        kind: "played" as const,
        target: { mode: "exact" as const, pitches: chord.pitches },
        playedPitches: chord.pitches,
        spreadMs: 100,
        attempts: []
      }
    ];
    return {
      ...common(exercise),
      course,
      lesson: "triads",
      mode: "build-chord",
      aural: false,
      expectedNotes: exercise.notes,
      answers,
      metrics: computeHarmonyMetrics(answers)
    };
  }
  if (course === "dictation") {
    const exercise = generateDictation({
      seed: 42,
      length: 2,
      bpm: 80,
      startMode: "known",
      studiedPitches: [60, 64],
      studiedDurations: [1]
    });
    const presentationId = `${runId}:dictation`;
    const session = new DictationSession({
      exercise,
      attemptId: runId,
      presentationId,
      purpose: "training",
      input: { source: "keyboard" }
    });
    session.setReady(true);
    session.receiveListening({ kind: "request", presentationId, playbackId: "play", atMs: 0 });
    session.receiveListening({ kind: "first-sound", presentationId, playbackId: "play", atMs: 1 });
    session.receiveListening({ kind: "complete", presentationId, playbackId: "play", atMs: 100 });
    session.openReply(100);
    for (const note of exercise.notes) {
      session.receiveInput({
        kind: "down",
        source: "keyboard",
        presentationId,
        pitch: note.pitch,
        correctedAtMs: 200 + note.startBeat * 1000,
        songBeat: note.startBeat
      });
      session.receiveInput({
        kind: "up",
        source: "keyboard",
        presentationId,
        pitch: note.pitch,
        correctedAtMs: 200 + (note.startBeat + note.durationBeats) * 1000,
        songBeat: note.startBeat + note.durationBeats
      });
    }
    const result = session.finish();
    if (!result) throw new Error("Incomplete dictation fixture");
    return {
      ...common(exercise),
      course,
      expectedNotes: exercise.notes,
      startMode: exercise.startMode,
      level: exercise.level,
      result
    };
  }
  const plan = createIntegratedPlan({ seed: 42 });
  const lesson = new IntegratedLesson({ plan, lessonId: runId });
  const evidence: Record<IntegratedEvidence["skill"], IntegratedEvidence> = {
    keyboard: { skill: "keyboard", errors: { wrongKeys: 0 } },
    reading: { skill: "reading", errors: { pitches: 0, timing: 0, groups: 0 } },
    rhythm: { skill: "rhythm", errors: { onsets: 0, durations: 0, missing: 0, extra: 0 } },
    interval: { skill: "interval", errors: { recognition: 0, pitches: 0 } },
    harmony: { skill: "harmony", errors: { pitches: 0, bass: 0, synchrony: 0 } },
    coordination: { skill: "coordination", errors: { left: 0, right: 0, timing: 0 } }
  };
  for (let index = 0; index < 16; index++) {
    const snapshot = lesson.snapshot();
    lesson.setReady(snapshot.identity, {
      reservedFingerprint: snapshot.activity.exercise.fingerprint
    });
    lesson.start(snapshot.identity);
    const ref: IntegratedChildResult = {
      ...snapshot.identity,
      ...evidence[snapshot.activity.skill],
      resultId: `child:${snapshot.identity.runId}`,
      purpose: snapshot.purpose,
      source: "keyboard",
      status: "completed",
      performedUnits: snapshot.activity.expectedUnits,
      help: [],
      visualAlternative: false,
      auditoryVerified: snapshot.activity.auditory
    };
    if (!lesson.complete(ref)) throw new Error("Incomplete integrated fixture");
    if (index < 15) lesson.next(snapshot.identity);
  }
  return {
    ...common({ id: plan.id, seed: plan.seed, bpm: plan.bpm, fingerprint: plan.id }),
    course,
    plan: { seed: plan.seed, version: 1, theme: "c-major", bpm: plan.bpm },
    state: lesson.save()
  };
}

/** Clone a real session fixture into a distinct persisted cohort without losing identity links. */
export function retargetMusicResultFixture(
  sample: MusicResult,
  runId: string,
  inputSource: MusicResult["inputSource"],
  purpose: MusicResult["purpose"]
): MusicResult {
  const common = { ...sample, id: `result:${runId}`, runId, inputSource, purpose };
  if (sample.course === "dictation")
    return {
      ...common,
      course: "dictation",
      expectedNotes: sample.expectedNotes,
      startMode: sample.startMode,
      level: sample.level,
      result: {
        ...sample.result,
        attemptId: runId,
        purpose,
        listening: { ...sample.result.listening, attemptId: runId, purpose },
        notes: sample.result.notes.map((note) => ({
          ...note,
          origin: {
            source: inputSource,
            ...(inputSource === "midi" ? { deviceId: "fixture", channel: 1 } : {})
          }
        }))
      }
    };
  if (sample.course === "integrated")
    return {
      ...common,
      course: "integrated",
      plan: sample.plan,
      state: {
        ...sample.state,
        lessonId: runId,
        results: sample.state.results.map((ref) => ({
          ...ref,
          source: inputSource,
          runId: ref.runId.replace(`${sample.runId}:`, `${runId}:`),
          presentationId: ref.presentationId.replace(`${sample.runId}:`, `${runId}:`),
          resultId: ref.resultId.replace(sample.runId, runId)
        }))
      }
    };
  return common;
}

export function harmonyAccompanimentResultFixture(
  runId = "accompaniment"
): Extract<MusicResult, { course: "harmony" }> {
  const base = musicResultFixture("harmony", runId);
  if (base.course !== "harmony") throw new Error("Unexpected fixture course");
  const { exercise, chords } = createHarmonyAccompaniment({
    id: `${runId}:exercise`,
    seed: 42,
    bpm: 80,
    progression: "I-IV-V-I",
    tonic: 48,
    melody: [60, 64, 67, 60].map((pitch, index) => ({
      pitch,
      startBeat: index * 4,
      durationBeats: 4,
      hand: "right"
    }))
  });
  const answers = chords.map((chord, index) => ({
    kind: "played" as const,
    target: { mode: "exact" as const, pitches: chord.pitches },
    playedPitches: chord.pitches,
    startBeat: index * 4,
    hand: "left" as const,
    spreadMs: 0,
    attempts: []
  }));
  return {
    ...base,
    exerciseId: exercise.id,
    seed: exercise.seed,
    bpm: exercise.bpm,
    fingerprint: exercise.fingerprint,
    lesson: "accompaniment",
    expectedNotes: exercise.notes,
    answers,
    metrics: computeHarmonyMetrics(answers)
  };
}
