// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CAMERA_PRESETS } from "../render/worldCamera";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "./staffPreferences";
import { useKeyboardSettings } from "./useKeyboardSettings";

let root: ReturnType<typeof createRoot>;
let settings: ReturnType<typeof useKeyboardSettings>;
const change = vi.fn();
const view = {
  keyRange: "song" as const,
  setKeyRange: vi.fn(),
  showLabels: false,
  setShowLabels: vi.fn()
};
function Harness({ prefs }: { readonly prefs: StaffPrefs }) {
  const current = useKeyboardSettings(view, prefs, change);
  useLayoutEffect(() => {
    settings = current;
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  change.mockClear();
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});
it("writes only the profile selected by note projection, retaining its other values", () => {
  const prefs = {
    ...DEFAULT_STAFF_PREFS,
    freeDirectField: { tilt: 30, length: 1, width: 8, shape: "convex" as const },
    freePerspectiveField: { tilt: 20, length: 7, width: 12, shape: "concave" as const }
  };
  act(() => {
    root.render(<Harness prefs={prefs} />);
  });
  expect(settings.freeRoadLayout).toBe(prefs.freeDirectField);
  settings.onFreeRoadLayout({ tilt: 45 });
  expect(change).toHaveBeenLastCalledWith({
    freeDirectField: { ...prefs.freeDirectField, tilt: 45 }
  });
  act(() => {
    root.render(<Harness prefs={{ ...prefs, road: true }} />);
  });
  expect(settings.freeRoadLayout).toBe(prefs.freePerspectiveField);
  settings.onFreeRoadLayout({ width: 20 });
  expect(change).toHaveBeenLastCalledWith({
    freePerspectiveField: { ...prefs.freePerspectiveField, width: 20 }
  });
  expect(prefs.freeDirectField.tilt).toBe(30);
});

it("retakes a button road fit when a camera preset is chosen, not when a slider moves", () => {
  const prefs = {
    ...DEFAULT_STAFF_PREFS,
    roadFit: "button" as const,
    camera: CAMERA_PRESETS.top,
    roadFitCamera: CAMERA_PRESETS.top
  };
  act(() => {
    root.render(<Harness prefs={prefs} />);
  });
  const player = { ...CAMERA_PRESETS.player, scale: 1.2 };
  settings.onCamera(player);
  expect(change).toHaveBeenLastCalledWith({ camera: player, roadFitCamera: player });
  const moved = { ...CAMERA_PRESETS.top, pitch: 80 };
  settings.onCamera(moved);
  expect(change).toHaveBeenLastCalledWith({ camera: moved });
  act(() => {
    root.render(<Harness prefs={{ ...prefs, roadFit: "auto" }} />);
  });
  settings.onCamera(player);
  expect(change).toHaveBeenLastCalledWith({ camera: player });
});
