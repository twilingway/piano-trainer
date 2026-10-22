import { PracticeSession } from "../practice/session";
import { generateIndependentRhythmExercise } from "./generator";
import { IndependentRhythmPhaseSession } from "./session";
import { createIndependentRhythmResult } from "./result";
import type {
  IndependentRhythmConfig,
  IndependentRhythmInput,
  IndependentRhythmPhaseExercise,
  IndependentRhythmResult
} from "./types";

export function rhythmHarness(
  phase: IndependentRhythmPhaseExercise,
  config: IndependentRhythmConfig = {
    runId: "run",
    presentationId: "run:pulse",
    source: "keyboard",
    offsetMs: 0
  },
  start = 1000
) {
  const practice = new PracticeSession(phase.song, {
    mode: "tempo",
    hands: new Set(["left", "right"]),
    speed: 1,
    countInBeats: 4,
    accompaniment: false,
    noteResult: false
  });
  practice.startClock(start - 100);
  practice.pauseClock(start - 100);
  const session = new IndependentRhythmPhaseSession(phase, config);
  session.present(start - 50);
  const begin = (): boolean => {
    const started = session.start(start);
    if (started) practice.resumeClock(start);
    return started;
  };
  begin();
  const frame = (at: number) => {
    practice.tick(at);
    return session.tick(at, practice.tempoClockReceipt(at));
  };
  frame(start);
  const send = (
    input: Partial<IndependentRhythmInput> &
      Pick<IndependentRhythmInput, "kind" | "pitch" | "atMs">,
    received = input.atMs
  ) => {
    practice.tick(received);
    return session.input(
      {
        source: config.source,
        offsetMs: config.offsetMs,
        ...(config.deviceId === undefined ? {} : { deviceId: config.deviceId }),
        ...(config.source === "midi" ? { channel: config.channel ?? 1 } : {}),
        ...input
      },
      received,
      practice.tempoClockReceipt(received)
    );
  };
  const attack = (
    pitch: number,
    songMs: number,
    metadata: Partial<IndependentRhythmInput> = {}
  ) => {
    const raw = start + 4000 + songMs + config.offsetMs;
    send({ kind: "down", pitch, atMs: raw, ...metadata });
    send({ kind: "up", pitch, atMs: raw + 10, ...metadata });
  };
  const solve = () => {
    for (const onset of [...new Set(phase.song.notes.map((note) => note.start))]) {
      const notes = phase.song.notes.filter((note) => note.start === onset);
      for (const note of notes)
        send({
          kind: "down",
          pitch: note.pitch,
          atMs: start + 4000 + onset * 1000 + config.offsetMs
        });
      for (const note of notes)
        send({
          kind: "up",
          pitch: note.pitch,
          atMs: start + 4010 + onset * 1000 + config.offsetMs
        });
    }
  };
  const finish = (extra = 0) =>
    frame(start + 4000 + phase.song.duration * 1000 + Math.max(0, config.offsetMs) + 251 + extra);
  return { practice, session, frame, send, attack, solve, finish, start, phase, config };
}
export function successfulIndependentRhythmResult(
  seed = 0,
  runId = `run-${String(seed)}`
): IndependentRhythmResult {
  const exercise = generateIndependentRhythmExercise(seed);
  const pulse = rhythmHarness(exercise.pulse, {
    runId,
    presentationId: `${runId}:pulse`,
    source: "keyboard",
    offsetMs: 0
  });
  pulse.solve();
  pulse.finish();
  const pulseResult = pulse.session.result();
  if (!pulseResult) throw new Error("Missing pulse proof");
  const series = rhythmHarness(
    exercise.series,
    { runId, presentationId: `${runId}:series`, source: "keyboard", offsetMs: 0 },
    pulseResult.finalizedAtMs + 100
  );
  series.solve();
  series.finish();
  const seriesResult = series.session.result();
  if (!seriesResult) throw new Error("Missing series proof");
  const result = createIndependentRhythmResult(exercise, pulseResult, seriesResult, {
    startedAt: 100,
    completedAt: 1000
  });
  if (!result) throw new Error("Invalid result fixture");
  return result;
}
