// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { Vector2 } from "three";
import { Rectangle } from "./math";
import { Renderer } from "./renderer";

function fixture(width = 320, height = 180, resolution = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * resolution);
  canvas.height = Math.floor(height * resolution);
  const widthWrites = vi.spyOn(canvas, "width", "set");
  const heightWrites = vi.spyOn(canvas, "height", "set");
  const nativeSize = new Vector2(width, height);
  let pixelRatio = resolution;
  const native = {
    getSize: (target: Vector2) => target.copy(nativeSize),
    getPixelRatio: () => pixelRatio,
    setDrawingBufferSize: vi.fn((nextWidth: number, nextHeight: number, ratio: number) => {
      nativeSize.set(nextWidth, nextHeight);
      pixelRatio = ratio;
      canvas.width = Math.floor(nextWidth * ratio);
      canvas.height = Math.floor(nextHeight * ratio);
    })
  };
  const renderer = Object.assign(Object.create(Renderer.prototype) as object, {
    screen: new Rectangle(0, 0, width, height),
    canvas,
    threeRenderer: native,
    resolution
  }) as unknown as Renderer;
  return { renderer, canvas, native, nativeSize, widthWrites, heightWrites };
}

it("keeps the framebuffer intact on repeated notifications and still restores CSS size", () => {
  const { renderer, canvas, native, widthWrites, heightWrites } = fixture();
  canvas.style.width = "12px";
  canvas.style.height = "8px";
  renderer.resize(320, 180);
  renderer.resize(320, 180);
  expect(native.setDrawingBufferSize).not.toHaveBeenCalled();
  // Reassigning either canvas dimension clears the existing WebGL drawing buffer.
  expect(widthWrites).not.toHaveBeenCalled();
  expect(heightWrites).not.toHaveBeenCalled();
  expect(canvas.style.width).toBe("320px");
  expect(canvas.style.height).toBe("180px");
});

it("uses Three's old dimensions when the shared screen was already updated by the application", () => {
  const { renderer, native, nativeSize } = fixture();
  renderer.screen.width = 640;
  renderer.screen.height = 360;
  renderer.resize(640, 360);
  expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(640, 360, 2);
  expect(nativeSize.toArray()).toEqual([640, 360]);
});

it("updates orientation and preserves fractional logical sizes even at the same rounded pixel size", () => {
  const { renderer, canvas, native } = fixture(320.1, 180.1);
  renderer.resize(320.2, 180.2);
  expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(320.2, 180.2, 2);
  expect([canvas.width, canvas.height]).toEqual([640, 360]);
  expect([canvas.style.width, canvas.style.height]).toEqual(["320.2px", "180.2px"]);
  native.setDrawingBufferSize.mockClear();
  renderer.resize(180.2, 320.2);
  expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(180.2, 320.2, 2);
  expect([canvas.width, canvas.height]).toEqual([360, 640]);
  renderer.resize(180.2, 320.2);
  expect(native.setDrawingBufferSize).toHaveBeenCalledOnce();
});

it.each([2.001, 3])(
  "updates DPR %s once, including when the rounded backing dimensions remain unchanged",
  (resolution) => {
    const { renderer, canvas, native } = fixture();
    renderer.resolution = resolution;
    renderer.resize(320, 180);
    expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(320, 180, resolution);
    expect(native.getPixelRatio()).toBe(resolution);
    expect([canvas.width, canvas.height]).toEqual([
      Math.floor(320 * resolution),
      Math.floor(180 * resolution)
    ]);
    expect([canvas.style.width, canvas.style.height]).toEqual(["320px", "180px"]);
    renderer.resize(320, 180);
    expect(native.setDrawingBufferSize).toHaveBeenCalledOnce();
  }
);

it("repairs an externally changed backing buffer even when the logical size and DPR match", () => {
  const { renderer, canvas, native } = fixture();
  canvas.width = 1;
  renderer.resize(320, 180);
  expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(320, 180, 2);
  expect([canvas.width, canvas.height]).toEqual([640, 360]);
});

it("keeps the existing minimum size and does not repeatedly clear a clamped viewport", () => {
  const { renderer, canvas, native } = fixture();
  renderer.resize(0, -1);
  expect(native.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(1, 1, 2);
  expect([renderer.screen.width, renderer.screen.height]).toEqual([1, 1]);
  expect([canvas.style.width, canvas.style.height]).toEqual(["1px", "1px"]);
  renderer.resize(-2, 0);
  expect(native.setDrawingBufferSize).toHaveBeenCalledOnce();
});
