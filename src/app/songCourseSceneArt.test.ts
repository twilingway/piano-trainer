// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import { buildSongCourseMaterial } from "../songCourse/material";
import { findSongCourseSource } from "../songCourse/catalog";
import { SongCourseSceneArt } from "./songCourseSceneArt";
import { SongCourseController } from "./songCourseController";
import { emptySongCourseProgress } from "../songCourse/progress";
import { songCourseSceneArt, TEACHER_ART, NOTE_CHARACTER_ART } from "../ui/songCourseCharacterArt";
function material(id = "notes-c") {
  const source = findSongCourseSource("hot-cross-buns");
  if (!source) throw new Error("source");
  return buildSongCourseMaterial(source, `hot-cross-buns/${id}`);
}
function deferred() {
  let resolve: (ready: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("current lesson art readiness", () => {
  it("includes every reachable CDE pose, its companion, idle and reward, without unrelated poses", () => {
    const c = songCourseSceneArt(material());
    expect(c).toContain(TEACHER_ART.idle);
    expect(c).toContain(TEACHER_ART.do);
    expect(c).toContain(NOTE_CHARACTER_ART.do);
    expect(c).not.toContain(TEACHER_ART.re);
    expect(c).not.toContain(TEACHER_ART.mi);
    expect(c.some((url) => url.includes("reward-star"))).toBe(true);
    const phrase = songCourseSceneArt(material("guided-1"));
    expect(phrase).toContain(TEACHER_ART.mi);
    expect(phrase).toContain(TEACHER_ART.re);
    expect(phrase).toContain(TEACHER_ART.do);
    expect(new Set(phrase).size).toBe(phrase.length);
  });
  it("requires both complete scene decode and actual engraved SVG image decode", async () => {
    const ready = vi.fn(),
      failed = vi.fn(),
      pending = deferred();
    const decode = vi.fn((url: string) =>
      url === "clef.svg" ? pending.promise : Promise.resolve(true)
    );
    const scene = new SongCourseSceneArt(material(), "scene", decode);
    const result = scene.presented(["clef.svg"], ready, failed);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    pending.resolve(true);
    await result;
    expect(ready).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });
  it("fails a missing essential pose and a new scene can retry it", async () => {
    const ready = vi.fn(),
      failed = vi.fn();
    const old = new SongCourseSceneArt(material(), "old", (url) =>
      Promise.resolve(url !== TEACHER_ART.do)
    );
    await old.presented([], ready, failed);
    expect(ready).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    old.dispose();
    const retry = new SongCourseSceneArt(material(), "new", () => Promise.resolve(true));
    await retry.presented([], ready, failed);
    expect(ready).toHaveBeenCalledOnce();
  });
  it("cancels obsolete success and failure and supports StrictMode effect setup again", async () => {
    const ready = vi.fn(),
      failed = vi.fn(),
      first = deferred();
    const scene = new SongCourseSceneArt(material(), "scene", () => first.promise);
    const stale = scene.presented([], ready, failed);
    scene.dispose();
    scene.activate();
    first.resolve(true);
    await stale;
    expect(ready).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    await scene.presented([], ready, failed);
    expect(ready).toHaveBeenCalledOnce();
  });
  it("keeps audio prepare concurrent but cannot start transport until decoded art presents", async () => {
    const controller = new SongCourseController(
      { onSelection: vi.fn(), onResult: vi.fn() },
      { load: () => Promise.resolve(emptySongCourseProgress()), save: () => Promise.resolve() }
    );
    controller.choose("hot-cross-buns", "hot-cross-buns/notes-c");
    const load = vi.fn(),
      audio = deferred(),
      art = deferred(),
      prepare = vi.fn(() => audio.promise);
    const trainer = { load, setPlaying: vi.fn() } as unknown as Trainer;
    controller.refreshConnection({ trainer, blocked: false, prepare });
    const scene = new SongCourseSceneArt(material(), controller.sceneId, () => art.promise);
    const presentation = scene.presented(
      [],
      () => {
        controller.present(controller.sceneId);
      },
      () => {
        controller.artError(controller.sceneId);
      }
    );
    const start = controller.start();
    expect(prepare).toHaveBeenCalledOnce();
    audio.resolve(true);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    art.resolve(true);
    await presentation;
    await start;
    expect(load).toHaveBeenCalledOnce();
    controller.dispose();
    scene.dispose();
  });
  it("shows a controlled asset error and old art failure cannot replace another lesson", () => {
    const controller = new SongCourseController({ onSelection: vi.fn(), onResult: vi.fn() });
    controller.choose("hot-cross-buns", "hot-cross-buns/notes-c");
    const id = controller.sceneId;
    controller.artError(id);
    expect(controller.getSnapshot().error).toContain("картинки");
    controller.retry();
    expect(controller.getSnapshot().phase).toBe("ready");
    controller.artError(id);
    expect(controller.getSnapshot().phase).toBe("ready");
    controller.dispose();
  });
});
