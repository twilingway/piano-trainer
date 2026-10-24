// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
    freeDirectField: { height: 3, distance: 1, width: 8, shape: "convex" as const },
    freePerspectiveField: { height: 4, distance: 7, width: 12, shape: "concave" as const }
  };
  act(() => {
    root.render(<Harness prefs={prefs} />);
  });
  expect(settings.freeRoadLayout).toBe(prefs.freeDirectField);
  settings.onFreeRoadLayout({ height: 5 });
  expect(change).toHaveBeenLastCalledWith({
    freeDirectField: { ...prefs.freeDirectField, height: 5 }
  });
  act(() => {
    root.render(<Harness prefs={{ ...prefs, road: true }} />);
  });
  expect(settings.freeRoadLayout).toBe(prefs.freePerspectiveField);
  settings.onFreeRoadLayout({ width: 20 });
  expect(change).toHaveBeenLastCalledWith({
    freePerspectiveField: { ...prefs.freePerspectiveField, width: 20 }
  });
  expect(prefs.freeDirectField.height).toBe(3);
});
