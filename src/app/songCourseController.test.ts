// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import {
  PracticeSession as RealSession,
  type PracticeSession,
  type PracticeOptions
} from "../practice/session";
import type { Song } from "../song/song";
import type { KeyEvent } from "../input/midiInput";
import { courseInputKey } from "./songCourseGuidance";
import { emptySongCourseProgress } from "../songCourse/progress";
import { SongCourseController } from "./songCourseController";

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}
function harness() {
  const result = vi.fn(),
    selected = vi.fn(),
    save = vi.fn(() => Promise.resolve());
  const controller = new SongCourseController(
    { onSelection: selected, onResult: result },
    {
      load: () => Promise.resolve(emptySongCourseProgress()),
      save
    }
  );
  controller.choose("hot-cross-buns", "hot-cross-buns/notes-c");
  const readMaterial = () => {
    const material = controller.getSnapshot().material;
    if (!material) throw new Error("material missing");
    return material;
  };
  const learner = (song: Song): PracticeSession => {
    let index = 0;
    const session = {
      song,
      waiting: true,
      time: 0,
      finished: false,
      songTimeAt: () => {
        const material = readMaterial();
        return material.expected[Math.min(index, material.expected.length - 1)]?.start ?? 0;
      },
      owedNote: () => {
        const material = readMaterial();
        return material.song.notes.find(
          (note) => note.id === material.expected[index]?.runtimeNoteId
        );
      },
      pressKeyAt: () => {
        index++;
        return [];
      },
      releaseKeyAt: () => {
        session.finished = index === readMaterial().expected.length;
        return [];
      }
    };
    return session as unknown as PracticeSession;
  };
  let session = learner(readMaterial().song),
    now = 1000;
  const held = new Map<string, KeyEvent>();
  const play = vi.fn((playing: boolean) => {
    if (playing) controller.policy.onStart(session, now, [...held.values()]);
    else controller.policy.cancel(now, false, "pause");
  });
  const load = vi.fn((song: Song, options: PracticeOptions) => {
    controller.policy.cancel(now, false, "load");
    session = options.hands.size ? learner(song) : new RealSession(song, options);
  });
  const trainer = { setPlaying: play, load } as unknown as Trainer;
  const prepare = vi.fn(() => Promise.resolve(true));
  controller.refreshConnection({ trainer, blocked: false, prepare });
  const send = (type: "down" | "up", pitch: number, at: number, raw = at) => {
    now = at;
    const event: KeyEvent = {
      type,
      pitch,
      velocity: type === "down" ? 90 : 0,
      source: "keyboard",
      timestamp: raw
    };
    if (type === "down") held.set(courseInputKey(event), event);
    else held.delete(courseInputKey(event));
    return controller.policy.onInput(
      event,
      session,
      controller.getSnapshot().phase === "playing" || controller.getSnapshot().phase === "demo",
      { raw, corrected: raw, received: at, admitted: true }
    );
  };
  const finishDemo = async () => {
    const demo = session;
    demo.time = demo.song.duration;
    demo.finished = true;
    controller.policy.onFrame(demo, true, now);
    await flush();
    return demo;
  };
  const answerTurn = async () => {
    controller.present(controller.sceneId);
    await controller.start();
    if (controller.getSnapshot().phase === "demo") await finishDemo();
  };
  return {
    controller,
    get material() {
      return readMaterial();
    },
    get session() {
      return session;
    },
    result,
    selected,
    save,
    play,
    load,
    trainer,
    prepare,
    send,
    held,
    finishDemo,
    answerTurn
  };
}

