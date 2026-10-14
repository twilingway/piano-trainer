import { generateHeldBassExercise } from "../reading/heldBassGenerator";
import { HeldBassSession } from "../reading/heldBassSession";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { PracticeSession } from "../practice/session";
import type { HeldBassFragment, HeldBassResult } from "../reading/heldBassTypes";

/** Test data uses the actual single clock and core acknowledgements, never forged flags. */
export function makeHeldBassResult(
  runId: string,
  completedAt = 2000,
  help = false,
  error = false
): HeldBassResult {
  const exercise = generateHeldBassExercise(7);
  const course = new HeldBassSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId,
    startedAt: 1000
  });
  const practiceFor = (fragment: HeldBassFragment, at: number) => {
    const practice = new PracticeSession(fragment.song, {
      mode: "wait",
      hands: new Set(["left", "right"]),
      speed: 1,
      accompaniment: false,
      noteResult: false,
      countInBeats: 0
    });
    if (!practice.registerVerifiedOnsets({ runId, fragmentId: fragment.id, steps: fragment.steps }))
      throw new Error("Cannot register fixture onsets");
    course.prepare(fragment.id, at);
    course.present(fragment.id, at);
    course.setActive(true, at);
    practice.startClock(at);
    practice.tick(at);
    course.tick(at, practice.clockReceipt(at));
    return practice;
  };
  exercise.fragments.forEach((fragment, index) => {
    let at = index * 5000;
    let practice = practiceFor(fragment, at);
    if (help && index === 0) course.showHint(fragment.id, 0, 1, at + 1);
    const input = (kind: "down" | "up", pitch: number, time: number) => {
      practice.tick(time);
      course.input(
        { kind, pitch, source: "keyboard", atMs: time },
        time,
        practice.clockReceipt(time)
      );
    };
    if (error && index === 0) {
      input("down", 80, at + 10);
      input("up", 80, at + 20);
      course.tick(at + 271, practice.clockReceipt(at + 271));
      at += 400;
      practice = practiceFor(fragment, at);
    }
    input("down", fragment.bassPitch, at + 10);
    input("down", fragment.melodyPitches[0] ?? 60, at + 110);
    input("up", fragment.melodyPitches[0] ?? 60, at + 120);
    let commitAt = at + 361;
    fragment.steps.forEach((_ids, step) => {
      if (step > 0) {
        const target = fragment.melodyPitches[step];
        if (target === undefined) throw new Error("Missing melody target");
        at = commitAt + 500;
        practice.tick(at);
        course.tick(at, practice.clockReceipt(at));
        input("down", target, at + 10);
        input("up", target, at + 20);
        commitAt = at + 261;
      }
      practice.tick(commitAt);
      const request = course.tick(commitAt, practice.clockReceipt(commitAt)).pendingCommit;
      if (!request) throw new Error("Missing verified fixture onset");
      const accepted = practice.commitVerifiedOnset(request, commitAt) !== undefined;
      if (!accepted) throw new Error("Fixture onset rejected by the actual clock");
      course.acknowledgeOnset(request, accepted, practice.clockReceipt(commitAt));
    });
    const endAt = commitAt + 500;
    practice.tick(endAt);
    course.tick(endAt, practice.clockReceipt(endAt));
    input("up", fragment.bassPitch, endAt + 1);
    course.tick(endAt + 252, practice.clockReceipt(endAt + 252));
  });
  const result = course.result(completedAt);
  if (!result) throw new Error("Incomplete held-bass fixture");
  return result;
}
