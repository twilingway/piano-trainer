// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { AUTO_OUTPUT_CHOICE } from "../input/midiOutput";
import { loadPreferences, PREFERENCE_KEYS } from "./preferencePersistence";

const load = (values: Record<string, string> = {}) =>
  loadPreferences({ getItem: (key) => values[key] ?? null, setItem: () => undefined }).preferences;

describe("new piano defaults", () => {
  it("hydrates an empty installation as 3D, both devices, and automatic MIDI output", () => {
    const prefs = load();
    expect(prefs.staff.keyStyle).toBe("3d");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("3d");
    expect(prefs.melodyOutput).toEqual({ mode: "both", channel: 1 });
    expect(prefs.midiOutput).toEqual(AUTO_OUTPUT_CHOICE);
    expect(prefs.instrumentProfiles.profileId).toBe("grace-bp-300");
    expect(prefs.instrumentProfiles.instrumentId).toBeNull();
  });

  it("keeps an existing view, camera, browser route, and explicitly disabled MIDI", () => {
    const prefs = load({
      [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle: "arcade", camera: { fov: 60 } }),
      [PREFERENCE_KEYS.melodyOutput]: JSON.stringify({ mode: "browser", channel: 2 }),
      [PREFERENCE_KEYS.midiOutput]: "null"
    });
    expect(prefs.staff.keyStyle).toBe("arcade");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("arcade");
    expect(prefs.staff.camera.fov).toBe(60);
    expect(prefs.melodyOutput).toEqual({ mode: "browser", channel: 2 });
    expect(prefs.midiOutput).toBeNull();
  });
});
