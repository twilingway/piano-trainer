import { describe, expect, it } from "vitest";
import { normalizeStaffPrefs } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";
import { songCourseDisplayProfile } from "./songCourseDisplayProfile";

describe("responsive song course display", () => {
  it.each(["25", "49", "61", "88", "3oct", "4oct"] as const)(
    "honors the saved %s range on desktop without inheriting the forced reading range",
    (keyRange) => {
      const preferred = normalizeStaffPrefs({
        keyRange,
        keyStyle: "clay",
        freeCamera: true,
        performanceScene: true
      });
      const before = JSON.stringify(preferred);
      const display = readingDisplayProfile(preferred, true);
      expect(display.keyRange).toBe("song");
      const result = songCourseDisplayProfile({
        active: true,
        compact: false,
        preferred,
        display,
        learnerRange: [60, 72]
      });
      expect(result).toMatchObject({
        prefs: { keyRange, freeCamera: false, performanceScene: false },
        displayRange: undefined,
        keyboardMaxHeightShare: 0.3
      });
      expect(JSON.stringify(preferred)).toBe(before);
    }
  );

  it("uses a full desktop instrument for the saved song range without saving 88 keys", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "song" });
    const result = songCourseDisplayProfile({
      active: true,
      compact: false,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange: [60, 72]
    });
    expect(result.prefs.keyRange).toBe("88");
    expect(result.displayRange).toBeUndefined();
    expect(result.keyboardMaxHeightShare).toBe(0.3);
    expect(preferred.keyRange).toBe("song");
  });

  it("uses only the learner range on compact screens despite a wider saved instrument", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "88" });
    const learnerRange = [60, 72] as const;
    const result = songCourseDisplayProfile({
      active: true,
      compact: true,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange
    });
    expect(result.prefs.keyRange).toBe("song");
    expect(result.displayRange).toBe(learnerRange);
    expect(preferred.keyRange).toBe("88");
  });

  it.each(["clay", "3d", "classic", "arcade"] as const)(
    "keeps the selected %s keyboard available in both course layouts",
    (keyStyle) => {
      const preferred = normalizeStaffPrefs({ keyStyle });
      for (const compact of [true, false])
        expect(
          songCourseDisplayProfile({
            active: true,
            compact,
            preferred,
            display: readingDisplayProfile(preferred, true),
            learnerRange: [60, 72]
          }).prefs.keyStyle
        ).toBe(keyStyle);
    }
  );

  it("returns the ordinary or legacy display unchanged after leaving the song course", () => {
    const preferred = normalizeStaffPrefs({
      keyRange: "49",
      keyStyle: "3d",
      freeCamera: true,
      performanceScene: true
    });
    for (const display of [preferred, readingDisplayProfile(preferred, true)]) {
      const result = songCourseDisplayProfile({
        active: false,
        compact: true,
        preferred,
        display,
        learnerRange: undefined
      });
      expect(result.prefs).toBe(display);
      expect(result.displayRange).toBeUndefined();
      expect(result.keyboardMaxHeightShare).toBeUndefined();
    }
  });
});
