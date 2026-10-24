import { afterEach, describe, expect, it, vi } from "vitest";

import { FillGradient, Graphics, Text } from "./baking";

function contextStub() {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    beginPath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    createLinearGradient: vi.fn(() => gradient)
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls: context, gradient };
}

afterEach(() => vi.unstubAllGlobals());

describe("static Three.js shape baking", () => {
  it("keeps the complete negative-coordinate outline when cloned and independently cleared", () => {
    const original = new Graphics().rect(-30, -15, 20, 10).fill(0xff0000).stroke({ width: 4 });
    const clone = original.clone();
    original.clear().circle(10, 20, 5).fill(0xffffff);
    expect(clone.getLocalBounds()).toEqual({ x: -32, y: -17, width: 24, height: 14 });
    expect(original.getLocalBounds()).toEqual({ x: 5, y: 15, width: 10, height: 10 });
    const { context, calls } = contextStub();
    clone.drawCanvas(context);
    expect(calls.rect).toHaveBeenCalledTimes(2);
    expect(calls.rect).toHaveBeenCalledWith(-30, -15, 20, 10);
    expect(calls.fill).toHaveBeenCalledOnce();
    expect(calls.stroke).toHaveBeenCalledOnce();
    clone.clear();
    expect(clone.getLocalBounds()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("reuses an outline for its fill and stroke, then starts a separate path", () => {
    const shape = new Graphics()
      .moveTo(-10, 0)
      .lineTo(10, 0)
      .lineTo(0, 20)
      .fill(0xff0000)
      .stroke({ width: 2 })
      .rect(40, 50, 10, 10)
      .fill(0xffffff);
    const { context, calls } = contextStub();
    shape.drawCanvas(context);
    expect(calls.beginPath).toHaveBeenCalledTimes(3);
    expect(calls.moveTo).toHaveBeenCalledTimes(2);
    expect(calls.lineTo).toHaveBeenCalledTimes(4);
    expect(calls.rect).toHaveBeenCalledOnce();
    expect(calls.fill).toHaveBeenCalledTimes(2);
    expect(calls.stroke).toHaveBeenCalledOnce();
  });

  it("maps normalized gradients into the shape's coordinate bounds", () => {
    const shape = new Graphics().rect(-20, 10, 40, 80).fill(
      new FillGradient({
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        colorStops: [
          { offset: 0, color: 0xff0000 },
          { offset: 1, color: 0x0000ff }
        ]
      })
    );
    const { context, calls, gradient } = contextStub();
    shape.drawCanvas(context);
    expect(calls.createLinearGradient).toHaveBeenCalledWith(-20, 10, 20, 90);
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, "#ff0000"],
      [1, "#0000ff"]
    ]);
  });

  it("places a baked negative-coordinate texture at its original bounds and reuses it until edited", () => {
    const { context, calls } = contextStub();
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => context }));
    vi.stubGlobal("document", { createElement });
    const shape = new Graphics().rect(-30, -15, 20, 10).fill(0xffffff);
    shape.ensureBaked();
    shape.updateGeometry();
    const texture = shape.texture;
    expect(calls.translate).toHaveBeenCalledWith(30, 15);
    expect(Array.from(shape.geometry.positions)).toEqual([-30, -15, -10, -15, -30, -5, -10, -5]);
    expect(texture.width).toBe(20);
    expect(texture.height).toBe(10);
    shape.ensureBaked();
    expect(shape.texture).toBe(texture);
    shape.clear().rect(0, 0, 30, 20).fill(0xffffff).ensureBaked();
    expect(texture.destroyed).toBe(true);
    expect(shape.texture.width).toBe(30);
    expect(createElement).toHaveBeenCalledTimes(2);
    shape.destroy();
  });
});

describe("text layout before GPU upload", () => {
  it("applies text anchoring once after baking and keeps the raster content local", () => {
    const { context, calls } = contextStub();
    Object.assign(context, { measureText: () => ({ width: 40 }), fillText: vi.fn() });
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, getContext: () => context })
    });
    const text = new Text({ text: "AA", style: { fontSize: 20 } });
    text.anchor.set(0.5, 1);
    const before = text.getLocalBounds();
    text.ensureBaked();
    text.updateGeometry();
    expect(text.getLocalBounds()).toEqual(before);
    expect(Array.from(text.geometry.positions)).toEqual([-20, -20, 20, -20, -20, 0, 20, 0]);
    expect(calls.translate).toHaveBeenCalledWith(-0, -0);
    text.destroy();
  });
  it("fits finger badges to font bounds without shrinking them for a decorative glow", () => {
    const context = {
      font: "",
      measureText: vi.fn((text: string) => ({
        width: text.length === 1 ? 20 : 70,
        actualBoundingBoxAscent: 26,
        actualBoundingBoxDescent: 7,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length === 1 ? 20 : 70
      }))
    };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
    const text = new Text({
      text: "2",
      style: { fontSize: 32, stroke: { width: 2 }, dropShadow: { blur: 7, distance: 0 } }
    });
    expect(text.width).toBe(22);
    expect(text.height).toBe(35);
    text.style.dropShadow = { blur: 20, distance: 0 };
    text.style.update();
    expect(text.width).toBe(22);
    expect(text.height).toBe(35);
    text.destroy();
  });
  it("invalidates fallback measurements when content or an explicitly refreshed font changes", () => {
    vi.stubGlobal("document", undefined);
    const text = new Text({ text: "A", style: { fontSize: 20 } });
    const singleWidth = text.width;
    text.text = "AAAA";
    expect(text.width).toBeCloseTo(singleWidth * 4);
    text.style.fontSize = 40;
    text.style.update();
    expect(text.width).toBeCloseTo(singleWidth * 8);
    text.width = 100;
    expect(text.width).toBeCloseTo(100);
    text.destroy();
  });

  it("anchors the measured bounds once and preserves multiline height", () => {
    vi.stubGlobal("document", undefined);
    const text = new Text({ text: "AA\nB", style: { fontSize: 20, lineHeight: 30, padding: 4 } });
    text.anchor.set(0.5, 1);
    expect(text.height).toBe(68);
    const bounds = text.getLocalBounds();
    expect(bounds.x).toBe(-text.width / 2);
    expect(bounds.y).toBe(-68);
    expect(bounds.width).toBe(text.width);
    text.destroy();
  });
});
