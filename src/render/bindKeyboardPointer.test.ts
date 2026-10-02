// @vitest-environment happy-dom
import { Container } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindKeyboardPointer } from "./bindKeyboardPointer";

describe("keyboard pointer gestures", () => {
  let stage: Container;
  let canvas: HTMLCanvasElement;
  let covered: boolean;
  let unbind: () => void;
  const play = vi.fn();
  const release = vi.fn();
  const event = (pointerId = 1, buttons = 1) =>
    ({ pointerId, buttons, clientX: 10, clientY: 20 }) as FederatedPointerEvent;

  beforeEach(() => {
    play.mockClear();
    release.mockClear();
    stage = new Container();
    canvas = document.createElement("canvas");
    covered = false;
    vi.spyOn(document, "elementFromPoint").mockImplementation(() =>
      covered ? document.body : canvas
    );
    unbind = bindKeyboardPointer(stage, canvas, play, release);
  });
  afterEach(() => {
    unbind();
    stage.destroy();
    vi.restoreAllMocks();
  });

  it("ignores document moves from a menu gesture, even after entering the canvas", () => {
    covered = true;
    stage.emit("pointerdown", event());
    stage.emit("pointermove", event());
    covered = false;
    stage.emit("pointermove", event());
    expect(play).not.toHaveBeenCalled();
  });

  it("plays a canvas press and drag, then releases outside", () => {
    stage.emit("pointerdown", event());
    stage.emit("pointermove", event());
    stage.emit("pointerupoutside", event(1, 0));
    stage.emit("pointermove", event());
    expect(play).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("ends a canvas gesture when an overlay covers it", () => {
    stage.emit("pointerdown", event());
    covered = true;
    stage.emit("pointermove", event());
    covered = false;
    stage.emit("pointermove", event());
    expect(play).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("ignores another finger and releases the active finger on cancellation", () => {
    stage.emit("pointerdown", event());
    stage.emit("pointermove", event(2));
    stage.emit("pointerup", event(2, 0));
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    stage.emit("pointermove", event());
    expect(play).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("removes listeners and releases the held key on disposal", () => {
    stage.emit("pointerdown", event());
    unbind();
    play.mockClear();
    release.mockClear();
    stage.emit("pointerdown", event());
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    expect(play).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