describe("song-course transport lifecycle", () => {
  it("keeps practice speed temporary without selecting another song or starting playback", () => {
    const h = harness();
    h.controller.setSpeed(0.5);
    expect(h.controller.options?.speed).toBe(0.5);
    expect(h.controller.getSnapshot().phase).toBe("ready");
    expect(h.selected).toHaveBeenCalledOnce();
    expect(h.play).not.toHaveBeenCalledWith(true);
  });
  it("opens paused and requires actual staff presentation before play", async () => {
    const h = harness();
    expect(h.controller.getSnapshot().phase).toBe("ready");
    expect(h.play).not.toHaveBeenCalled();
    const start = h.controller.start();
    await Promise.resolve();
    expect(h.play).not.toHaveBeenCalled();
    h.controller.present(h.controller.sceneId);
    await start;
    expect(h.play.mock.calls.filter(([playing]) => playing)).toEqual([[true]]);
    expect(h.load).toHaveBeenCalledOnce();
  });
  it("freezes a result once after physical release collection, never on the final down", async () => {
    const h = harness();
    await h.answerTurn();
    let at = 1000;
    for (const note of h.material.expected) {
      h.controller.policy.onFrame(h.session, true, at);
      h.controller.policy.onInput(
        { type: "down", pitch: note.pitch, velocity: 90, source: "keyboard" },
        h.session,
        true,
        { raw: at, corrected: at, received: at, admitted: true }
      );
      h.controller.policy.onFrame(h.session, true, at);
      expect(h.result).not.toHaveBeenCalled();
      at += note.duration * 1000;
      h.controller.policy.onInput(
        { type: "up", pitch: note.pitch, velocity: 0, source: "keyboard" },
        h.session,
        true,
        { raw: at, corrected: at, received: at, admitted: true }
      );
      at += 20;
    }
    expect(h.controller.faceFeedback.read()?.notes.every((note) => note.state === "correct")).toBe(
      true
    );
    h.controller.policy.onFrame(h.session, true, at);
    h.controller.policy.onFrame(h.session, true, at + 1100);
    h.controller.policy.onFrame(h.session, false, at + 2200);
    expect(h.result).toHaveBeenCalledOnce();
    expect(h.controller.getSnapshot().phase).toBe("result");
    expect(h.controller.getSnapshot().result?.expectedCount).toBe(h.material.expected.length);
  });
  it("aborts cleanup before its fabricated releases can become physical evidence", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    h.controller.policy.cancel(1100, true, "cleanup");
    h.controller.policy.onInput(
      { type: "up", pitch: 60, velocity: 0, source: "keyboard" },
      h.session,
      false,
      { raw: 1200, corrected: 1200, received: 1200, admitted: true }
    );
    h.controller.policy.onFrame(h.session, false, 5000);
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.controller.faceFeedback.read()).toBeNull();
    expect(h.result).not.toHaveBeenCalled();
  });
  it("publishes count-in from session time without awarding melody progress", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    expect(h.controller.getSnapshot().countdown).toBe(4);
    const session = h.session as unknown as { time: number; waiting: boolean };
    for (const [time, count] of [
      [-3.3, 4],
      [-2.49, 3],
      [-1.65, 2],
      [-0.01, 1],
      [0, undefined]
    ] as const) {
      session.time = time;
      h.controller.policy.onFrame(h.session, true, 1000);
      expect(h.controller.getSnapshot().countdown).toBe(count);
      expect(h.controller.getSnapshot().progress).toBe(0);
    }
    expect(h.result).not.toHaveBeenCalled();
    h.controller.retry();
    expect(h.controller.getSnapshot().countdown).toBeUndefined();
  });
});

