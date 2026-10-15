import { generateIndependentRhythmExercise } from "../independentRhythm/generator";
import { IndependentRhythmPhaseSession } from "../independentRhythm/session";
import { createIndependentRhythmResult } from "../independentRhythm/result";
import { PracticeSession } from "../practice/session";
import type { IndependentRhythmPhaseExercise } from "../independentRhythm/types";

/** Persistence fixtures come from actual session clocks and the public journal API. */
export function makeIndependentRhythmResult(runId: string, completedAt = 2000, help = false) {
  const exercise = generateIndependentRhythmExercise(7);
  const phaseResult = (phase: IndependentRhythmPhaseExercise, at: number) => {
    const practice = new PracticeSession(phase.song, {
      mode: "tempo",
      hands: new Set(["left", "right"]),
      speed: 1,
      accompaniment: false,
      noteResult: false,
      countInBeats: 4
    });
    const session = new IndependentRhythmPhaseSession(phase, {
      runId,
      presentationId: `${runId}:${phase.phase}`,
      source: "keyboard",
      offsetMs: 0
    });
    session.present(at);
    if (help) session.showKeys(phase.phase === "pulse" ? [60] : [48, 60], at);
    if (!session.start(at)) throw new Error("Cannot start rhythm fixture");
    practice.startClock(at);
    practice.tick(at);
    session.tick(at, practice.tempoClockReceipt(at));
    const inputs = phase.song.notes
      .flatMap((note) => {
        const down = at + 4000 + note.start * 1000;
        return [
          { kind: "down" as const, pitch: note.pitch, source: "keyboard" as const, atMs: down },
          { kind: "up" as const, pitch: note.pitch, source: "keyboard" as const, atMs: down + 10 }
        ];
      })
      .sort((a, b) => a.atMs - b.atMs);
    for (const event of inputs) {
      practice.tick(event.atMs);
      session.input(event, event.atMs, practice.tempoClockReceipt(event.atMs));
    }
    const end = at + 4000 + phase.song.duration * 1000 + 251;
    practice.tick(end);
    session.tick(end, practice.tempoClockReceipt(end));
    const result = session.result();
    if (!result) throw new Error("Incomplete rhythm phase fixture");
    return result;
  };
  const pulse = phaseResult(exercise.pulse, 0);
  const series = phaseResult(exercise.series, pulse.finalizedAtMs + 100);
  const result = createIndependentRhythmResult(exercise, pulse, series, {
    startedAt: 1000,
    completedAt
  });
  if (!result) throw new Error("Invalid independent rhythm fixture");
  return result;
}
