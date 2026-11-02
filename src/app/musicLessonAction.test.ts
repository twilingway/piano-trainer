import { describe, expect, it, vi } from "vitest";
import {
  musicButtonAnswer,
  musicLessonAction,
  completedPracticeTransport,
  restartBasicPractice,
  lessonPlayback,
  practiceLessonAction,
  type CompletedPracticeOwners
} from "./musicLessonAction";
import type { MusicCourseView } from "../ui/musicCourseTypes";

function view(patch: Partial<MusicCourseView> = {}): MusicCourseView {
  return {
    course: "dictation",
    taskKind: "dictation",
    status: "ready",
    ready: true,
    allReleased: true,
    canStart: false,
    canListen: true,
    canFinish: false,
    canNext: false,
    canHelp: true,
    showHelp: false,
    ...patch
  };
}
describe("the shared lesson transport", () => {
  it("keeps the listening prerequisite even if alternative buttons are allowed", () => {
    const current = view({
      canAnswer: true,
      choices: [{ value: "visual-alternative", labelKey: "alt" }]
    });
    expect(musicButtonAnswer(current)).toBe(false);
    expect(musicLessonAction(current)).toMatchObject({ command: "listen", disabled: false });
  });
  it("stops a listening attempt without promising pause and resume", () => {
    expect(musicLessonAction(view({ status: "listening", canListen: false }))).toMatchObject({
      labelKey: "Остановить попытку",
      command: "stop"
    });
  });
  it("never substitutes start for preparation choices or timed preview", () => {
    expect(
      musicLessonAction(view({ status: "preflight", taskKind: "position", canAnswer: true }))
        .command
    ).toBeNull();
    expect(musicLessonAction(view({ status: "preview", previewSeconds: 5 })).command).toBeNull();
  });
  it("keeps explicit finish visible while held keys prevent submission", () => {
    expect(
      musicLessonAction(view({ status: "reply", canFinish: false, allReleased: false }))
    ).toMatchObject({
      command: "finish",
      disabled: true,
      reasonKey: "Отпустите все клавиши перед продолжением."
    });
  });
  it("next takes precedence over optional result recommendations", () => {
    expect(
      musicLessonAction(
        view({ status: "result", canAnswer: true, canNext: true, taskKind: "group" })
      )
    ).toMatchObject({ command: "next", disabled: false });
  });
  it("does not offer a named answer before the controller has started the run", () => {
    const current = view({
      taskKind: "name-chord",
      canAnswer: true,
      canStart: true,
      canListen: false
    });
    expect(musicButtonAnswer(current)).toBe(false);
    expect(musicLessonAction(current)).toMatchObject({ command: "start", disabled: false });
  });
  it("labels novelty-required control retry as a new example", () => {
    expect(
      musicLessonAction(view({ status: "error", retryCreatesNewMaterial: true }))
    ).toMatchObject({ labelKey: "Новый пример для проверки", command: "retry" });
  });
  it("does not unlock start because UI sound is ready while the controller is not", () => {
    expect(musicLessonAction(view({ ready: false, canStart: true }))).toMatchObject({
      command: "start",
      disabled: true
    });
  });
});

function completionOwners(): CompletedPracticeOwners {
  const series = () => ({ active: false, snapshot: { completed: false }, newSeries: vi.fn() });
  return {
    reading: series(),
    intervals: series(),
    twoHand: series(),
    heldBass: series(),
    rhythm: { active: false, status: "idle", onRepeat: vi.fn() },
    independentRhythm: { active: false, status: "preparation", onRepeat: vi.fn() }
  };
}

describe("the primary action after a basic lesson result", () => {
  it.each(["reading", "intervals", "twoHand", "heldBass"] as const)(
    "routes completed %s to its existing newSeries command through the shared play dispatcher",
    (kind) => {
      const owners = completionOwners();
      const onNewSeries = vi.fn();
      const completed = completedPracticeTransport(
        {
          ...owners,
          [kind]: { active: true, snapshot: { completed: true }, newSeries: onNewSeries }
        },
        false
      );
      expect(completed?.action).toEqual({
        labelKey: "Новая серия",
        command: "new",
        disabled: false
      });
      const songPlay = vi.fn();
      const sharedPlay = lessonPlayback(
        false,
        completed !== null,
        () => {
          completed?.invoke();
        },
        songPlay
      );
      sharedPlay();
      expect(onNewSeries).toHaveBeenCalledOnce();
      expect(songPlay).not.toHaveBeenCalled();
    }
  );

  it.each(["rhythm", "independentRhythm"] as const)(
    "routes completed %s to the existing explicit repeat command",
    (kind) => {
      const onRepeat = vi.fn();
      const completed = completedPracticeTransport(
        {
          ...completionOwners(),
          [kind]: { active: true, status: "completed", onRepeat }
        },
        false
      );
      expect(completed?.action).toEqual({
        labelKey: "Повторить",
        command: "retry",
        disabled: false
      });
      completed?.invoke();
      expect(onRepeat).toHaveBeenCalledOnce();
    }
  );

  it("does not substitute a new set before completion or from an inactive cached result", () => {
    const owners = completionOwners();
    expect(
      completedPracticeTransport(
        {
          ...owners,
          reading: { ...owners.reading, active: true, snapshot: { completed: false } }
        },
        false
      )
    ).toBeNull();
    expect(
      completedPracticeTransport(
        {
          ...owners,
          reading: { ...owners.reading, active: false, snapshot: { completed: true } }
        },
        false
      )
    ).toBeNull();
    const songPlay = vi.fn();
    lessonPlayback(false, false, vi.fn(), songPlay)();
    expect(songPlay).toHaveBeenCalledOnce();
    expect(
      practiceLessonAction({
        ear: false,
        paused: false,
        listening: false,
        counting: false,
        playing: false,
        cancelsAttempt: false,
        blocked: false
      }).labelKey
    ).toBe("Играть");
  });

  it.each(["preparation", "playing", "failed", "cancelled"])(
    "keeps the existing rhythm phase route during %s rather than fabricating completion",
    (status) => {
      expect(
        completedPracticeTransport(
          {
            ...completionOwners(),
            independentRhythm: { active: true, status, onRepeat: vi.fn() }
          },
          false
        )
      ).toBeNull();
    }
  );

  it("keeps completed actions blocked while a lesson dialog is open", () => {
    const owners = completionOwners(),
      onNewSeries = vi.fn();
    const completed = completedPracticeTransport(
      {
        ...owners,
        reading: { active: true, snapshot: { completed: true }, newSeries: onNewSeries }
      },
      true
    );
    expect(completed?.action.disabled).toBe(true);
    completed?.invoke();
    expect(onNewSeries).not.toHaveBeenCalled();
  });
});

it.each(["reading", "intervals", "twoHand", "heldBass", "rhythm", "independentRhythm"] as const)(
  "preserves the existing start-over callback for %s while sharing the transport adapter",
  (kind) => {
    const owners = completionOwners(),
      command = vi.fn(),
      fallback = vi.fn();
    const selected =
      kind === "rhythm" || kind === "independentRhythm"
        ? { active: true, status: "playing", onRepeat: command }
        : { active: true, snapshot: { completed: false }, newSeries: command };
    restartBasicPractice({ ...owners, [kind]: selected }, fallback);
    expect(command).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  }
);
it("retains ordinary song restart when no lesson is active", () => {
  const fallback = vi.fn();
  restartBasicPractice(completionOwners(), fallback);
  expect(fallback).toHaveBeenCalledOnce();
});