describe("listen then repeat transport", () => {
  it("shows the source fragment with four beats first and starts exactly one fresh counted learner attempt", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    expect(h.controller.getSnapshot()).toMatchObject({ phase: "demo", countdown: 4 });
    expect(h.session.options.hands.size).toBe(0);
    expect(h.session.options.countInBeats).toBe(4);
    expect(h.session.time).toBeLessThan(0);
    expect(
      h.session.song.notes.every((note) =>
        h.material.expected.some((expected) => expected.runtimeNoteId === note.id)
      )
    ).toBe(true);
    h.send("down", 60, 1000);
    h.send("up", 60, 1100);
    expect(h.result).not.toHaveBeenCalled();
    const old = await h.finishDemo();
    expect(h.controller.getSnapshot()).toMatchObject({
      phase: "playing",
      countdown: 4,
      result: null
    });
    expect(h.controller.faceFeedback.read()?.runId).not.toBeNull();
    const run = h.controller.faceFeedback.read()?.runId;
    h.controller.policy.onFrame(old, true, 5000);
    h.controller.policy.onFrame(old, true, 6000);
    await flush();
    expect(h.controller.faceFeedback.read()?.runId).toBe(run);
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(2);
    expect(h.result).not.toHaveBeenCalled();
  });
  it("returns menu preview to ready with zero count-in and no learner run", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.demo();
    expect(h.session.options.countInBeats).toBe(0);
    expect(h.session.time).toBe(0);
    await h.finishDemo();
    expect(h.controller.getSnapshot().phase).toBe("ready");
    expect(h.controller.faceFeedback.read()?.runId).toBeNull();
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
  });
  it("waits for actual all-up, ignores an older release, and gives the release no future answer credit", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    h.send("down", 60, 2000);
    h.send("down", 62, 2100);
    await h.finishDemo();
    expect(h.controller.getSnapshot().phase).toBe("awaiting-keys-up");
    expect(h.controller.faceFeedback.read()?.runId).toBeNull();
    h.send("up", 60, 2200, 1900);
    await flush();
    expect(h.controller.getSnapshot().phase).toBe("awaiting-keys-up");
    h.send("up", 60, 2300);
    await flush();
    expect(h.controller.getSnapshot().phase).toBe("awaiting-keys-up");
    h.send("up", 62, 2400);
    await flush();
    expect(h.controller.getSnapshot().phase).toBe("playing");
    expect(h.controller.faceFeedback.read()?.notes.every((note) => note.state === "neutral")).toBe(
      true
    );
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(2);
    expect(h.result).not.toHaveBeenCalled();
  });
  it("resumes the same paused example and cancels its old automatic handoff", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    const demo = h.session;
    demo.time = 0.5;
    h.controller.pause();
    expect(h.controller.getSnapshot().phase).toBe("paused");
    await h.controller.start();
    expect(h.session).toBe(demo);
    expect(h.session.time).toBe(0.5);
    expect(h.controller.getSnapshot().phase).toBe("demo");
    await h.finishDemo();
    expect(h.controller.getSnapshot().phase).toBe("ready");
    expect(h.controller.faceFeedback.read()?.runId).toBeNull();
  });
  it.each(["retry", "exit", "choose", "cleanup"] as const)(
    "cancels a release-gated handoff on %s",
    async (action) => {
      const h = harness();
      h.controller.present(h.controller.sceneId);
      await h.controller.start();
      h.send("down", 60, 2000);
      const old = await h.finishDemo();
      if (action === "choose") h.controller.choose("hot-cross-buns", "hot-cross-buns/notes-d");
      else if (action === "cleanup") h.controller.policy.cancel(2100, true, "cleanup");
      else h.controller[action]();
      h.send("up", 60, 2200);
      h.controller.policy.onFrame(old, true, 2300);
      await flush();
      expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
      expect(h.result).not.toHaveBeenCalled();
    }
  );
  it("does not revive stale async preparation after retry, pause, or a changed scene", async () => {
    for (const action of ["retry", "pause", "choose"] as const) {
      const h = harness();
      let resolve: ((value: boolean) => void) | undefined;
      h.prepare.mockImplementation(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          })
      );
      h.controller.present(h.controller.sceneId);
      const pending = h.controller.start();
      if (action === "choose") h.controller.choose("hot-cross-buns", "hot-cross-buns/notes-d");
      else h.controller[action]();
      resolve?.(true);
      await pending;
      await flush();
      expect(h.play).not.toHaveBeenCalledWith(true);
      expect(h.result).not.toHaveBeenCalled();
    }
  });
  it("handles rejected sound preparation without a delayed learner continuation", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    h.prepare.mockRejectedValueOnce(new Error("audio"));
    await h.controller.start();
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.play).not.toHaveBeenCalledWith(true);
  });
  it.each(["independent", "performance"])(
    "starts %s assessment without a required example",
    async (kind) => {
      const h = harness();
      const source = h.material.source;
      const node = source.nodes.find(
        (value) => value.kind === (kind === "independent" ? "independent-phrase" : "performance")
      );
      if (!node) throw new Error("missing assessment fixture");
      h.controller.choose(source.id, node.id);
      h.controller.present(h.controller.sceneId);
      await h.controller.start();
      expect(h.controller.getSnapshot().phase).toBe("playing");
      expect(h.controller.faceFeedback.read()?.runId).not.toBeNull();
    }
  );
});

