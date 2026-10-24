import { describe, expect, it } from "vitest";
import { FlatEffectSettings } from "./flatEffectSettings";

const combinations = Array.from({ length: 8 }, (_, mask) => ({
  burning: (mask & 1) !== 0,
  presses: (mask & 2) !== 0,
  musicalNotes: (mask & 4) !== 0
}));

describe("independent animation preferences", () => {
  it.each(combinations)("applies %j unchanged to all three views", (options) => {
    const settings = new FlatEffectSettings();
    settings.set(options.burning, options.presses, options.musicalNotes);
    expect(settings.current()).toEqual(options);
  });
});

it("masks only a hidden play zone without mutating saved animation preferences", () => {
  const settings = new FlatEffectSettings();
  settings.set(true, false, true);
  expect(settings.current(false)).toEqual({ burning: false, presses: false, musicalNotes: false });
  expect(settings.current(true)).toEqual({ burning: true, presses: false, musicalNotes: true });
});
