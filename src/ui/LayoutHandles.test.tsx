import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import { USUAL_PLACEMENT, viewGeometry } from "../render/viewGeometry";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeysHandles, StaffHandle } from "./LayoutHandles";

let root: Root;
let host: HTMLDivElement;
const onLayout = vi.fn();
const onZoom = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerHeight", 1000);
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(notes: boolean, singleLine = true) {
  await act(async () => {
    root.render(
      <div className="workspace-main" data-piano-layout-reference="true">
        <div className="staves">
          <StaffHandle
            singleLine={singleLine}
            zoom={1}
            room={1.4}
            onLayout={onLayout}
            onZoom={onZoom}
          />
        </div>
        <div className={`lanes lanes--${notes ? "full" : "keys"}`}>
          <div className="lane" />
        </div>
      </div>
    );
    await Promise.resolve();
  });
  const workspace = host.querySelector<HTMLElement>(".workspace-main");
  const staves = host.querySelector<HTMLElement>(".staves");
  const handle = host.querySelector<HTMLElement>(".layout-handle");
  if (!workspace || !staves || !handle) throw new Error("Missing staff handle");
  workspace.style.setProperty("--piano-staff-room", "600px");
  staves.getBoundingClientRect = () => new DOMRect(0, 0, 800, 200);
  handle.setPointerCapture = vi.fn();
  return handle;
}
function drag(handle: HTMLElement, distance: number) {
  act(() => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientY: 200 })
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: 200 + distance })
    );
  });
  expect(onLayout).not.toHaveBeenCalled();
  expect(onZoom).not.toHaveBeenCalled();
  act(() => {
    handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  });
}
it.each([
  { viewport: 1000, notes: true },
  { viewport: 1000, notes: false },
  { viewport: 375, notes: true },
  { viewport: 375, notes: false }
])(
  "uses the same single-line zoom gesture at $viewport px with notes=$notes, leaving key layout unchanged",
  async ({ viewport, notes }) => {
    vi.stubGlobal("innerHeight", viewport);
    for (const [distance, zoom] of [
      [100, 1.5],
      [500, 2],
      [-500, 0.5]
    ] as const) {
      onLayout.mockClear();
      onZoom.mockClear();
      const handle = await mount(notes);
      drag(handle, distance);
      expect(onZoom).toHaveBeenCalledExactlyOnceWith(zoom);
      expect(onLayout).not.toHaveBeenCalled();
      expect(handle.style.transform).toBe("");
    }
  }
);
it("keeps the wrapped staff share gesture", async () => {
  const handle = await mount(false, false);
  drag(handle, 100);
  expect(onLayout).toHaveBeenCalledOnce();
  const change = onLayout.mock.lastCall?.[0] as { staffShare: number };
  expect(change.staffShare).toBeCloseTo(300 / 1400);
  expect(onZoom).not.toHaveBeenCalled();
});

async function mountKeyboard(reference: boolean, nativeHeight?: number) {
  const placement = { ...USUAL_PLACEMENT, lift: 0.1 };
  const geometry = viewGeometry(
    300,
    40,
    { notes: false, keys: true, hands: false },
    false,
    false,
    placement,
    nativeHeight,
    reference ? 1000 : undefined
  );
  await act(async () => {
    root.render(
      <div className="workspace-main" data-piano-layout-reference={reference ? "true" : undefined}>
        <div className="lanes lanes--keys">
          <div className="lane">
            <KeysHandles
              layout={{ ...DEFAULT_SCREEN_LAYOUT, keysLift: placement.lift }}
              onLayout={onLayout}
            />
          </div>
        </div>
      </div>
    );
    await Promise.resolve();
  });
  const workspace = host.querySelector<HTMLElement>(".workspace-main");
  const lane = host.querySelector<HTMLElement>(".lane");
  if (!workspace || !lane) throw new Error("Missing keyboard pane");
  Object.defineProperty(workspace, "clientHeight", { value: 1000 });
  Object.defineProperty(lane, "clientHeight", { value: 300 });
  lane.style.setProperty("--hit-line", String(geometry.hitY) + "px");
  lane.style.setProperty(
    "--keys-bottom",
    String(geometry.keyboardTop + geometry.keyboardHeight) + "px"
  );
  lane.style.setProperty("--keys-height", String(geometry.keyboardHeight) + "px");
  return { lane, placement, geometry };
}
function moveKeyboard(handle: HTMLElement, distance: number) {
  handle.setPointerCapture = vi.fn();
  act(() => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 2, clientY: 200 })
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientY: 200 + distance })
    );
    handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2 }));
  });
}
it.each([undefined, 150])(
  "moves the keyboard by the actual drag pixels using workspace reference %s",
  async (nativeHeight) => {
    const { lane, placement, geometry } = await mountKeyboard(true, nativeHeight);
    const handle = lane.querySelector<HTMLElement>(".layout-handle--keys-top");
    if (!handle) throw new Error("Missing keyboard lift handle");
    moveKeyboard(handle, -20);
    const change = onLayout.mock.lastCall?.[0] as { keysLift: number };
    expect(change.keysLift).toBeCloseTo(0.12);
    const moved = viewGeometry(
      300,
      40,
      { notes: false, keys: true, hands: false },
      false,
      false,
      { ...placement, lift: change.keysLift },
      nativeHeight,
      1000
    );
    expect(moved.keyboardHeight).toBeCloseTo(geometry.keyboardHeight);
    expect(moved.keyboardTop).toBeCloseTo(geometry.keyboardTop - 20);
  }
);
it.each([undefined, 150])(
  "keeps the upper contact fixed when resizing the bottom with reference %s",
  async (nativeHeight) => {
    const { lane, placement, geometry } = await mountKeyboard(true, nativeHeight);
    const handle = lane.querySelector<HTMLElement>(".layout-handle--keys-bottom");
    if (!handle) throw new Error("Missing keyboard size handle");
    moveKeyboard(handle, 20);
    const change = onLayout.mock.lastCall?.[0] as { keysLift: number; keysScale: number };
    const resized = viewGeometry(
      300,
      40,
      { notes: false, keys: true, hands: false },
      false,
      false,
      { ...placement, lift: change.keysLift, scale: change.keysScale },
      nativeHeight,
      1000
    );
    expect(resized.keyboardHeight).toBeCloseTo(geometry.keyboardHeight + 20);
    expect(resized.keyboardTop).toBeCloseTo(geometry.keyboardTop);
    expect(resized.hitY).toBeCloseTo(geometry.hitY);
  }
);
it("retains the old local-height drag basis for unmarked course/typing/comparison panes", async () => {
  const { lane } = await mountKeyboard(false);
  const handle = lane.querySelector<HTMLElement>(".layout-handle--keys-top");
  if (!handle) throw new Error("Missing keyboard lift handle");
  moveKeyboard(handle, -20);
  expect(onLayout.mock.lastCall?.[0]).toEqual({ keysLift: 0.1 + 20 / 300 });
});
