// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readingDisplayProfile } from "./readingProfile";
import { normalizeStaffPrefs } from "./staffPreferences";
import {
  COMPACT_SONG_COURSE_QUERY,
  useSongCourseDisplayProfile
} from "./useSongCourseDisplayProfile";

let host: HTMLDivElement;
let root: Root;
let width: number;
const listeners = new Set<() => void>();
const preferred = normalizeStaffPrefs({ keyRange: "49", keyStyle: "3d", freeCamera: true });
const display = readingDisplayProfile(preferred, true);
const learnerRange = [60, 72] as const;
let mounts = 0;
function Harness({ active = true }: { readonly active?: boolean }) {
  const [identity] = useState(() => ++mounts);
  const profile = useSongCourseDisplayProfile({ active, preferred, display, learnerRange });
  return (
    <output
      data-identity={identity}
      data-range={profile.prefs.keyRange}
      data-style={profile.prefs.keyStyle}
      data-low={profile.displayRange?.[0]}
      data-high={profile.displayRange?.[1]}
      data-height-share={profile.keyboardMaxHeightShare}
    />
  );
}

function readOutput(): HTMLOutputElement {
  const output = host.querySelector("output");
  if (!output) throw new Error("Missing display profile output");
  return output;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  width = 1024;
  mounts = 0;
  listeners.clear();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    expect(query).toBe(COMPACT_SONG_COURSE_QUERY);
    return {
      get matches() {
        return width <= 1024;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
    } as unknown as MediaQueryList;
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("switches 1024 to 1025 and back without remounting the course or changing saved preferences", async () => {
  const before = JSON.stringify(preferred);
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  const output = readOutput();
  expect(output.dataset).toMatchObject({
    range: "song",
    low: "60",
    high: "72",
    heightShare: "0.3"
  });
  const identity = output.dataset.identity;
  expect(listeners.size).toBe(1);
  await act(async () => {
    width = 1025;
    for (const listener of listeners) listener();
    await Promise.resolve();
  });
  expect(output.dataset).toMatchObject({ range: "49", style: "3d", heightShare: "0.3" });
  expect(output.dataset.low).toBeUndefined();
  expect(output.dataset.high).toBeUndefined();
  expect(output.dataset.identity).toBe(identity);
  await act(async () => {
    width = 667;
    for (const listener of listeners) listener();
    await Promise.resolve();
  });
  expect(output.dataset).toMatchObject({ range: "song", low: "60", high: "72" });
  expect(output.dataset.identity).toBe(identity);
  expect(mounts).toBe(1);
  expect(JSON.stringify(preferred)).toBe(before);
});

it("removes its listener and stops overriding the legacy view when the course exits", async () => {
  await act(async () => {
    width = 1920;
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(host.querySelector("output")?.dataset.range).toBe("49");
  await act(async () => {
    root.render(<Harness active={false} />);
    await Promise.resolve();
  });
  const output = readOutput();
  expect(output.dataset.range).toBe(display.keyRange);
  expect(output.dataset.style).toBe(display.keyStyle);
  expect(output.dataset.heightShare).toBeUndefined();
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  expect(listeners.size).toBe(0);
  root = createRoot(host);
});
