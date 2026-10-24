// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { setInterfaceLanguage } from "./interfaceLanguage";
import { useInstrumentProfiles } from "./useInstrumentProfiles";
import example from "../../public/examples/piano-instruments.json";
import inlineExample from "../input/pianoInstrumentsExample.json";
import { parsePianoProfile } from "../input/instrumentProfiles";

let root: Root;
let store: AppStore;
let controls: ReturnType<typeof useInstrumentProfiles>;
function Harness() {
  const current = useInstrumentProfiles();
  useLayoutEffect(() => {
    controls = current;
  });
  return null;
}
function file(text: string): File {
  return { size: new TextEncoder().encode(text).length, text: () => Promise.resolve(text) } as File;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  localStorage.clear();
  store = createAppStore();
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(withTestStore(<Harness />, store));
    await Promise.resolve();
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
    setInterfaceLanguage("ru");
  });
  vi.unstubAllGlobals();
});

it("imports the shipped example as a separate profile and persists its name and selection", async () => {
  expect(inlineExample).toEqual(example);
  expect(parsePianoProfile(JSON.stringify(example)).ok).toBe(true);
  expect(controls.profile?.name).toBe("Grace BP-300");
  await act(async () => controls.onImport(file(JSON.stringify(example))));
  const id = controls.profileId;
  expect(id).not.toBe("grace-bp-300");
  expect(controls.profiles).toHaveLength(2);
  expect(controls.profile?.instruments).toHaveLength(3);
  expect(controls.instrumentId).toBeNull();
  act(() => {
    controls.onName("  My Stage Piano  ");
    controls.onInstrument("pan-flute");
  });
  expect(controls.profile?.name).toBe("My Stage Piano");
  expect(controls.instrumentId).toBe("pan-flute");
  const reloaded = createAppStore().getState().preferences.instrumentProfiles;
  expect(reloaded.profileId).toBe(id);
  expect(reloaded.instrumentId).toBe("pan-flute");
  expect(reloaded.customProfiles[0]?.name).toBe("My Stage Piano");
});

it("keeps all existing data on invalid import and translates its error after a language change", async () => {
  const before = store.getState().preferences;
  await act(async () =>
    controls.onImport(file('{"name":"Broken","instruments":[{"name":"Bad","program":176}]}'))
  );
  expect(store.getState().preferences).toBe(before);
  expect(controls.error).toContain("от 0 до 127");
  act(() => {
    setInterfaceLanguage("en");
  });
  expect(controls.error).toContain("from 0 to 127");
});

it("retains both copies when the same profile is imported twice", async () => {
  await act(async () => controls.onImport(file(JSON.stringify(example))));
  const first = controls.profileId;
  await act(async () => controls.onImport(file(JSON.stringify(example))));
  expect(controls.profiles).toHaveLength(3);
  expect(controls.profileId).not.toBe(first);
  expect(controls.profiles.some((profile) => profile.id === first)).toBe(true);
});

it("renames the built-in profile locally and refuses unmapped or nonexistent instruments", () => {
  act(() => {
    controls.onName("My Grace");
    controls.onInstrument("voice-176");
  });
  expect(controls.profile?.name).toBe("My Grace");
  expect(controls.instrumentId).toBeNull();
  act(() => {
    controls.onInstrument("voice-075");
  });
  expect(controls.instrumentId).toBe("voice-075");
  act(() => {
    controls.onInstrument("missing");
  });
  expect(controls.instrumentId).toBe("voice-075");
  act(() => {
    controls.onName(" ");
  });
  expect(controls.profile?.name).toBe("My Grace");
  expect(controls.error).toContain("от 1 до 120");
});

it("persists an explicit no-profile selection and ignores name or sound changes without a profile", () => {
  act(() => {
    controls.onInstrument("voice-075");
  });
  expect(controls.instrumentId).toBe("voice-075");
  act(() => {
    controls.onProfile(null);
  });
  expect(controls.profileId).toBeNull();
  expect(controls.profile).toBeUndefined();
  expect(controls.instrumentId).toBeNull();
  act(() => {
    controls.onName("Ignored name");
    controls.onInstrument("voice-075");
  });
  const saved = createAppStore().getState().preferences.instrumentProfiles;
  expect(saved.profileId).toBeNull();
  expect(saved.instrumentId).toBeNull();
  expect(saved.graceName).toBeUndefined();
  act(() => {
    controls.onProfile("grace-bp-300");
  });
  expect(controls.profile?.name).toBe("Grace BP-300");
  expect(controls.instrumentId).toBeNull();
});

it("cancels a pending import when settings unmount", async () => {
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let job!: Promise<void>;
  act(() => {
    job = controls.onImport({ size: 10, text: () => pending } as File);
  });
  expect(controls.importing).toBe(true);
  act(() => {
    root.unmount();
  });
  await act(async () => {
    finish(JSON.stringify(example));
    await job;
  });
  expect(store.getState().preferences.instrumentProfiles.customProfiles).toHaveLength(0);
});

it("rejects an oversized file before reading it", async () => {
  const text = vi.fn(() => Promise.resolve("{}"));
  await act(async () => controls.onImport({ size: 1024 * 1024 + 1, text } as unknown as File));
  expect(text).not.toHaveBeenCalled();
  expect(controls.error).toContain("1 МиБ");
  expect(controls.importing).toBe(false);
});
