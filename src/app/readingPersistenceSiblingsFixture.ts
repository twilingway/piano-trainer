import { generateTwoHandExercise } from "../reading/twoHandGenerator";
import { TwoHandSession } from "../reading/twoHandSession";
import { generateBassReadingExercise } from "../reading/bassGenerator";
import { toBassReadingResult } from "../reading/bassTypes";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { generateIntervalExercise } from "../intervals/generator";
import { IntervalSession } from "../intervals/session";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import { addReadingResult } from "../reading/progress";
import { emptyReadingState } from "./readingMigration";

function coordinationResult(runId: string, completedAt = 2000, help = false) {
  const exercise = generateTwoHandExercise(7);
  const session = new TwoHandSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId,
    startedAt: 1000
  });
  session.setActive(true, 0);
  exercise.pairs.forEach((pair, index) => {
    const at = index * 1000;
    session.prepare(pair.id, at);
    session.present(pair.id, at);
    if (help && index === 0) session.showHint(pair.id, 1, at + 1);
    for (const [kind, pitch, delta] of [
      ["down", pair.pitches[0], 10],
      ["down", pair.pitches[1], 110],
      ["up", pair.pitches[0], 120],
      ["up", pair.pitches[1], 130]
    ] as const) {
      session.input({ kind, pitch, source: "keyboard", atMs: at + delta }, at + delta);
    }
    session.tick(at + 381);
  });
  const completed = session.result(runId, completedAt);
  if (!completed) throw new Error("Incomplete coordination fixture");
  return completed;
}

export function readingPersistenceSiblings() {
  const state = emptyReadingState();
  state.coordination = {
    ...state.coordination,
    seed: 7,
    sourceFilter: "midi",
    history: [coordinationResult("coordination")]
  };
  const reading = generateReadingExercise("notes", 42);
  const readSession = new ReadingSession(reading, DEFAULT_READING_PREFERENCES);
  readSession.setActive(true, 0);
  reading.song.notes.forEach((note, index) => {
    readSession.prepare(note.id, note.pitch, index * 1000);
    readSession.present(note.id, index * 1000);
    readSession.answer(note.pitch, "keyboard", index * 1000 + 10);
  });
  const right = readSession.result("p2", 100);
  if (!right) throw new Error("Incomplete reading fixture");
  state.task = "notes";
  state.seed = 42;
  state.history = [right];
  state.profile = { ...addReadingResult(state.profile, right), delayedDueAt: 99999 };
  state.presentedFingerprints = ["seen-p2"];
  state.preferences = { automaticHints: false, nameDelayMs: 7000, keyDelayMs: 12000 };
  const bass = generateBassReadingExercise("phrases", 3);
  const bassSession = new ReadingSession(bass, DEFAULT_READING_PREFERENCES, {
    runId: "bass",
    startedAt: 1
  });
  bassSession.setActive(true, 0);
  bass.song.notes.forEach((note, index) => {
    bassSession.prepare(note.id, note.pitch, index * 1000);
    bassSession.present(note.id, index * 1000);
    bassSession.answer(note.pitch, "pointer", index * 1000 + 10);
  });
  const bassResult = toBassReadingResult(bassSession.result("bass", 200));
  if (!bassResult) throw new Error("Incomplete bass fixture");
  state.bass = {
    ...state.bass,
    task: "phrases",
    seed: 3,
    sourceFilter: "pointer",
    history: [bassResult]
  };
  const interval = generateIntervalExercise("see-and-play", 3);
  const intervalSession = new IntervalSession(interval, { runId: "interval", startedAt: 1 });
  intervalSession.setActive(true, 0);
  interval.pairs.forEach((pair, index) => {
    const identity = intervalSession.identity();
    if (!identity) throw new Error("Missing interval identity");
    intervalSession.present(identity, index * 100);
    intervalSession.answerPitch(identity, pair.anchorMidi, "keyboard", index * 100 + 10);
    intervalSession.answerPitch(identity, pair.targetMidi, "keyboard", index * 100 + 20);
  });
  const intervalResult = intervalSession.result("interval", 300);
  if (!intervalResult) throw new Error("Incomplete interval fixture");
  state.intervals = {
    ...state.intervals,
    mode: "see-and-play",
    seed: 3,
    history: [intervalResult]
  };
  const rhythm = generateRhythmExercise(3, 60);
  const rhythmSession = new RhythmSession(rhythm, {
    runId: "rhythm",
    source: "keyboard",
    startedAt: 1,
    startedAtMs: 0,
    offsets: {
      inputOffsetMs: 0,
      manualInputOffsetMs: 0,
      audioOutputOffsetMs: 0,
      visualOffsetMs: 0,
      status: "uncalibrated"
    }
  });
  rhythmSession.advance(rhythmSession.completionTimeS);
  const rhythmResult = rhythmSession.result(400);
  if (!rhythmResult) throw new Error("Incomplete rhythm fixture");
  state.rhythm = { ...state.rhythm, seed: 3, bpm: 60, history: [rhythmResult] };
  state.activeCourse = "bass-reading";
  return state;
}
