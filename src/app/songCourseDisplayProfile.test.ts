import { describe, expect, it } from "vitest";
import { normalizeStaffPrefs } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";
import { songCourseDisplayProfile } from "./songCourseDisplayProfile";

describe("responsive song course display", () => {
  it.each(["25", "49", "61", "88", "3oct", "4oct"] as const)(
    "honors the saved %s desktop range without changing persisted preferences",
    (keyRange) => {
      const preferred = normalizeStaffPrefs({
        keyRange,
        keyStyle: "clay",
        freeCamera: true,
        performanceScene: true
      });
      const before = JSON.stringify(preferred);
      const profile = songCourseDisplayProfile({
        active: true,
        compact: false,
        preferred,
        display: readingDisplayProfile(preferred, true),
        learnerRange: [60, 72]
      });
      expect(profile.prefs).toMatchObject({
        keyRange,
        keyStyle: "classic",
        freeCamera: false,
        performanceScene: false
      });
      expect(profile.displayRange).toBeUndefined();
      expect(profile.keyboardMaxHeightShare).toBe(0.36);
      expect(JSON.stringify(preferred)).toBe(before);
    }
  );

  it("uses the full desktop instrument for the saved song range without saving 88 keys", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "song" });
    const profile = songCourseDisplayProfile({
      active: true,
      compact: false,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange: [60, 72]
    });
    expect(profile.prefs.keyRange).toBe("88");
    expect(profile.displayRange).toBeUndefined();
    expect(preferred.keyRange).toBe("song");
  });

  it("keeps the learner's large compact keyboard range despite a saved full instrument", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "88" });
    const range = [60, 72] as const;
    const profile = songCourseDisplayProfile({
      active: true,
      compact: true,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange: range
    });
    expect(profile.prefs.keyRange).toBe("song");
    expect(profile.displayRange).toBe(range);
    expect(profile.keyboardMaxHeightShare).toBe(0.36);
    expect(preferred.keyRange).toBe("88");
  });

  it.each([
    ["clay", "classic"],
    ["3d", "classic"],
    ["classic", "classic"],
    ["arcade", "arcade"]
  ] as const)("uses %s as %s only inside the course on every viewport", (saved, effective) => {
    const preferred = normalizeStaffPrefs({
      keyStyle: saved,
      camera: { pitch: 60 },
      keyboardOrientation: "follow"
    });
    const before = JSON.stringify(preferred);
    const display = readingDisplayProfile(preferred, true);
    for (const compact of [false, true])
      for (const shortViewport of [false, true]) {
        const profile = songCourseDisplayProfile({
          active: true,
          compact,
          shortViewport,
          preferred,
          display,
          learnerRange: [60, 72]
        });
        expect(profile.prefs.keyStyle).toBe(effective);
        expect(profile.prefs.camera).toBe(display.camera);
        expect(profile.prefs.keyboardOrientation).toBe(display.keyboardOrientation);
      }
    expect(JSON.stringify(preferred)).toBe(before);
  });

  it.each(["clay", "3d", "classic", "arcade"] as const)(
    "restores the exact %s ordinary or legacy display object when the course exits",
    (keyStyle) => {
      const preferred = normalizeStaffPrefs({
        keyRange: "49",
        keyStyle,
        freeCamera: true,
        performanceScene: true
      });
      for (const display of [preferred, readingDisplayProfile(preferred, true)]) {
        const profile = songCourseDisplayProfile({
          active: false,
          compact: true,
          shortViewport: true,
          preferred,
          display,
          learnerRange: undefined
        });
        expect(profile.prefs).toBe(display);
        expect(profile.displayRange).toBeUndefined();
        expect(profile.keyboardMaxHeightShare).toBeUndefined();
      }
    }
  );
});