it("cancels learner preparation after a completed example and ignores repeated old finished frames", async () => {
  const h = harness();
  h.controller.present(h.controller.sceneId);
  await h.controller.start();
  let resolve: ((value: boolean) => void) | undefined;
  h.prepare.mockImplementation(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  const old = await h.finishDemo();
  h.controller.policy.onFrame(old, true, 1500);
  h.controller.policy.onFrame(old, true, 1600);
  h.controller.retry();
  resolve?.(true);
  await flush();
  expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
  expect(h.controller.getSnapshot().phase).toBe("ready");
  expect(h.result).not.toHaveBeenCalled();
});

it("cancels an in-flight initial start when the connection blocks even before any demo attempt exists", async () => {
  const h = harness();
  let resolve: ((value: boolean) => void) | undefined;
  h.prepare.mockImplementation(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  h.controller.present(h.controller.sceneId);
  const pending = h.controller.start();
  h.controller.refreshConnection({ trainer: h.trainer, blocked: true, prepare: h.prepare });
  h.controller.refreshConnection({ trainer: h.trainer, blocked: false, prepare: h.prepare });
  resolve?.(true);
  await pending;
  expect(h.play).not.toHaveBeenCalledWith(true);
});

describe("piano audio interruptions", () => {
  it("cancels a repeat example before a resumed audio context or stale finish can start an answer", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    const unheard = h.session;
    unheard.time = 0.5;
    h.controller.soundInterrupted();
    expect(h.controller.getSnapshot()).toMatchObject({
      phase: "error",
      waiting: false,
      countdown: undefined
    });
    expect(h.controller.faceFeedback.read()).toBeNull();
    unheard.time = unheard.song.duration;
    unheard.finished = true;
    h.controller.policy.onFrame(unheard, true, 10000);
    await flush();
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
    expect(h.result).not.toHaveBeenCalled();
    h.controller.retry();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    expect(h.controller.getSnapshot().phase).toBe("demo");
  });

  it("invalidates the all-up handoff so a later real release cannot start the child", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    h.send("down", 60, 2000);
    await h.finishDemo();
    expect(h.controller.getSnapshot().phase).toBe("awaiting-keys-up");
    h.controller.soundInterrupted();
    h.send("up", 60, 2200);
    await flush();
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
    expect(h.result).not.toHaveBeenCalled();
  });

  it.each(["initial", "handoff"] as const)(
    "invalidates a transient interruption during %s asynchronous preparation",
    async (stage) => {
      const h = harness();
      h.controller.present(h.controller.sceneId);
      if (stage === "handoff") await h.controller.start();
      let resolve: ((value: boolean) => void) | undefined;
      h.prepare.mockImplementation(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          })
      );
      const pending = stage === "initial" ? h.controller.start() : h.finishDemo();
      await flush();
      h.controller.soundInterrupted();
      resolve?.(true);
      await pending;
      await flush();
      expect(h.controller.getSnapshot().phase).toBe("error");
      expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(
        stage === "initial" ? 0 : 1
      );
      expect(h.result).not.toHaveBeenCalled();
    }
  );

  it("stops a menu preview and rejects its later completion without starting a learner run", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.demo();
    const preview = h.session;
    h.controller.soundInterrupted();
    preview.finished = true;
    h.controller.policy.onFrame(preview, true, 10000);
    await flush();
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
    expect(h.result).not.toHaveBeenCalled();
  });

  it("aborts an independent active attempt before old frames or inputs can save a result", async () => {
    const h = harness();
    const node = h.material.source.nodes.find((value) => value.kind === "independent-phrase");
    if (!node) throw new Error("missing independent fixture");
    h.controller.choose(h.material.source.id, node.id);
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
    const attempt = h.session;
    expect(h.controller.faceFeedback.read()?.runId).not.toBeNull();
    h.controller.soundInterrupted();
    attempt.finished = true;
    h.controller.policy.onFrame(attempt, true, 10000);
    h.controller.policy.onFrame(attempt, false, 20000);
    h.send("down", 60, 21000);
    expect(h.controller.getSnapshot()).toMatchObject({ phase: "error", result: null });
    expect(h.controller.getSnapshot().progressState.results).toHaveLength(0);
    expect(h.result).not.toHaveBeenCalled();
  });

  it("leaves an idle selected course and an exited course untouched", () => {
    const h = harness();
    const idle = h.controller.getSnapshot();
    h.controller.soundInterrupted();
    expect(h.controller.getSnapshot()).toBe(idle);
    h.controller.exit();
    const exited = h.controller.getSnapshot();
    h.controller.soundInterrupted();
    expect(h.controller.getSnapshot()).toBe(exited);
  });
});

it.each(["repeat", "preview"] as const)(
  "keeps learner progress empty throughout a %s example",
  async (purpose) => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    if (purpose === "repeat") await h.controller.start();
    else await h.controller.demo();
    h.session.time = h.session.song.duration / 2;
    h.controller.policy.onFrame(h.session, true, 5000);
    expect(h.controller.getSnapshot()).toMatchObject({ phase: "demo", progress: 0 });
    expect(h.controller.getSnapshot().countdown).toBeUndefined();
    expect(h.result).not.toHaveBeenCalled();
  }
);
