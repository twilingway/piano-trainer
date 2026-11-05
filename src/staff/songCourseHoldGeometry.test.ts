import { expect, it } from "vitest";
import { songCourseHoldPlacement } from "./songCourseHoldGeometry";
const view = { left: 10, top: 20, right: 330, bottom: 200 };
const head = { left: 170, top: 100, right: 190, bottom: 112 };
it("keeps a short rail to the right of the active head", () => {
  const value = songCourseHoldPlacement(view, head, []);
  expect(value?.left).toBe(198);
  expect(value?.width).toBe(104);
  expect(requireValue(value).left).toBeGreaterThan(head.right);
});
it("stops before the next written entry including its stem and finger", () => {
  const next = { left: 272, top: 50, right: 292, bottom: 148 };
  const value = songCourseHoldPlacement(view, head, [next]);
  expect(requireValue(value).left + requireValue(value).width).toBeLessThan(next.left);
  expect(requireValue(value).width).toBeLessThan(104);
});
it("uses a clear lower band when a nearby entry or viewport edge leaves no right-side room", () => {
  const next = { left: 220, top: 50, right: 250, bottom: 132 };
  const value = songCourseHoldPlacement(view, head, [next]);
  expect(requireValue(value).top).toBeGreaterThan(next.bottom);
  expect(requireValue(value).left + requireValue(value).width).toBeLessThanOrEqual(view.right);
  const edge = songCourseHoldPlacement(view, { ...head, left: 300, right: 320 }, [next]);
  expect(requireValue(edge).top).toBeGreaterThan(head.bottom);
  expect(requireValue(edge).left + requireValue(edge).width).toBeLessThan(view.right);
});

function requireValue<T>(value: T | null): T {
  if (value === null) throw new Error("missing fixture value");
  return value;
}

it("keeps a compact below-ink cue at the visible cursor for dense or hidden edge heads", () => {
  const viewport = { left: 0, top: 0, right: 320, bottom: 375 };
  const active = { left: -30, top: 150, right: -10, bottom: 162 };
  const written = { left: 20, top: 60, right: 320, bottom: 180 };
  const value = requireValue(
    songCourseHoldPlacement(viewport, active, [written], {
      anchorX: 128,
      forceFallback: true,
      below: 200
    })
  );
  expect(value.compact).toBe(true);
  expect(value.top).toBeGreaterThan(200);
  expect(value.left).toBe(128);
  expect(value.width).toBe(64);
  expect(value.top + 30).toBeLessThanOrEqual(375);
});
it("clamps the persistent cue inside the visual viewport instead of dropping a real hold", () => {
  const viewport = { left: 80, top: 40, right: 350, bottom: 300 };
  const active = { left: 340, top: 240, right: 360, bottom: 252 };
  const value = requireValue(
    songCourseHoldPlacement(viewport, active, [], { below: 290, anchorX: 400, forceFallback: true })
  );
  expect(value.left + value.width).toBeLessThanOrEqual(350);
  expect(value.top + 30).toBe(300);
});
