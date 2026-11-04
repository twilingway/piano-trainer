// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import type { PracticeSession } from "../practice/session";
import { emptySongCourseProgress } from "../songCourse/progress";
import { SongCourseController } from "./songCourseController";

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
  const material = controller.getSnapshot().material;
  if (!material) throw new Error("material missing");
  let index = 0,
    finished = false;
  const session = {
    waiting: true,
    time: 0,
    get finished() {
      return finished;
    },
    songTimeAt: () => material.expected[Math.min(index, material.expected.length - 1)]?.start ?? 0,
    owedNote: () =>
      material.song.notes.find((note) => note.id === material.expected[index]?.runtimeNoteId),
    pressKeyAt: () => {
      index++;
      return [];
    },
    releaseKeyAt: () => {
      finished = index === material.expected.length;
      return [];
    }
  } as unknown as PracticeSession;
  const play = vi.fn((playing: boolean) => {
    if (playing) controller.policy.onStart(session, 1000, []);
    else controller.policy.cancel(1000, false, "pause");
  });
  const load = vi.fn();
  controller.refreshConnection({
    trainer: { setPlaying: play, load } as unknown as Trainer,
    blocked: false,
    prepare: () => Promise.resolve(true)
  });
  return { controller, material, session, result, selected, save, play, load };
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
    expect(h.play).toHaveBeenCalledExactlyOnceWith(true);
    expect(h.load).toHaveBeenCalledOnce();
  });
  it("freezes a result once after physical release collection, never on the final down", async () => {
    const h = harness();
    h.controller.present(h.controller.sceneId);
    await h.controller.start();
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
});
