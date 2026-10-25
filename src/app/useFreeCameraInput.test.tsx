// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FREE_CAMERA_CODES } from "../input/freeCameraMovement";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "./staffPreferences";
import { useFreeCameraInput } from "./useFreeCameraInput";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let result: ReturnType<typeof useFreeCameraInput>;
const options = { bindings: {} };
const enabledPrefs = { ...DEFAULT_STAFF_PREFS, freeCamera: true, freeCameraWasd: true };
function Harness({ prefs, blocked }: { readonly prefs: StaffPrefs; readonly blocked: boolean }) {
  const current = useFreeCameraInput(prefs, options, blocked);
  useLayoutEffect(() => {
    result = current;
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});
it("reserves WASD only in the effective free view and restores normal input after a menu", () => {
  act(() => {
    root.render(<Harness prefs={enabledPrefs} blocked={false} />);
  });
  expect(result.enabled).toBe(true);
  expect(result.keyboard.reservedCodes).toBe(FREE_CAMERA_CODES);
  act(() => {
    root.render(<Harness prefs={enabledPrefs} blocked />);
  });
  expect(result.enabled).toBe(false);
  expect(result.keyboard.blocked).toBe(true);
  expect(result.keyboard.reservedCodes).toBeUndefined();
  act(() => {
    root.render(<Harness prefs={enabledPrefs} blocked={false} />);
  });
  expect(result.enabled).toBe(true);
});
it.each<Partial<StaffPrefs>>([
  { freeCamera: false },
  { freeCameraWasd: false },
  { keyStyle: "arcade" },
  { keyStyle: "classic" },
  { keys: false },
  { performanceScene: true }
])("does not steal piano keys for an inactive camera %j", (change) => {
  act(() => {
    root.render(<Harness prefs={{ ...enabledPrefs, ...change }} blocked={false} />);
  });
  expect(result.enabled).toBe(false);
  expect(result.keyboard).toBe(options);
});

it.each([
  ["game", false],
  ["free", true]
] as const)("reserves WASD according to composition %s", (cameraComposition, enabled) => {
  act(() => {
    root.render(
      <Harness prefs={{ ...enabledPrefs, freeCamera: false, cameraComposition }} blocked={false} />
    );
  });
  expect(result.enabled).toBe(enabled);
  expect(result.keyboard.reservedCodes).toBe(enabled ? FREE_CAMERA_CODES : undefined);
});

it("keeps WASD reserved while a nonstandard free world is visible without keys", () => {
  act(() => {
    root.render(
      <Harness
        prefs={{
          ...enabledPrefs,
          freeCamera: false,
          cameraComposition: "free",
          keys: false,
          lane: true
        }}
        blocked={false}
      />
    );
  });
  expect(result.enabled).toBe(true);
  expect(result.keyboard.reservedCodes).toBe(FREE_CAMERA_CODES);
  act(() => {
    root.render(
      <Harness
        prefs={{
          ...enabledPrefs,
          freeCamera: false,
          cameraComposition: "free",
          keys: false,
          lane: false
        }}
        blocked={false}
      />
    );
  });
  expect(result.enabled).toBe(false);
  expect(result.keyboard.reservedCodes).toBeUndefined();
});
