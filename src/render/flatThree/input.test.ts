import { afterEach, describe, expect, it, vi } from "vitest";
import { bindPointerEvents } from "./input";
import { Rectangle } from "./math";
import { Container } from "./scene";
class Pointer extends Event {
  constructor(
    name: string,
    readonly details: Record<string, number | string> = {}
  ) {
    super(name, { cancelable: true });
    Object.assign(this, details);
  }
}
function setup() {
  vi.stubGlobal("PointerEvent", Pointer);
  const windowTarget = new EventTarget();
  vi.stubGlobal("window", windowTarget);
  const canvas = Object.assign(new EventTarget(), {
    style: { cursor: "", touchAction: "pan-y" },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn()
  });
  const stage = new Container({ eventMode: "static" });
  stage.hitArea = new Rectangle(0, 0, 200, 100);
  const cleanup = bindPointerEvents(
    canvas as unknown as HTMLCanvasElement,
    stage,
    new Rectangle(0, 0, 200, 100)
  );
  const send = (name: string, id: number, x = 35, y = 45) => {
    canvas.dispatchEvent(
      new Pointer(name, {
        pointerId: id,
        pointerType: "touch",
        buttons: name === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y
      })
    );
  };
  return { canvas, stage, cleanup, send, windowTarget };
}
afterEach(() => vi.unstubAllGlobals());
describe("native pointer dispatch", () => {
  it("prevents browser panning for key gestures and restores prior touch policy", () => {
    const s = setup(),
      e = new Pointer("pointerdown", { pointerId: 19, buttons: 1, clientX: 35, clientY: 45 });
    expect(s.canvas.style.touchAction).toBe("none");
    s.canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    s.cleanup();
    expect(s.canvas.style.touchAction).toBe("pan-y");
    s.stage.destroy();
  });
  it("converts CSS coordinates once and captures independent pointer ids", () => {
    const s = setup(),
      down = vi.fn(),
      up = vi.fn();
    s.stage.on("pointerdown", down);
    s.stage.on("pointerup", up);
    s.send("pointerdown", 1);
    s.send("pointerdown", 2, 60, 30);
    expect(down.mock.calls[0]?.[0]).toMatchObject({
      global: { x: 50, y: 50 },
      pointerId: 1,
      pointerType: "touch"
    });
    expect(down.mock.calls[1]?.[0]).toMatchObject({ global: { x: 100, y: 20 }, pointerId: 2 });
    expect(s.canvas.setPointerCapture.mock.calls).toEqual([[1], [2]]);
    s.send("pointerup", 1);
    expect(up).toHaveBeenCalledTimes(1);
    s.send("pointerup", 2);
    expect(up).toHaveBeenCalledTimes(2);
    s.cleanup();
    s.stage.destroy();
  });
  it("releases captured notes on cancel and blur while decorative layers do not intercept", () => {
    const s = setup(),
      decorative = new Container({ eventMode: "none" }),
      cancel = vi.fn(),
      outside = vi.fn(),
      down = vi.fn();
    decorative.hitArea = new Rectangle(0, 0, 200, 100);
    decorative.on("pointerdown", down);
    s.stage.addChild(decorative);
    s.stage.on("pointercancel", cancel);
    s.stage.on("pointerupoutside", outside);
    s.send("pointerdown", 7);
    s.send("pointercancel", 7);
    expect(cancel).toHaveBeenCalledTimes(1);
    s.send("pointerdown", 8);
    s.windowTarget.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(outside).toHaveBeenCalledTimes(2);
    expect(down).not.toHaveBeenCalled();
    s.cleanup();
    s.stage.destroy({ children: true });
  });
  it("removes listeners and cancels outstanding gestures exactly once on disposal", () => {
    const s = setup(),
      down = vi.fn(),
      cancel = vi.fn();
    s.stage.on("pointerdown", down);
    s.stage.on("pointercancel", cancel);
    s.send("pointerdown", 3);
    s.cleanup();
    s.send("pointerdown", 4);
    expect(down).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    s.windowTarget.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(1);
    s.stage.destroy();
  });
});
